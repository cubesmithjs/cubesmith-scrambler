import { describe, expect, it } from 'vitest';
import { algorithmsEqual } from './equality';
import { parseAlgorithm, validateAlgorithm } from './parse';
import {
  AlgorithmSyntaxError,
  type Algorithm,
  type MoveNode,
  type SyntaxErrorReason,
} from './types';

/** A move node written out in full, so a test reads as the tree it expects rather than as a string. */
function move(
  family: MoveNode['family'],
  amount: number,
  innerLayer: number | null = null,
  outerLayer: number | null = null,
): MoveNode {
  return { type: 'move', family, outerLayer, innerLayer, amount };
}

function nodes(algorithm: Algorithm) {
  return algorithm.nodes;
}

describe('parseAlgorithm — face moves', () => {
  it('reads the three amounts the WCA emits', () => {
    expect(nodes(parseAlgorithm("R R2 R'"))).toEqual([move('R', 1), move('R', 2), move('R', -1)]);
  });

  it('reads all six faces', () => {
    for (const face of ['U', 'D', 'F', 'B', 'L', 'R'] as const) {
      expect(nodes(parseAlgorithm(face))).toEqual([move(face, 1)]);
    }
  });

  /**
   * `R3` and `R2'` are accepted, and this is a deliberate decision rather than
   * an accident of the regex.
   *
   * The WCA never emits them, and neither does this package. But the reason
   * this parser exists is to *read* notation somebody else wrote — the
   * frontend uses `cubing/alg` on its case library as a validator — and
   * cubing.js accepts arbitrary integer amounts. Rejecting them would make
   * this a stricter validator than the one it is replacing, which would show
   * up as false failures on a library that was previously fine.
   */
  it('accepts integer amounts beyond 2, and an inverted half turn', () => {
    expect(nodes(parseAlgorithm('R3'))).toEqual([move('R', 3)]);
    expect(nodes(parseAlgorithm("R2'"))).toEqual([move('R', -2)]);
    expect(nodes(parseAlgorithm("R4'"))).toEqual([move('R', -4)]);
  });
});

describe('parseAlgorithm — wide moves, slices and rotations', () => {
  it('reads a "w" as two layers', () => {
    expect(nodes(parseAlgorithm("Rw Rw2 Rw'"))).toEqual([
      move('R', 1, 2),
      move('R', 2, 2),
      move('R', -1, 2),
    ]);
  });

  it('treats a lowercase family as the same move as its "w" spelling', () => {
    // Normalised on the way in, so a serializer has one spelling to emit. The
    // cost is that `r` does not round-trip to `r`, which is a deliberate
    // choice for canonical output rather than an oversight.
    expect(algorithmsEqual(parseAlgorithm('r'), parseAlgorithm('Rw'))).toBe(true);
    expect(algorithmsEqual(parseAlgorithm("l'"), parseAlgorithm("Lw'"))).toBe(true);
    expect(algorithmsEqual(parseAlgorithm('r2'), parseAlgorithm('Rw2'))).toBe(true);
  });

  it('reads a numeric prefix as a deeper block, in both spellings', () => {
    expect(nodes(parseAlgorithm('3Rw'))).toEqual([move('R', 1, 3)]);
    expect(nodes(parseAlgorithm('3r'))).toEqual([move('R', 1, 3)]);
    expect(nodes(parseAlgorithm("4Rw2 5Lw'"))).toEqual([move('R', 2, 4), move('L', -1, 5)]);
  });

  it('reads a range as an inner block that does not start at the surface', () => {
    expect(nodes(parseAlgorithm('2-3Rw'))).toEqual([move('R', 1, 3, 2)]);
    expect(nodes(parseAlgorithm("2-3Rw'"))).toEqual([move('R', -1, 3, 2)]);
  });

  it('reads slices and rotations, which carry no width', () => {
    expect(nodes(parseAlgorithm("M E' S2"))).toEqual([move('M', 1), move('E', -1), move('S', 2)]);
    expect(nodes(parseAlgorithm("x y2 z'"))).toEqual([move('x', 1), move('y', 2), move('z', -1)]);
  });
});

