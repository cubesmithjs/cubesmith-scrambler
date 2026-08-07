import { describe, expect, it } from 'vitest';
import { algorithmsEqual } from './equality';
import { parseAlgorithm } from './parse';
import { AlgorithmSyntaxError, type Algorithm, type MoveNode } from './types';

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

describe('parseAlgorithm — malformed input', () => {
  /** Every case throws, and the offset is what makes the error usable as a validator. */
  const cases: ReadonlyArray<readonly [string, number, RegExp]> = [
    ['R U (', 4, /unclosed "\("/],
    ['R U )', 4, /unmatched "\)"/],
    ['[R, U', 0, /unclosed "\["/],
    ['R U ]', 4, /unmatched "\]"/],
    ['[R, U: F]', 5, /exactly one "," or ":"/],
    ['[R U]', 0, /needs a "," .* or ":"/],
    ['[, U]', 0, /both halves/],
    ['[R, ]', 0, /both halves/],
    ['()', 0, /empty group/],
    ["Rw'2", 3, /expected a move after a layer prefix/],
    ["R''", 2, /at most one/],
    ['[R )', 0, /unclosed "\["/],
    ['4-2Rw', 0, /must count outwards-in/],
    ['1-1Rw', 0, /must count outwards-in/],
    ['0-2Rw', 0, /must count outwards-in/],
    ['2-Rw', 2, /needs a second number/],
    ['1Rw', 0, /not a wide move/],
    ['0Rw', 0, /not a wide move/],
    ['3R', 0, /without a "w"/],
    ['3M', 0, /takes no width/],
    ['Mw', 0, /takes no width/],
    ['xw', 0, /takes no width/],
    ['R0', 1, /amount of 0/],
    ['Q', 0, /"Q" is not a move/],
    ['R U ,', 4, /unexpected ","/],
    ['R U :', 4, /unexpected ":"/],
    ['3', 0, /expected a move after a layer prefix/],
  ];

  for (const [input, offset, message] of cases) {
    it(`rejects ${JSON.stringify(input)} at offset ${offset}`, () => {
      let thrown: unknown;
      try {
        parseAlgorithm(input);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, input).toBeInstanceOf(AlgorithmSyntaxError);
      const error = thrown as AlgorithmSyntaxError;
      expect(error.message, input).toMatch(message);
      expect(error.offset, `${input} — offset`).toBe(offset);
      expect(error.input).toBe(input);
      // The offset has to be quotable back at the user, which is the whole
      // point of carrying it.
      expect(error.message).toContain(`offset ${offset}`);
    });
  }

  it('does not return a wrong tree instead of throwing', () => {
    for (const [input] of cases) {
      expect(() => parseAlgorithm(input), input).toThrow(AlgorithmSyntaxError);
    }
  });
});
