import { tokenize, type Token } from './tokenize';
import {
  AlgorithmSyntaxError,
  type Algorithm,
  type AlgorithmNode,
  type AlgorithmSyntaxErrorDetail,
  type SyntaxErrorReason,
} from './types';

/** Shared because two paths reach the same condition — see `parseBracket`. */
const UNCLOSED_BRACKET: AlgorithmSyntaxErrorDetail = {
  reason: 'unclosed-bracket',
  length: 1,
  char: '[',
};

/**
 * A recursive-descent parser over the token list.
 *
 * The grammar is small enough to state in full:
 *
 * ```
 * algorithm  := node*
 * node       := move | pause | group | bracket
 * group      := "(" algorithm ")" amount?
 * bracket    := "[" algorithm ( "," | ":" ) algorithm "]" amount?
 * ```
 *
 * `bracket` covers both the commutator (`,`) and the conjugate (`:`), and
 * which one it is cannot be known when the `[` is read — the separator can be
 * arbitrarily far away, past any amount of nesting. So the parser reads the
 * first half until it meets a separator *at its own depth* and decides then.
 * Committing on the `[` is the obvious wrong turn here.
 */
export function parseAlgorithm(input: string): Algorithm {
  const tokens = tokenize(input);
  const parser = new Parser(input, tokens);
  const algorithm = parser.parseNodes();
  parser.expectEnd();
  return algorithm;
}

/**
 * The result of {@link validateAlgorithm} — the one place in this layer where a
 * discriminated union is the right shape, because `valid` is a genuine
 * discriminant on a plain object rather than a property bolted to an `Error`.
 */
export type AlgorithmValidation =
  | { readonly valid: true; readonly algorithm: Algorithm }
  | { readonly valid: false; readonly error: AlgorithmSyntaxError };

/**
 * Ask whether a string is valid notation **without** a `try`/`catch`.
 *
 * `parseAlgorithm` still throws, unchanged, and stays the right call for a
 * caller who wants the algorithm and considers invalid input exceptional. This
 * is for the other calling context: validating a text field on every keystroke,
 * where invalid-while-typing is the *normal* state and an exception per
 * keypress is control flow rather than an error. Every consumer doing that was
 * writing the same wrapper, so the wrapper ships here.
 *
 * Three things worth knowing:
 *
 * - **The valid arm returns the tree**, identical to what `parseAlgorithm`
 *   would have returned, so a caller that validates and then parses does not
 *   tokenize twice.
 * - **The invalid arm carries the `AlgorithmSyntaxError` instance**, not a
 *   flattened copy of it. After v0.11 the instance already holds everything a
 *   message needs (`reason`, `offset`, `length`, `input` and the interpolation
 *   data), and a plain object would only buy structured-clone friendliness that
 *   this package — which has no Workers, deliberately — cannot use.
 * - **Empty input is valid**, agreeing with `parseAlgorithm('')`, which returns
 *   the empty algorithm rather than throwing. So is whitespace, and so is a
 *   string of nothing but comments. Consumers read "empty means no algorithm",
 *   and a disagreement between the two entry points here would be worse than
 *   either answer.
 *
 * 🔴 It narrows on `AlgorithmSyntaxError` and **re-throws everything else**. A
 * `TypeError` or a `RangeError` from inside the parser is a bug in this
 * package; converting one into `{ valid: false }` would report a library defect
 * as a user's typo and make it undebuggable.
 *
 * There is deliberately no `isValidAlgorithm(): boolean` beside this. A boolean
 * throws away the offset and the reason — the entire point — and would invite
 * the lazy call site. A caller who wants one writes `validateAlgorithm(x).valid`.
 */
export function validateAlgorithm(input: string): AlgorithmValidation {
  try {
    return { valid: true, algorithm: parseAlgorithm(input) };
  } catch (error) {
    if (error instanceof AlgorithmSyntaxError) return { valid: false, error };
    throw error;
  }
}

class Parser {
  private index = 0;

  constructor(
    private readonly input: string,
    private readonly tokens: readonly Token[],
  ) {}

  /**
   * Reads nodes until something that cannot start one.
   *
   * Note what it does *not* do: throw. A token that cannot start a node simply
   * ends the list, and whoever asked for the list decides whether that token
   * was a legitimate terminator or an error. That keeps every "unexpected X"
   * message with the caller that knows what it was expecting, instead of
   * splitting them between here and three call sites.
   */
  parseNodes(): Algorithm {
    const nodes: AlgorithmNode[] = [];
    for (;;) {
      const token = this.peek();
      if (token === undefined) break;
      const node = this.parseNode(token);
      if (node === null) break;
      nodes.push(node);
    }
    return { nodes };
  }