describe('parseAlgorithm — structure', () => {
  it('reads a group, with and without a repetition', () => {
    expect(nodes(parseAlgorithm('(R U)'))).toEqual([
      { type: 'group', body: { nodes: [move('R', 1), move('U', 1)] }, amount: 1 },
    ]);
    expect(nodes(parseAlgorithm('(R U)2'))[0]).toMatchObject({ type: 'group', amount: 2 });
    expect(nodes(parseAlgorithm("(R U)'"))[0]).toMatchObject({ type: 'group', amount: -1 });
    expect(nodes(parseAlgorithm("(R U)2'"))[0]).toMatchObject({ type: 'group', amount: -2 });
  });

  it('tells a commutator from a conjugate by the separator, not by the bracket', () => {
    expect(nodes(parseAlgorithm('[R, U]'))).toEqual([
      { type: 'commutator', a: { nodes: [move('R', 1)] }, b: { nodes: [move('U', 1)] }, amount: 1 },
    ]);
    expect(nodes(parseAlgorithm('[R: U]'))).toEqual([
      { type: 'conjugate', a: { nodes: [move('R', 1)] }, b: { nodes: [move('U', 1)] }, amount: 1 },
    ]);
  });

  it('carries a repetition on a bracket too', () => {
    expect(nodes(parseAlgorithm('[R, U]2'))[0]).toMatchObject({ type: 'commutator', amount: 2 });
    expect(nodes(parseAlgorithm("[R: U]'"))[0]).toMatchObject({ type: 'conjugate', amount: -1 });
  });

  it('nests every construct inside every other', () => {
    // The case the task named, plus the ones around it.
    expect(() => parseAlgorithm("[R: (U R U')2]")).not.toThrow();
    expect(() => parseAlgorithm('[[R, U], D]')).not.toThrow();
    expect(() => parseAlgorithm('([R: U] D)2')).not.toThrow();
    expect(() => parseAlgorithm("(([R, U])2 D)'")).not.toThrow();
    expect(() => parseAlgorithm('[(R U): [M, E]]')).not.toThrow();
  });

  it('finds the separator past arbitrary nesting, which is why the bracket cannot commit early', () => {
    const parsed = parseAlgorithm('[(R (U D)2) [M, E]: F]');
    expect(parsed.nodes[0]).toMatchObject({ type: 'conjugate' });
  });

  it('reads a pause, and does not let it take a repetition', () => {
    expect(nodes(parseAlgorithm('R . U'))).toEqual([move('R', 1), { type: 'pause' }, move('U', 1)]);
  });

  it('treats whitespace and newlines as one separator', () => {
    expect(algorithmsEqual(parseAlgorithm('R\n  U\t\tF'), parseAlgorithm('R U F'))).toBe(true);
    expect(nodes(parseAlgorithm('   '))).toEqual([]);
    expect(nodes(parseAlgorithm(''))).toEqual([]);
  });

  it('accepts an algorithm with no spaces at all', () => {
    expect(algorithmsEqual(parseAlgorithm("RU'R2"), parseAlgorithm("R U' R2"))).toBe(true);
  });

  it('drops line comments, which is the one place this layer is not round-trip faithful', () => {
    expect(algorithmsEqual(parseAlgorithm('R U // sexy move\nF'), parseAlgorithm('R U F'))).toBe(
      true,
    );
    expect(nodes(parseAlgorithm('// nothing but a comment'))).toEqual([]);
  });
});

/**
 * One row per malformed input: what it says, where it says it, and — since
 * v0.11 — the machine-readable code and the data a consumer needs to write its
 * own sentence in its own language.
 *
 * `data` is asserted with `toMatchObject`, so a row lists only the
 * interpolation fields its code carries; the absent ones are checked
 * collectively by the exhaustiveness test below.
 */
interface MalformedCase {
  readonly input: string;
  readonly offset: number;
  readonly length: number;
  readonly message: RegExp;
  readonly reason: SyntaxErrorReason;
  readonly data?: Partial<AlgorithmSyntaxError>;
}

