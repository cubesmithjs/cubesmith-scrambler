/**
 * Just enough linear algebra over `Z/n` to invert a small integer matrix.
 *
 * Written for the Rubik's Clock, the one puzzle in this package whose group
 * is abelian — every move is an addition on a fixed set of dials, so
 * "solving" is a linear system over `Z12` rather than a search.
 *
 * `Z12` is not a field, which is the whole difficulty: Gauss–Jordan needs an
 * *invertible* pivot, and a column can be free of them while the matrix is
 * still invertible (in `[[2,3],[3,2]]` neither 2 nor 3 is a unit mod 12,
 * yet the determinant −5 is). The fix is the Chinese Remainder Theorem:
 * `Z12 ≅ Z4 × Z3`, and each factor is a *local* ring — mod a prime power,
 * every non-unit is a multiple of the prime, so a column with no unit would
 * make the whole determinant a multiple of that prime and the matrix
 * singular. Pivots therefore always exist in each factor, and the two
 * inverses recombine.
 */

/** Non-negative remainder — JavaScript's `%` keeps the sign of the dividend, which is never what modular arithmetic wants. */
function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function egcd(a: number, b: number): { g: number; x: number } {
  let [oldR, r] = [a, b];
  let [oldS, s] = [1, 0];
  while (r !== 0) {
    const q = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return { g: oldR, x: oldS };
}

/** The multiplicative inverse of `a` mod `modulus`, or `null` if `a` isn't a unit. */
export function modInverse(a: number, modulus: number): number | null {
  const value = mod(a, modulus);
  const { g, x } = egcd(value, modulus);
  if (g !== 1) return null;
  return mod(x, modulus);
}

/**
 * Inverts `matrix` modulo a **prime power**. Relies on that ring being
 * local, so a pivot search that only accepts units is guaranteed to succeed
 * whenever the matrix is invertible at all — see the module note.
 */
function invertModPrimePower(matrix: readonly (readonly number[])[], modulus: number): number[][] {
  const n = matrix.length;
  const a = matrix.map((row) => row.map((v) => mod(v, modulus)));
  const inverse: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j): number => (i === j ? 1 : 0)),
  );

  for (let column = 0; column < n; column += 1) {
    let pivot = -1;
    let pivotInverse = 0;
    for (let row = column; row < n; row += 1) {
      const candidate = modInverse(a[row]![column]!, modulus);
      if (candidate !== null) {
        pivot = row;
        pivotInverse = candidate;
        break;
      }
    }
    if (pivot === -1) {
      throw new Error(`mod-matrix: matrix is singular modulo ${modulus} at column ${column}`);
    }
    [a[column], a[pivot]] = [a[pivot]!, a[column]!];
    [inverse[column], inverse[pivot]] = [inverse[pivot]!, inverse[column]!];

    for (let j = 0; j < n; j += 1) {
      a[column]![j] = (a[column]![j]! * pivotInverse) % modulus;
      inverse[column]![j] = (inverse[column]![j]! * pivotInverse) % modulus;
    }
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = a[row]![column]!;
      if (factor === 0) continue;
      for (let j = 0; j < n; j += 1) {
        a[row]![j] = mod(a[row]![j]! - factor * a[column]![j]!, modulus);
        inverse[row]![j] = mod(inverse[row]![j]! - factor * inverse[column]![j]!, modulus);
      }
    }
  }

  return inverse;
}

/**
 * Inverts a square integer matrix modulo 12, by inverting it mod 4 and mod 3
 * and recombining. `9a + 4b` is the CRT recombination: 9 is `1 mod 4` and
 * `0 mod 3`, 4 is `0 mod 4` and `1 mod 3`.
 */
export function invertMatrixMod12(matrix: readonly (readonly number[])[]): number[][] {
  const modFour = invertModPrimePower(matrix, 4);
  const modThree = invertModPrimePower(matrix, 3);
  return modFour.map((row, i) =>
    row.map((value, j) => (9 * value + 4 * modThree[i]![j]!) % 12),
  );
}

/** `matrix · vector` modulo `modulus`. */
export function multiplyMatrixVectorMod(
  matrix: readonly (readonly number[])[],
  vector: readonly number[],
  modulus: number,
): number[] {
  return matrix.map((row) => {
    let sum = 0;
    for (let j = 0; j < row.length; j += 1) sum += row[j]! * vector[j]!;
    return mod(sum, modulus);
  });
}

/**
 * The exact integer determinant, by fraction-free (Bareiss) elimination —
 * every intermediate value stays an integer, so there is no floating-point
 * error to reason about. Used to show the Clock's scramble template is
 * *unimodular*, which is a stronger and more meaningful statement than
 * "invertible mod 12".
 */
export function integerDeterminant(matrix: readonly (readonly number[])[]): number {
  const n = matrix.length;
  const a = matrix.map((row) => [...row]);
  let sign = 1;
  let previous = 1;

  for (let k = 0; k < n - 1; k += 1) {
    if (a[k]![k] === 0) {
      const swap = a.findIndex((row, i) => i > k && row[k] !== 0);
      if (swap === -1) return 0;
      [a[k], a[swap]] = [a[swap]!, a[k]!];
      sign = -sign;
    }
    for (let i = k + 1; i < n; i += 1) {
      for (let j = k + 1; j < n; j += 1) {
        a[i]![j] = (a[i]![j]! * a[k]![k]! - a[i]![k]! * a[k]![j]!) / previous;
      }
    }
    previous = a[k]![k]!;
  }

  // `sign * 0` is `-0` when the sign flipped, which compares unequal to `0`
  // under `Object.is` and would make "is this matrix singular?" awkward to
  // ask. A determinant has no signed zero.
  const determinant = sign * a[n - 1]![n - 1]!;
  return determinant === 0 ? 0 : determinant;
}
