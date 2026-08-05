import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../random/random-source';
import { randomInt } from './random-int';
import {
  integerDeterminant,
  invertMatrixMod12,
  modInverse,
  multiplyMatrixVectorMod,
} from './mod-matrix';

describe('modInverse', () => {
  it('finds the inverse of every unit mod 12, and rejects every non-unit', () => {
    const units = [1, 5, 7, 11];
    for (let a = 0; a < 12; a += 1) {
      const inverse = modInverse(a, 12);
      if (units.includes(a)) {
        expect(inverse).not.toBeNull();
        expect((a * inverse!) % 12).toBe(1);
      } else {
        expect(inverse).toBeNull();
      }
    }
  });

  it('handles negative input', () => {
    expect(modInverse(-1, 12)).toBe(11);
    expect((-1 * 11 + 12) % 12).toBe(1);
  });
});

describe('integerDeterminant', () => {
  it('matches known values', () => {
    expect(integerDeterminant([[5]])).toBe(5);
    expect(
      integerDeterminant([
        [1, 2],
        [3, 4],
      ]),
    ).toBe(-2);
    expect(
      integerDeterminant([
        [2, 3],
        [3, 2],
      ]),
    ).toBe(-5);
    expect(
      integerDeterminant([
        [6, 1, 1],
        [4, -2, 5],
        [2, 8, 7],
      ]),
    ).toBe(-306);
  });

  it('is 0 for a singular matrix, including one needing a pivot swap', () => {
    expect(
      integerDeterminant([
        [1, 2],
        [2, 4],
      ]),
    ).toBe(0);
    expect(
      integerDeterminant([
        [0, 0],
        [1, 1],
      ]),
    ).toBe(0);
  });

  it('handles a zero pivot by swapping rows and flipping the sign', () => {
    expect(
      integerDeterminant([
        [0, 1],
        [1, 0],
      ]),
    ).toBe(-1);
  });
});

describe('invertMatrixMod12', () => {
  /**
   * The case that rules out plain Gauss–Jordan over Z12: neither 2 nor 3 is
   * a unit, so no pivot exists in the first column, yet the determinant −5
   * *is* a unit and the matrix really is invertible. The CRT route handles it.
   */
  it('inverts a matrix whose columns contain no unit at all', () => {
    const m = [
      [2, 3],
      [3, 2],
    ];
    const inverse = invertMatrixMod12(m);
    for (let i = 0; i < 2; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        const entry = (m[i]![0]! * inverse[0]![j]! + m[i]![1]! * inverse[1]![j]!) % 12;
        expect(entry).toBe(i === j ? 1 : 0);
      }
    }
  });

  it('inverts the identity to itself', () => {
    expect(
      invertMatrixMod12([
        [1, 0],
        [0, 1],
      ]),
    ).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it('the inverse really is a two-sided inverse, on random unimodular matrices', () => {
    const random = createRandomSource('mod-matrix-random-unimodular');
    for (let trial = 0; trial < 200; trial += 1) {
      const n = 3 + randomInt(random, 4);
      // A product of random unit-triangular matrices is unimodular by
      // construction, so it is guaranteed invertible mod 12 without needing
      // to test the determinant first.
      const m = unitLowerTriangular(n, random);
      const upper = unitUpperTriangular(n, random);
      const product = multiply(m, upper);

      expect(Math.abs(integerDeterminant(product))).toBe(1);
      const inverse = invertMatrixMod12(product);
      expectIdentityMod12(multiply(product, inverse), n);
      expectIdentityMod12(multiply(inverse, product), n);
    }
  });

  it('throws on a matrix that is genuinely singular mod 12', () => {
    expect(() =>
      invertMatrixMod12([
        [2, 0],
        [0, 2],
      ]),
    ).toThrow(/singular/);
  });
});

describe('multiplyMatrixVectorMod', () => {
  it('reduces into the non-negative residue range', () => {
    expect(
      multiplyMatrixVectorMod(
        [
          [1, 2],
          [-3, 1],
        ],
        [5, 7],
        12,
      ),
    ).toEqual([7, 4]);
  });
});

function unitLowerTriangular(n: number, random: ReturnType<typeof createRandomSource>): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : j < i ? randomInt(random, 5) - 2 : 0)),
  );
}

function unitUpperTriangular(n: number, random: ReturnType<typeof createRandomSource>): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : j > i ? randomInt(random, 5) - 2 : 0)),
  );
}

function multiply(a: readonly (readonly number[])[], b: readonly (readonly number[])[]): number[][] {
  return a.map((row) =>
    b[0]!.map((_, j) => row.reduce((sum, value, k) => sum + value * b[k]![j]!, 0)),
  );
}

function expectIdentityMod12(m: readonly (readonly number[])[], n: number): void {
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      expect(((m[i]![j]! % 12) + 12) % 12).toBe(i === j ? 1 : 0);
    }
  }
}