const MALFORMED: readonly MalformedCase[] = [
  // Parser — grouping.
  { input: 'R U (', offset: 4, length: 1, message: /unclosed "\("/, reason: 'unclosed-group' },
  {
    input: 'R U )',
    offset: 4,
    length: 1,
    message: /unmatched "\)"/,
    reason: 'unmatched-close-group',
    data: { char: ')' },
  },
  { input: '()', offset: 0, length: 2, message: /empty group/, reason: 'empty-group' },
  // Parser — brackets.
  { input: '[R, U', offset: 0, length: 1, message: /unclosed "\["/, reason: 'unclosed-bracket' },
  { input: '[R )', offset: 0, length: 1, message: /unclosed "\["/, reason: 'unclosed-bracket' },
  {
    input: 'R U ]',
    offset: 4,
    length: 1,
    message: /unmatched "\]"/,
    reason: 'unmatched-close-bracket',
    data: { char: ']' },
  },
  {
    input: '[R, U: F]',
    offset: 5,
    length: 1,
    message: /exactly one "," or ":"/,
    reason: 'bracket-extra-separator',
    data: { char: ':' },
  },
  {
    input: '[R U]',
    offset: 0,
    length: 1,
    message: /needs a "," .* or ":"/,
    reason: 'bracket-missing-separator',
  },
  { input: '[, U]', offset: 0, length: 5, message: /both halves/, reason: 'bracket-empty-half' },
  { input: '[R, ]', offset: 0, length: 5, message: /both halves/, reason: 'bracket-empty-half' },
  // Parser — strays at the end of the input.
  {
    input: 'R U ,',
    offset: 4,
    length: 1,
    message: /unexpected ","/,
    reason: 'stray-comma',
    data: { char: ',' },
  },
  {
    input: 'R U :',
    offset: 4,
    length: 1,
    message: /unexpected ":"/,
    reason: 'stray-colon',
    data: { char: ':' },
  },
  // Tokenizer — layer prefixes.
  {
    input: '4-2Rw',
    offset: 0,
    length: 3,
    message: /must count outwards-in/,
    reason: 'layer-range-not-ascending',
    data: { outer: 4, inner: 2 },
  },
  {
    input: '1-1Rw',
    offset: 0,
    length: 3,
    message: /must count outwards-in/,
    reason: 'layer-range-not-ascending',
    data: { outer: 1, inner: 1 },
  },
  {
    input: '0-2Rw',
    offset: 0,
    length: 3,
    message: /must count outwards-in/,
    reason: 'layer-range-not-ascending',
    data: { outer: 0, inner: 2 },
  },
  {
    input: '2-Rw',
    offset: 2,
    // Nothing to underline: the second number was never written.
    length: 0,
    message: /needs a second number/,
    reason: 'layer-range-incomplete',
  },
  {
    input: '1Rw',
    offset: 0,
    length: 1,
    message: /not a wide move/,
    reason: 'layer-count-too-small',
    data: { count: 1 },
  },
  {
    input: '0Rw',
    offset: 0,
    length: 1,
    message: /not a wide move/,
    reason: 'layer-count-too-small',
    data: { count: 0 },
  },
  {
    input: '3R',
    offset: 0,
    length: 2,
    message: /without a "w"/,
    reason: 'layer-count-without-w',
    data: { count: 3 },
  },
  {
    input: '3',
    offset: 0,
    length: 1,
    message: /expected a move after a layer prefix/,
    reason: 'layer-prefix-without-move',
  },
  {
    input: "Rw'2",
    offset: 3,
    length: 1,
    message: /expected a move after a layer prefix/,
    reason: 'layer-prefix-without-move',
  },
  // Tokenizer — families and amounts.
  {
    input: '3M',
    offset: 0,
    length: 2,
    message: /takes no width/,
    reason: 'family-takes-no-width',
    data: { family: 'M' },
  },
  {
    input: 'Mw',
    offset: 0,
    length: 2,
    message: /takes no width/,
    reason: 'family-takes-no-width',
    data: { family: 'M' },
  },
  {
    input: 'xw',
    offset: 0,
    length: 2,
    message: /takes no width/,
    reason: 'family-takes-no-width',
    data: { family: 'x' },
  },
  { input: 'R0', offset: 1, length: 1, message: /amount of 0/, reason: 'amount-zero' },
  {
    input: 'Q',
    offset: 0,
    length: 1,
    message: /"Q" is not a move/,
    reason: 'not-a-move',
    data: { char: 'Q' },
  },
  {
    input: "R''",
    offset: 2,
    length: 1,
    message: /at most one/,
    reason: 'repeated-prime',
    data: { char: "'" },
  },
];

