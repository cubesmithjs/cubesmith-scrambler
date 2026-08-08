import {
  AlgorithmSyntaxError,
  FACE_FAMILIES,
  ROTATION_FAMILIES,
  SLICE_FAMILIES,
  type MoveFamily,
  type MoveNode,
} from './types';

/**
 * The tokenizer. Turns a string into a flat list of tokens with offsets; all
 * nesting is the parser's problem.
 *
 * ## Two things that make this more than a regex sweep
 *
 * 1. **A number means different things in different places.** `2` opens a
 *    layer range in `2-3Rw`, but is a repetition count in `(R U)2`. The two are
 *    told apart by what came before: an amount can only follow a `)` or a `]`.
 *    So the tokenizer tracks the previous token rather than scanning
 *    context-free — stated here because a context-sensitive tokenizer is a
 *    thing a reader is entitled to be surprised by.
 * 2. **`[` does not say which construct it opens.** `[A, B]` is a commutator
 *    and `[A: B]` a conjugate, and the separator that decides it can be
 *    arbitrarily far away. That is left to the parser, which simply reads until
 *    it meets one.
 *
 * ## What is skipped
 *
 * Whitespace, including newlines — a multi-line algorithm is one algorithm.
 * And `//` line comments, which are **discarded rather than represented**: a
 * comment is not part of what an algorithm does, so it is accepted on input and
 * lost on output. That is a deliberate asymmetry and the one place this layer
 * is not round-trip faithful.
 */

export type TokenKind =
  | 'move'
  | 'pause'
  | 'open-group'
  | 'close-group'
  | 'open-bracket'
  | 'close-bracket'
  | 'comma'
  | 'colon'
  | 'amount';

export interface Token {
  readonly kind: TokenKind;
  readonly offset: number;
  /** Present on `move` tokens only. */
  readonly move: MoveNode | null;
  /** Present on `amount` tokens only — the repetition following a `)` or `]`. */
  readonly amount: number | null;
}

const FAMILY_BY_LOWERCASE: Readonly<Record<string, MoveFamily>> = {
  u: 'U',
  d: 'D',
  f: 'F',
  b: 'B',
  l: 'L',
  r: 'R',
};

const ALL_FAMILIES = new Set<string>([
  ...FACE_FAMILIES,
  ...SLICE_FAMILIES,
  ...ROTATION_FAMILIES,
]);

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const push = (kind: TokenKind, offset: number, move: MoveNode | null, amount: number | null) => {
    tokens.push({ kind, offset, move, amount });
  };

  const previousKind = (): TokenKind | undefined => tokens[tokens.length - 1]?.kind;

  while (i < input.length) {
    const char = input[i]!;

    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    if (char === '/' && input[i + 1] === '/') {
      while (i < input.length && input[i] !== '\n') i += 1;
      continue;
    }

    switch (char) {
      case '(':
        push('open-group', i, null, null);
        i += 1;
        continue;
      case ')':
        push('close-group', i, null, null);
        i += 1;
        continue;
      case '[':
        push('open-bracket', i, null, null);
        i += 1;
        continue;
      case ']':
        push('close-bracket', i, null, null);
        i += 1;
        continue;
      case ',':
        push('comma', i, null, null);
        i += 1;
        continue;
      case ':':
        push('colon', i, null, null);
        i += 1;
        continue;
      case '.':
        push('pause', i, null, null);
        i += 1;
        continue;
      default:
        break;
    }

    // An amount attached to the construct that just closed — the one
    // context-sensitive decision in this tokenizer.
    const previous = previousKind();
    if (
      (previous === 'close-group' || previous === 'close-bracket') &&
      (isDigit(char) || char === "'")
    ) {
      const start = i;
      i = readAmount(input, i);
      push('amount', start, null, amountValue(input, start, i));
      continue;
    }

    const start = i;
    const [move, next] = readMove(input, i);
    push('move', start, move, null);
    i = next;
  }

  return tokens;
}

/** Consumes `\d*'?` and returns the offset just past it. */
function readAmount(input: string, from: number): number {
  let i = from;
  while (i < input.length && isDigit(input[i]!)) i += 1;
  if (input[i] === "'") i += 1;
  return i;
}

