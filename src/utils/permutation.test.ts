import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../random/random-source';
import {
  allPermutations,
  permutationParity,
  randomPermutation,
  swapToFlipParity,
} from './permutation';

describe('allPermutations', () => {
  it('produces exactly n! distinct permutations of [0, n)', () => {
    let factorial = 1;
    for (let n = 0; n <= 7; n += 1) {
      if (n > 0) factorial *= n;
      const perms = allPermutations(n);
      expect(perms).toHaveLength(factorial);
      expect(new Set(perms.map((p) => p.join(','))).size).toBe(factorial);
      for (const perm of perms) {
        expect(perm).toHaveLength(n);
        expect(new Set(perm).size).toBe(n);
      }
    }
  });

  it('is in lexicographic order, so an index is a stable coordinate', () => {
    const perms = allPermutations(5);
    expect(perms[0]).toEqual([0, 1, 2, 3, 4]);
    expect(perms[perms.length - 1]).toEqual([4, 3, 2, 1, 0]);
    for (let i = 1; i < perms.length; i += 1) {
      expect(perms[i]!.join(',') > perms[i - 1]!.join(',')).toBe(true);
    }
  });

  it('splits evenly into even and odd permutations for n >= 2', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const perms = allPermutations(n);
      const even = perms.filter((p) => permutationParity(p) === 0).length;
      expect(even * 2).toBe(perms.length);
    }
  });
});

describe('randomPermutation', () => {
  it('returns a permutation of [0, n) — every value appears exactly once', () => {
    const random = createRandomSource('perm-check');
    for (const n of [1, 2, 5, 8, 12]) {
      const perm = randomPermutation(random, n);
      expect(perm).toHaveLength(n);
      expect(new Set(perm).size).toBe(n);
      for (const value of perm) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(n);
      }
    }
  });

  it('is deterministic given a seeded source', () => {
    const a = createRandomSource('perm-det');
    const b = createRandomSource('perm-det');
    expect(randomPermutation(a, 12)).toEqual(randomPermutation(b, 12));
  });

  it('n=0 returns an empty array', () => {
    expect(randomPermutation(createRandomSource(1), 0)).toEqual([]);
  });

  it('produces every element of a small permutation space over many draws (Fisher–Yates sanity check)', () => {
    const random = createRandomSource('perm-coverage');
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      seen.add(randomPermutation(random, 3).join(','));
    }
    // 3! = 6 possible permutations of length 3.
    expect(seen.size).toBe(6);
  });
});

describe('permutationParity', () => {
  it('the identity permutation is even', () => {
    expect(permutationParity([0, 1, 2, 3])).toBe(0);
  });

  it('a single transposition is odd', () => {
    expect(permutationParity([1, 0, 2, 3])).toBe(1);
  });

  it('two transpositions compose back to even', () => {
    expect(permutationParity([1, 0, 3, 2])).toBe(0);
  });

  it('a 3-cycle is even (decomposes into 2 transpositions)', () => {
    expect(permutationParity([1, 2, 0])).toBe(0);
  });

  it('a 4-cycle is odd (decomposes into 3 transpositions)', () => {
    expect(permutationParity([1, 2, 3, 0])).toBe(1);
  });

  it('agrees with brute-force inversion counting on many random permutations', () => {
    const random = createRandomSource('parity-cross-check');
    for (let i = 0; i < 200; i += 1) {
      const perm = randomPermutation(random, 8);
      expect(permutationParity(perm)).toBe(inversionParity(perm));
    }
  });
});

describe('swapToFlipParity', () => {
  it('flips the parity of a permutation with at least 2 elements', () => {
    const perm = [0, 1, 2, 3];
    const before = permutationParity(perm);
    swapToFlipParity(perm);
    expect(permutationParity(perm)).toBe(before === 0 ? 1 : 0);
  });

  it('is a no-op on a permutation shorter than 2', () => {
    const perm = [0];
    swapToFlipParity(perm);
    expect(perm).toEqual([0]);
  });
});

/** Independent, O(n²) reference implementation of permutation parity, used only to cross-check `permutationParity`. */
function inversionParity(perm: readonly number[]): 0 | 1 {
  let inversions = 0;
  for (let i = 0; i < perm.length; i += 1) {
    for (let j = i + 1; j < perm.length; j += 1) {
      if (perm[i]! > perm[j]!) inversions += 1;
    }
  }
  return (inversions % 2) as 0 | 1;
}