/** Thrown by `parseAlgorithm(input)`, or the test fails rather than returning `undefined`. */
function rejectionOf(input: string): AlgorithmSyntaxError {
  let thrown: unknown;
  try {
    parseAlgorithm(input);
  } catch (error) {
    thrown = error;
  }
  expect(thrown, input).toBeInstanceOf(AlgorithmSyntaxError);
  return thrown as AlgorithmSyntaxError;
}

describe('parseAlgorithm — malformed input', () => {
  for (const testCase of MALFORMED) {
    const { input, offset, length, message, reason, data } = testCase;
    it(`rejects ${JSON.stringify(input)} as ${reason} at offset ${offset}`, () => {
      const error = rejectionOf(input);
      expect(error.message, input).toMatch(message);
      expect(error.offset, `${input} — offset`).toBe(offset);
      expect(error.input).toBe(input);
      // The offset has to be quotable back at the user, which is the whole
      // point of carrying it.
      expect(error.message).toContain(`offset ${offset}`);

      expect(error.reason, `${input} — reason`).toBe(reason);
      expect(error.length, `${input} — length`).toBe(length);
      if (data !== undefined) expect(error, `${input} — data`).toMatchObject(data);
    });
  }

  it('does not return a wrong tree instead of throwing', () => {
    for (const { input } of MALFORMED) {
      expect(() => parseAlgorithm(input), input).toThrow(AlgorithmSyntaxError);
    }
  });

  it('points its span at real characters, or at nothing at all', () => {
    // A consumer slices the input with `offset` and `length` to underline the
    // mistake. A span running past the end of the string would produce a
    // silently-truncated highlight rather than a visible failure.
    for (const { input } of MALFORMED) {
      const error = rejectionOf(input);
      expect(error.offset, input).toBeGreaterThanOrEqual(0);
      expect(error.offset + error.length, input).toBeLessThanOrEqual(input.length);
      expect(input.slice(error.offset, error.offset + error.length), input).toHaveLength(
        error.length,
      );
    }
  });
});

describe('AlgorithmSyntaxError — the reason codes as public API', () => {
  /**
   * The parser must not be able to grow a throw site that reports no code. A
   * new one either lands in the table above with a code of its own, or this
   * fails.
   */
  it('produces every code the parser claims to, and no undeclared one', () => {
    const produced = new Set(MALFORMED.map(({ input }) => rejectionOf(input).reason));
    const declared = new Set(MALFORMED.map(({ reason }) => reason));
    expect([...produced].sort()).toEqual([...declared].sort());
    // 19 of the 20 declared codes; `unexpected-token` is the residual and is
    // covered on its own below.
    expect(produced.size).toBe(19);
  });

  /**
   * 🔴 The additive guarantee of 0.11.0, pinned rather than asserted in prose.
   *
   * `.message` is what a consumer on 0.10.0 is already logging, and
   * `README.md` quotes this exact sentence. A refactor that derives the message
   * from the reason code — the coupling this API exists to break — fails here.
   */
  it('keeps the exact message format 0.10.0 shipped', () => {
    const error = rejectionOf('R U Q2 R');
    expect(error.message).toBe('notation: "Q" is not a move at offset 4 in "R U Q2 R"');
    expect(error.name).toBe('AlgorithmSyntaxError');
    expect(error).toBeInstanceOf(Error);
    expect(error.input).toBe('R U Q2 R');
    expect(error.offset).toBe(4);
  });

  /**
   * The three-argument constructor still type-checks and still runs, because
   * `0.11.0` is a minor release and someone, somewhere, may have subclassed or
   * constructed one. An error built that way reports the documented residual
   * rather than inventing a precision it does not have.
   */
  it('falls back to the documented residual when constructed without a detail', () => {
    const error = new AlgorithmSyntaxError('R U Q', 4, 'something went wrong');
    expect(error.message).toBe('notation: something went wrong at offset 4 in "R U Q"');
    expect(error.reason).toBe('unexpected-token');
    expect(error.length).toBe(0);
    expect(error.char).toBeUndefined();
  });

  it('leaves the interpolation fields off an error that has no use for them', () => {
    const error = rejectionOf('()');
    expect(error.reason).toBe('empty-group');
    expect(error.char).toBeUndefined();
    expect(error.family).toBeUndefined();
    expect(error.outer).toBeUndefined();
    expect(error.inner).toBeUndefined();
    expect(error.count).toBeUndefined();
  });

  /**
   * The point of the whole release, stated as a test: a consumer can render a
   * message in its own language without touching `.message`.
   */
  it('carries enough to build a message the package never wrote', () => {
    const error = rejectionOf('R U Q2 R');
    const french =
      error.reason === 'not-a-move'
        ? `« ${error.char} » n'est pas un mouvement (position ${error.offset})`
        : 'autre';
    expect(french).toBe("« Q » n'est pas un mouvement (position 4)");
    expect(error.input.slice(error.offset, error.offset + error.length)).toBe('Q');
  });
});

