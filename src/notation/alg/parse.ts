import { tokenize, type Token } from './tokenize';
import { AlgorithmSyntaxError, type Algorithm, type AlgorithmNode } from './types';

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
    if (this.peek()?.kind !== 'close-group') {
      throw new AlgorithmSyntaxError(this.input, open.offset, 'unclosed "("');
    }
    this.index += 1;
    if (body.nodes.length === 0) {
      throw new AlgorithmSyntaxError(this.input, open.offset, 'an empty group does nothing');
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
      );
    }
    if (separator.kind !== 'comma' && separator.kind !== 'colon') {
      throw new AlgorithmSyntaxError(this.input, open.offset, 'unclosed "["');
    }
    this.index += 1;

    const b = this.parseNodes();
    const close = this.peek();
    if (close === undefined) {
      throw new AlgorithmSyntaxError(this.input, open.offset, 'unclosed "["');
    }
    if (close.kind !== 'close-bracket') {
      throw new AlgorithmSyntaxError(
        this.input,
        close.offset,
        'a bracket takes exactly one "," or ":"',
      );
    }
    this.index += 1;

    if (a.nodes.length === 0 || b.nodes.length === 0) {
      throw new AlgorithmSyntaxError(
        this.input,
        open.offset,
        'both halves of a bracket must be non-empty',
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
    throw new AlgorithmSyntaxError(this.input, token.offset, describeStray(token, this.input));
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

function describeStray(token: Token, input: string): string {
  switch (token.kind) {
    case 'close-group':
      return 'unmatched ")"';
    case 'close-bracket':
      return 'unmatched "]"';
    default:
      return `unexpected "${input[token.offset]}"`;
  }
}
