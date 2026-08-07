import { describe, expect, it } from 'vitest';
import { CFOP_CORPUS } from './cfop-corpus';
import { algorithmsEqual } from './equality';
import { invertAlgorithm } from './invert';
import { parseAlgorithm } from './parse';
import { serializeAlgorithm } from './serialize';

const invert = (s: string): string => serializeAlgorithm(invertAlgorithm(parseAlgorithm(s)));

describe('invertAlgorithm — moves', () => {
  it('reverses the order and negates each amount', () => {
    expect(invert("R U F'")).toBe("F U' R'");
  });

  /**
   * `R2` inverts to `R2'`, not to `R2`.
   *
   * They are the same turn on a cube, but only because a face has order 4 —
   * which is a fact about the puzzle, and this layer has none. Saying `R2` here
   * would be a semantic simplification smuggled into a syntax operation, and
   * the same rule would be wrong on a Pyraminx. `cubing/alg` agrees, verified
   * against it rather than assumed.
   */
  it('does not simplify a half turn, because it has no puzzle to justify it', () => {
    expect(invert('R2')).toBe("R2'");
    expect(invert("R2'")).toBe('R2');
    expect(invert('R3')).toBe("R3'");
  });

  it('inverts wide moves, slices and rotations without touching their layers', () => {
    expect(invert('Rw')).toBe("Rw'");
    expect(invert('3Rw')).toBe("3Rw'");
    expect(invert('2-3Rw')).toBe("2-3Rw'");
    expect(invert('M')).toBe("M'");
    expect(invert('x')).toBe("x'");
    expect(invert('y2')).toBe("y2'");
  });

  it('leaves a pause where it is, relative to the reversed moves', () => {
    expect(invert('R . U')).toBe("U' . R'");
  });

  it('inverts an empty algorithm to an empty one', () => {
    expect(invert('')).toBe('');
  });
});

describe('invertAlgorithm — compound nodes', () => {
  /**
   * `(A)ⁿ` is `A` repeated `n` times, so its inverse is `(A⁻¹)ⁿ`: the **body**
   * is inverted and the count is left alone.
   */
  it('inverts a group by inverting its body, not its repetition', () => {
    expect(invert('(R U)2')).toBe("(U' R')2");
    expect(invert("(R U)'")).toBe("(U' R')'");
  });

  it('swaps the halves of a commutator', () => {
    // [A, B] is A B A' B', so its inverse is B A B' A' = [B, A].
    expect(invert('[R, U]')).toBe('[U, R]');
    expect(invert('[R, U]2')).toBe('[U, R]2');
  });

  it('inverts only the second half of a conjugate, and does not swap', () => {
    // [A: B] is A B A', so its inverse is A B' A' = [A: B'] — the mirror image
    // of the commutator rule, and the easiest of the three to get backwards.
    expect(invert('[R: U]')).toBe("[R: U']");
    expect(invert("[R: U']")).toBe('[R: U]');
  });

  it('recurses through nesting', () => {
    expect(invert("[R: (U R U')2]")).toBe("[R: (U R' U')2]");
    expect(invert('[[R, U], D]')).toBe('[D, [R, U]]');
  });
});

describe('invertAlgorithm — it is an involution', () => {
  it('returns the original tree when applied twice, over the whole CFOP corpus', () => {
    for (const algorithm of CFOP_CORPUS) {
      const parsed = parseAlgorithm(algorithm);
      expect(algorithmsEqual(invertAlgorithm(invertAlgorithm(parsed)), parsed), algorithm).toBe(
        true,
      );
    }
  });

  it('returns the original tree twice over for every construct', () => {
    for (const input of [
      "(R U)2'",
      '[R, U]2',
      "[R: (U R U')2]",
      '[[R, U], D]',
      'R . U',
      '2-3Rw2',
      'x y2 z',
    ]) {
      const parsed = parseAlgorithm(input);
      expect(algorithmsEqual(invertAlgorithm(invertAlgorithm(parsed)), parsed), input).toBe(true);
    }
  });
});
