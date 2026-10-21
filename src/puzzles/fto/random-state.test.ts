import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { permutationParity } from '../../utils/permutation';
import { randomFtoState } from './random-state';
import { centreColour } from './state';

/**
 * The draw must be uniform over the reachable group, which `state.test.ts`
 * establishes is exactly: an even corner permutation with an even twist sum,
 * and even permutations of the edges and of each centre orbit, unlinked.
 */
describe('randomFtoState — every draw is a real FTO position', () => {
  it('satisfies every invariant of the reachable group, over 10,000 draws', () => {
    const random = createRandomSource('fto-invariants');
    for (let trial = 0; trial < 10_000; trial += 1) {
      const s = randomFtoState(random);
      expect(new Set(s.cornerPermutation).size).toBe(6);
      expect(permutationParity(s.cornerPermutation)).toBe(0);
      expect(s.cornerOrientation.every((o) => o === 0 || o === 1)).toBe(true);
      expect(s.cornerOrientation.reduce((a, b) => a + b, 0) % 2).toBe(0);
      expect(permutationParity(s.edgePermutation)).toBe(0);
      expect(permutationParity(s.centreA)).toBe(0);
      expect(permutationParity(s.centreB)).toBe(0);
    }
  });
});

describe('randomFtoState — determinism', () => {
  it('gives the same state for the same seed, and different states from one stateful source', () => {
    expect(randomFtoState(createRandomSource('fto-fixed'))).toEqual(
      randomFtoState(createRandomSource('fto-fixed')),
    );
    const random = createRandomSource('fto-stream');
    expect(randomFtoState(random)).not.toEqual(randomFtoState(random));
  });
});

/**
 * Pearson's χ² against a uniform expectation, for four projections a biased draw
 * would most plausibly skew: which edge sits in slot 0 (12 cells), which corner
 * sits in slot 0 and how it is twisted (12 cells), and the colour showing on one
 * centre slot of each orbit (4 cells each).
 *
 * Thresholds are the 0.1% critical values — 31.26 for 11 degrees of freedom,
 * 16.27 for 3 — so a correct draw fails one of these about once in a thousand
 * runs *per seed*, and the seed is fixed, so it either always passes or always
 * fails. The statistics this seed produced are recorded in `fto-design.md` §6.
 */
describe('randomFtoState — uniformity', () => {
  const DRAWS = 24_000;

  function chiSquared(counts: readonly number[]): number {
    const expected = DRAWS / counts.length;
    return counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
  }

  it('is uniform on four projections (χ² below the 0.1% critical value)', () => {
    const random = createRandomSource('fto-chi-squared');
    const edge = new Array<number>(12).fill(0);
    const corner = new Array<number>(12).fill(0);
    const colourA = new Array<number>(4).fill(0);
    const colourB = new Array<number>(4).fill(0);
    for (let i = 0; i < DRAWS; i += 1) {
      const s = randomFtoState(random);
      edge[s.edgePermutation[0]!]! += 1;
      corner[2 * s.cornerPermutation[0]! + s.cornerOrientation[0]!]! += 1;
      colourA[centreColour(s.centreA[0]!)]! += 1;
      colourB[centreColour(s.centreB[5]!)]! += 1;
    }
    expect(chiSquared(edge)).toBeLessThan(31.26);
    expect(chiSquared(corner)).toBeLessThan(31.26);
    expect(chiSquared(colourA)).toBeLessThan(16.27);
    expect(chiSquared(colourB)).toBeLessThan(16.27);
  });
});
