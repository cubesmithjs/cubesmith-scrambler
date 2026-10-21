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
/**
 * 🔴 **Joint** distributions, at much higher power. A single-slot test cannot see a
 * draw that is uniform on each part but *links* two parts — the classic bug when
 * one parity is repaired using another — and the group has no such link
 * (`state.test.ts`), so the draw must not invent one. Each test is against the
 * exact expected count per cell, at the 0.1% critical value for its degrees of
 * freedom (Wilson–Hilferty, computed in the test).
 */
describe('randomFtoState — joint uniformity', () => {
  const DRAWS = 264_000;
  const draws = (() => {
    const random = createRandomSource('fto-joint');
    return Array.from({ length: DRAWS }, () => randomFtoState(random));
  })();

  function critical(df: number): number {
    const z = 3.0902; // the 0.1% upper quantile of the standard normal
    const a = 2 / (9 * df);
    return df * (1 - a + z * Math.sqrt(a)) ** 3;
  }
  function chiSquared(counts: readonly number[], expected: readonly number[]): number {
    return counts.reduce((sum, c, i) => sum + (c - expected[i]!) ** 2 / expected[i]!, 0);
  }
  function check(counts: number[], probabilities: number[]): void {
    const expected = probabilities.map((p) => p * DRAWS);
    const cells = probabilities.filter((p) => p > 0).length;
    const df = cells - 1;
    const kept = counts.filter((_, i) => probabilities[i]! > 0);
    const keptExpected = expected.filter((_, i) => probabilities[i]! > 0);
    // A zero-probability cell must be exactly zero — that is a constraint, not noise.
    counts.forEach((c, i) => {
      if (probabilities[i] === 0) expect(c, `cell ${i}`).toBe(0);
    });
    expect(chiSquared(kept, keptExpected)).toBeLessThan(critical(df));
  }

  it('places the edges in slots 0 and 1 as every ordered pair, equally (132 cells)', () => {
    const counts = new Array<number>(144).fill(0);
    for (const s of draws) counts[s.edgePermutation[0]! * 12 + s.edgePermutation[1]!]! += 1;
    check(counts, counts.map((_, i) => (Math.floor(i / 12) === i % 12 ? 0 : 1 / 132)));
  });

  it('draws the corners and the edges independently (144 cells)', () => {
    const counts = new Array<number>(144).fill(0);
    for (const s of draws) {
      counts[(2 * s.cornerPermutation[0]! + s.cornerOrientation[0]!) * 12 + s.edgePermutation[0]!]! += 1;
    }
    check(counts, counts.map(() => 1 / 144));
  });

  it('gives every even-sum twist vector the same chance, and odd-sum ones none (64 cells)', () => {
    const counts = new Array<number>(64).fill(0);
    for (const s of draws) counts[s.cornerOrientation.reduce((v, o, i) => v | (o << i), 0)]! += 1;
    const evenSum = (v: number): boolean => v.toString(2).split('1').length % 2 === 1;
    check(counts, counts.map((_, v) => (evenSum(v) ? 1 / 32 : 0)));
  });

  it('colours two centre slots of an orbit with the right joint law (16 cells)', () => {
    // Three of each of four colours in twelve slots: P(c1, c2) = 3/12 · (3 − [c1 = c2]) / 11.
    const counts = new Array<number>(16).fill(0);
    for (const s of draws) counts[centreColour(s.centreB[2]!) * 4 + centreColour(s.centreB[9]!)]! += 1;
    check(counts, counts.map((_, i) => (3 / 12) * ((Math.floor(i / 4) === i % 4 ? 2 : 3) / 11)));
  });

  it('draws the two centre orbits independently of each other (16 cells)', () => {
    const counts = new Array<number>(16).fill(0);
    for (const s of draws) counts[centreColour(s.centreA[4]!) * 4 + centreColour(s.centreB[4]!)]! += 1;
    check(counts, counts.map(() => 1 / 16));
  });
});

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