/** Interprets the text of an amount: `""` is 1, `2` is 2, `'` is -1, `2'` is -2. */
function amountValue(input: string, from: number, to: number): number {
  const text = input.slice(from, to);
  const inverted = text.endsWith("'");
  const digits = inverted ? text.slice(0, -1) : text;
  if (digits === '') return inverted ? -1 : 1;
  const magnitude = Number(digits);
  if (magnitude === 0) {
    throw new AlgorithmSyntaxError(input, from, 'an amount of 0 does nothing', {
      reason: 'amount-zero',
      length: to - from,
    });
  }
  return inverted ? -magnitude : magnitude;
}

/**
 * Reads one move token, returning it and the offset just past it.
 *
 * The layer prefix is the fiddly part. `3Rw` and `2-3Rw` both describe a block;
 * a bare `3R` does not, and is rejected for the same reason
 * `nxn/notation.ts`'s `parseWideMove` rejects it — a layer count without a `w`
 * is not wide-move notation, it is a typo that would otherwise parse.
 */
function readMove(input: string, from: number): [MoveNode, number] {
  let i = from;

  let outerLayer: number | null = null;
  let innerLayer: number | null = null;

  if (isDigit(input[i]!)) {
    const firstStart = i;
    while (i < input.length && isDigit(input[i]!)) i += 1;
    const first = Number(input.slice(firstStart, i));
    if (input[i] === '-') {
      i += 1;
      const secondStart = i;
      while (i < input.length && isDigit(input[i]!)) i += 1;
      if (secondStart === i) {
        throw new AlgorithmSyntaxError(input, secondStart, 'a layer range needs a second number', {
          reason: 'layer-range-incomplete',
          // Nothing to underline — the number was never written. The offset is
          // where it should have gone.
          length: 0,
        });
      }
      const second = Number(input.slice(secondStart, i));
      if (first < 1 || second <= first) {
        throw new AlgorithmSyntaxError(
          input,
          firstStart,
          `layer range ${first}-${second} must count outwards-in, starting at 1 or more`,
          {
            reason: 'layer-range-not-ascending',
            length: i - firstStart,
            outer: first,
            inner: second,
          },
        );
      }
      outerLayer = first;
      innerLayer = second;
    } else {
      if (first < 2) {
        throw new AlgorithmSyntaxError(
          input,
          firstStart,
          `a block of ${first} layer(s) is not a wide move`,
          { reason: 'layer-count-too-small', length: i - firstStart, count: first },
        );
      }
      innerLayer = first;
    }
  }

  const familyChar = input[i];
  if (familyChar === undefined) {
    // Reported at the start of the token, not at the end of the input: for
    // `Rw'2` the digit is the mistake, and pointing past it would send a
    // reader looking at nothing.
    throw new AlgorithmSyntaxError(input, from, 'expected a move after a layer prefix', {
      reason: 'layer-prefix-without-move',
      length: i - from,
    });
  }

  const lowercaseFamily = FAMILY_BY_LOWERCASE[familyChar];
  let family: MoveFamily;
  let wide = false;

  if (lowercaseFamily !== undefined) {
    family = lowercaseFamily;
    wide = true;
    i += 1;
  } else if (ALL_FAMILIES.has(familyChar)) {
    family = familyChar as MoveFamily;
    i += 1;
    if (input[i] === 'w') {
      wide = true;
      i += 1;
    }
  } else {
    throw new AlgorithmSyntaxError(input, i, `"${familyChar}" is not a move`, {
      reason: 'not-a-move',
      length: 1,
      char: familyChar,
    });
  }

  const isFace = (FACE_FAMILIES as readonly string[]).includes(family);
  if (!isFace && (wide || innerLayer !== null)) {
    throw new AlgorithmSyntaxError(
      input,
      from,
      `"${family}" turns a fixed set of layers, so it takes no width`,
      { reason: 'family-takes-no-width', length: i - from, family },
    );
  }
  if (!wide && innerLayer !== null) {
    throw new AlgorithmSyntaxError(input, from, 'a layer count without a "w" is not a wide move', {
      reason: 'layer-count-without-w',
      length: i - from,
      count: innerLayer,
    });
  }
  if (wide && innerLayer === null) innerLayer = 2;

  const amountStart = i;
  i = readAmount(input, i);
  const amount = amountValue(input, amountStart, i);

  // A second quote would have been left behind by `readAmount`, and silently
  // starting a new token there would turn `R''` into `R'` plus an error much
  // further along. Catch it where it is.
  if (input[i] === "'") {
    throw new AlgorithmSyntaxError(input, i, 'a move takes at most one "\'"', {
      reason: 'repeated-prime',
      length: 1,
      char: "'",
    });
  }

  return [{ type: 'move', family, outerLayer, innerLayer, amount }, i];
}