  private parseNode(token: Token): AlgorithmNode | null {
    switch (token.kind) {
      case 'move':
        this.index += 1;
        return token.move!;
      case 'pause':
        this.index += 1;
        return { type: 'pause' };
      case 'open-group':
        return this.parseGroup();
      case 'open-bracket':
        return this.parseBracket();
      default:
        return null;
    }
  }

  private parseGroup(): AlgorithmNode {
    const open = this.next()!;
    const body = this.parseNodes();
    const close = this.peek();
    if (close?.kind !== 'close-group') {
      throw new AlgorithmSyntaxError(this.input, open.offset, 'unclosed "("', {
        reason: 'unclosed-group',
        length: 1,
        char: '(',
      });
    }
    this.index += 1;
    if (body.nodes.length === 0) {
      throw new AlgorithmSyntaxError(this.input, open.offset, 'an empty group does nothing', {
        reason: 'empty-group',
        // The whole `()`, whitespace and comments included — an empty group is
        // a property of the pair, not of either bracket.
        length: close.offset - open.offset + 1,
      });
    }
    return { type: 'group', body, amount: this.readTrailingAmount() };
  }

  private parseBracket(): AlgorithmNode {
    const open = this.next()!;
    const a = this.parseNodes();
    const separator = this.peek();

    if (separator === undefined || separator.kind === 'close-bracket') {
      throw new AlgorithmSyntaxError(
        this.input,
        open.offset,
        'a bracket needs a "," (commutator) or ":" (conjugate)',
        { reason: 'bracket-missing-separator', length: 1, char: '[' },
      );
    }
    if (separator.kind !== 'comma' && separator.kind !== 'colon') {
      throw new AlgorithmSyntaxError(this.input, open.offset, 'unclosed "["', UNCLOSED_BRACKET);
    }
    this.index += 1;

    const b = this.parseNodes();
    const close = this.peek();
    if (close === undefined) {
      // The same condition as above — a `[` that never closes — reached down a
      // second path, so deliberately the same code rather than two.
      throw new AlgorithmSyntaxError(this.input, open.offset, 'unclosed "["', UNCLOSED_BRACKET);
    }
    if (close.kind !== 'close-bracket') {
      throw new AlgorithmSyntaxError(
        this.input,
        close.offset,
        'a bracket takes exactly one "," or ":"',
        {
          reason: 'bracket-extra-separator',
          length: 1,
          char: this.input.charAt(close.offset),
        },
      );
    }
    this.index += 1;

    if (a.nodes.length === 0 || b.nodes.length === 0) {
      throw new AlgorithmSyntaxError(
        this.input,
        open.offset,
        'both halves of a bracket must be non-empty',
        { reason: 'bracket-empty-half', length: close.offset - open.offset + 1 },
      );
    }

    const amount = this.readTrailingAmount();
    return separator.kind === 'comma'
      ? { type: 'commutator', a, b, amount }
      : { type: 'conjugate', a, b, amount };
  }

  /** The `2`, `'` or `2'` that may follow a `)` or `]`. Absent means 1. */
  private readTrailingAmount(): number {
    const token = this.peek();
    if (token?.kind !== 'amount') return 1;
    this.index += 1;
    return token.amount!;
  }

  expectEnd(): void {
    const token = this.peek();
    if (token === undefined) return;
    const stray = describeStray(token, this.input);
    throw new AlgorithmSyntaxError(this.input, token.offset, stray.message, {
      reason: stray.reason,
      length: 1,
      char: this.input.charAt(token.offset),
    });
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private next(): Token | undefined {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }
}

/**
 * The message *and* the code for a token left over at the end of the input.
 *
 * It returns both because one call site produces five different codes, and
 * because the message must keep its exact 0.10.0 wording — deriving the message
 * from the code would couple the two and make the English a function of the
 * machine-readable value, which is the coupling this whole API exists to break.
 *
 * `stray-comma` and `stray-colon` are enumerated rather than folded into
 * `unexpected-token`: they are the only two cases the parser actually produces
 * here, and a consumer that knows a comma is stray can say *"a `,` only belongs
 * inside `[A, B]`"* where a catch-all can only repeat the character back.
 */
function describeStray(
  token: Token,
  input: string,
): { message: string; reason: SyntaxErrorReason } {
  switch (token.kind) {
    case 'close-group':
      return { message: 'unmatched ")"', reason: 'unmatched-close-group' };
    case 'close-bracket':
      return { message: 'unmatched "]"', reason: 'unmatched-close-bracket' };
    case 'comma':
      return { message: `unexpected "${input[token.offset]}"`, reason: 'stray-comma' };
    case 'colon':
      return { message: `unexpected "${input[token.offset]}"`, reason: 'stray-colon' };
    default:
      return { message: `unexpected "${input[token.offset]}"`, reason: 'unexpected-token' };
  }
}