describe('validateAlgorithm', () => {
  it('returns the same tree parseAlgorithm does, without throwing', () => {
    const input = "[R: (U Rw U')2] . M2";
    const result = validateAlgorithm(input);
    expect(result.valid).toBe(true);
    // Narrowed through the discriminant, which is the reason the result is a
    // union rather than an object with two optional fields.
    if (!result.valid) throw new Error('unreachable');
    expect(result.algorithm).toEqual(parseAlgorithm(input));
    expect(algorithmsEqual(result.algorithm, parseAlgorithm(input))).toBe(true);
  });

  it('reports a tokenizer error and a parser error without throwing either', () => {
    const tokenizerError = validateAlgorithm('R U Q');
    expect(tokenizerError.valid).toBe(false);
    if (tokenizerError.valid) throw new Error('unreachable');
    expect(tokenizerError.error).toBeInstanceOf(AlgorithmSyntaxError);
    expect(tokenizerError.error.reason).toBe('not-a-move');
    expect(tokenizerError.error.offset).toBe(4);

    const parserError = validateAlgorithm('(R U');
    expect(parserError.valid).toBe(false);
    if (parserError.valid) throw new Error('unreachable');
    expect(parserError.error.reason).toBe('unclosed-group');
    expect(parserError.error.offset).toBe(0);
  });

  it('never throws for anything the throwing parser rejects', () => {
    for (const { input, reason } of MALFORMED) {
      const result = validateAlgorithm(input);
      expect(result.valid, input).toBe(false);
      if (result.valid) continue;
      expect(result.error.reason, input).toBe(reason);
    }
  });

  /**
   * 🔴 Agreeing with `parseAlgorithm('')` is load-bearing, not a detail. A
   * consumer treats an empty field as "no algorithm — clear the customization",
   * so the two entry points disagreeing here would be actively harmful.
   */
  it('accepts empty, whitespace and comment-only input, exactly as parseAlgorithm does', () => {
    for (const input of ['', '   ', '\n\t', '// nothing but a comment']) {
      const result = validateAlgorithm(input);
      expect(result.valid, JSON.stringify(input)).toBe(true);
      if (!result.valid) continue;
      expect(result.algorithm.nodes, JSON.stringify(input)).toEqual([]);
      expect(result.algorithm).toEqual(parseAlgorithm(input));
    }
  });

  /**
   * A defect in this package must not be laundered into "your notation is
   * wrong". `null` reaches `input.length` in the tokenizer and raises a
   * `TypeError`, which is exactly the class of failure that has to propagate.
   */
  it('re-throws a failure that is not a syntax error', () => {
    expect(() => validateAlgorithm(null as unknown as string)).toThrow(TypeError);
    expect(() => validateAlgorithm(null as unknown as string)).not.toThrow(AlgorithmSyntaxError);
  });
});
