import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { permutationParity } from '../../utils/permutation';
import { randomState } from './random-state';
import { CORNER_COUNT, EDGE_COUNT } from './state';

describe('randomState — structural validity', () => {
  const random = createRandomSource('structural-check');

  it('every generated state has valid corner/edge permutations, over many trials', () => {
    for (let trial = 0; trial < 300; trial += 1) {
      const state = randomState(random);
      expect(state.cornerPermutation).toHaveLength(CORNER_COUNT);
      expect(new Set(state.cornerPermutation).size).toBe(CORNER_COUNT);
      expect(state.edgePermutation).toHaveLength(EDGE_COUNT);
      expect(new Set(state.edgePermutation).size).toBe(EDGE_COUNT);
    }
  });

  it('every corner orientation entry is in {0,1,2} and every edge orientation entry is in {0,1}', () => {
    for (let trial = 0; trial < 300; trial += 1) {
      const state = randomState(random);
      for (const o of state.cornerOrientation) {
        expect(o).toBeGreaterThanOrEqual(0);
        expect(o).toBeLessThanOrEqual(2);
      }
      for (const o of state.edgeOrientation) {
        expect(o).toBeGreaterThanOrEqual(0);
        expect(o).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('randomState — physical reachability constraints', () => {
  const random = createRandomSource('reachability-check');

  it('corner and edge permutation parity always match (the constraint every reachable state satisfies)', () => {
    for (let trial = 0; trial < 500; trial += 1) {
      const state = randomState(random);
      expect(permutationParity(state.cornerPermutation)).toBe(
        permutationParity(state.edgePermutation),
      );
    }
  });

  it('total corner orientation is always ≡ 0 (mod 3)', () => {
    for (let trial = 0; trial < 500; trial += 1) {
      const state = randomState(random);
      const sum = state.cornerOrientation.reduce((a, b) => a + b, 0);
      expect(sum % 3).toBe(0);
    }
  });

  it('total edge orientation is always ≡ 0 (mod 2)', () => {
    for (let trial = 0; trial < 500; trial += 1) {
      const state = randomState(random);
      const sum = state.edgeOrientation.reduce((a, b) => a + b, 0);
      expect(sum % 2).toBe(0);
    }
  });
});

describe('randomState — determinism', () => {
  it('the same seed produces the exact same state', () => {
    const a = randomState(createRandomSource('fixed'));
    const b = randomState(createRandomSource('fixed'));
    expect(a).toEqual(b);
  });

  it('different seeds produce different states', () => {
    const a = randomState(createRandomSource('seed-a'));
    const b = randomState(createRandomSource('seed-b'));
    expect(a).not.toEqual(b);
  });
});

describe('randomState — distribution sanity (not a proof of uniformity, but catches gross bias)', () => {
  const random = createRandomSource('distribution-check');
  const TRIALS = 2000;

  it('both parity classes (even/even and odd/odd) occur, roughly balanced', () => {
    let evenCount = 0;
    for (let i = 0; i < TRIALS; i += 1) {
      const state = randomState(random);
      if (permutationParity(state.cornerPermutation) === 0) evenCount += 1;
    }
    const fraction = evenCount / TRIALS;
    // Expect ~50/50; a wide tolerance keeps this from being flaky while
    // still catching a gross bug (e.g. the parity fix always firing, or
    // never firing, which would skew this heavily toward 0% or 100%).
    expect(fraction).toBeGreaterThan(0.35);
    expect(fraction).toBeLessThan(0.65);
  });

  it("the parity-fix swap doesn't collapse the corrected permutation to a fixed value", () => {
    const seen = new Set<string>();
    for (let i = 0; i < TRIALS; i += 1) {
      seen.add(randomState(random).edgePermutation.join(','));
    }
    // With 12! possible edge permutations, 2000 draws should essentially
    // never repeat — a large `seen.size` rules out the fix degenerating
    // into a small fixed set of outcomes.
    expect(seen.size).toBeGreaterThan(TRIALS * 0.99);
  });

  it('corner orientation values are spread across {0,1,2}, not biased to one value', () => {
    const counts = [0, 0, 0];
    for (let i = 0; i < TRIALS; i += 1) {
      const state = randomState(random);
      for (const o of state.cornerOrientation) counts[o]! += 1;
    }
    const total = counts[0]! + counts[1]! + counts[2]!;
    for (const count of counts) {
      expect(count / total).toBeGreaterThan(0.25);
      expect(count / total).toBeLessThan(0.4);
    }
  });
});
