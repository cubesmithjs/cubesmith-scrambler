import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomState222 } from './random-state';
import { CORNER_COUNT_222 } from './state';

describe('randomState222 — structural validity', () => {
  const random = createRandomSource('222-structural-check');

  it('every generated state has a valid corner permutation with corner 6 fixed, over many trials', () => {
    for (let trial = 0; trial < 300; trial += 1) {
      const state = randomState222(random);
      expect(state.cornerPermutation).toHaveLength(CORNER_COUNT_222);
      expect(new Set(state.cornerPermutation).size).toBe(CORNER_COUNT_222);
      expect(state.cornerPermutation[6]).toBe(6);
    }
  });

  it('every orientation entry is in {0,1,2}, corner 6 is always 0, and the total is ≡ 0 (mod 3)', () => {
    for (let trial = 0; trial < 300; trial += 1) {
      const state = randomState222(random);
      expect(state.cornerOrientation[6]).toBe(0);
      for (const o of state.cornerOrientation) {
        expect(o).toBeGreaterThanOrEqual(0);
        expect(o).toBeLessThanOrEqual(2);
      }
      expect(state.cornerOrientation.reduce((a, b) => a + b, 0) % 3).toBe(0);
    }
  });
});

describe('randomState222 — determinism', () => {
  it('the same seed produces the exact same state', () => {
    const a = randomState222(createRandomSource('222-fixed'));
    const b = randomState222(createRandomSource('222-fixed'));
    expect(a).toEqual(b);
  });

  it('different seeds produce different states', () => {
    const a = randomState222(createRandomSource('222-seed-a'));
    const b = randomState222(createRandomSource('222-seed-b'));
    expect(a).not.toEqual(b);
  });
});

describe('randomState222 — distribution sanity', () => {
  it('covers a wide spread of permutation values over many draws, not a small fixed set', () => {
    // Unlike 3x3x3's astronomically large permutation space, 2x2x2's is
    // only 5040 — with 2000 draws, the birthday paradox means a
    // meaningful number of *genuine* collisions is expected even under
    // perfect uniformity (coupon-collector estimate: ~1649 distinct out
    // of 2000 draws from 5040 slots). Sampling far fewer than the space
    // size keeps collisions rare, so a high-uniqueness threshold is
    // actually meaningful here.
    const random = createRandomSource('222-distribution');
    const seen = new Set<string>();
    const samples = 100;
    for (let i = 0; i < samples; i += 1) {
      seen.add(randomState222(random).cornerPermutation.join(','));
    }
    expect(seen.size).toBeGreaterThan(samples * 0.9);
  });
});
