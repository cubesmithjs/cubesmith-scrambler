import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { permutationParity } from '../../utils/permutation';
import { distancePyraminx, UNVISITED_DISTANCE_PYRAMINX } from './pruning';
import { randomPyraminxState } from './random-state';
import { toPyraminxCoordinate } from './coordinates';
import { EDGE_COUNT_PYRAMINX, VERTEX_COUNT_PYRAMINX } from './state';

describe('randomPyraminxState draws only reachable states', () => {
  it('every one of 5,000 draws has a finite distance in the pruning table', () => {
    const random = createRandomSource('pyraminx-reachability');
    for (let trial = 0; trial < 5_000; trial += 1) {
      const state = randomPyraminxState(random);
      expect(distancePyraminx(toPyraminxCoordinate(state))).not.toBe(UNVISITED_DISTANCE_PYRAMINX);
    }
  });

  it('respects both constraints explicitly', () => {
    const random = createRandomSource('pyraminx-constraints');
    for (let trial = 0; trial < 5_000; trial += 1) {
      const state = randomPyraminxState(random);
      expect(permutationParity(state.edgePermutation)).toBe(0);
      expect(state.edgeOrientation.reduce((a, b) => a + b, 0) % 2).toBe(0);
      expect(new Set(state.edgePermutation).size).toBe(EDGE_COUNT_PYRAMINX);
      expect(state.axialOrientation).toHaveLength(VERTEX_COUNT_PYRAMINX);
      expect(state.tipOrientation.every((o) => o >= 0 && o <= 2)).toBe(true);
    }
  });
});

/**
 * Uniformity checks. Each marginal is compared against its expected count
 * with a generous tolerance — enough to catch a systematically skewed or
 * stuck coordinate, loose enough never to flake on ordinary sampling noise.
 * The seeds are fixed, so these are deterministic regardless.
 */
describe('randomPyraminxState is uniform over the reachable space', () => {
  const DRAWS = 60_000;

  it('spreads edge-permutation parity classes correctly (all even, never odd)', () => {
    const random = createRandomSource('pyraminx-uniform-perm');
    const counts = new Map<string, number>();
    for (let trial = 0; trial < DRAWS; trial += 1) {
      const key = randomPyraminxState(random).edgePermutation.join(',');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // All 360 even permutations should appear, and no odd one ever can.
    expect(counts.size).toBe(360);
    const expected = DRAWS / 360;
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.6);
      expect(count).toBeLessThan(expected * 1.4);
    }
  });

  it('spreads the 32 legal edge-flip vectors evenly', () => {
    const random = createRandomSource('pyraminx-uniform-flip');
    const counts = new Map<string, number>();
    for (let trial = 0; trial < DRAWS; trial += 1) {
      const key = randomPyraminxState(random).edgeOrientation.join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(32);
    const expected = DRAWS / 32;
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.85);
      expect(count).toBeLessThan(expected * 1.15);
    }
  });

  it('spreads the 81 axial-twist vectors and 81 tip-twist vectors evenly', () => {
    const random = createRandomSource('pyraminx-uniform-twist');
    const axial = new Map<string, number>();
    const tips = new Map<string, number>();
    for (let trial = 0; trial < DRAWS; trial += 1) {
      const state = randomPyraminxState(random);
      const a = state.axialOrientation.join('');
      const t = state.tipOrientation.join('');
      axial.set(a, (axial.get(a) ?? 0) + 1);
      tips.set(t, (tips.get(t) ?? 0) + 1);
    }
    expect(axial.size).toBe(81);
    expect(tips.size).toBe(81);
    const expected = DRAWS / 81;
    for (const counts of [axial, tips]) {
      for (const count of counts.values()) {
        expect(count).toBeGreaterThan(expected * 0.75);
        expect(count).toBeLessThan(expected * 1.25);
      }
    }
  });
});

describe('seeding', () => {
  it('the same seed reproduces the same state', () => {
    const a = randomPyraminxState(createRandomSource('same'));
    const b = randomPyraminxState(createRandomSource('same'));
    expect(a).toEqual(b);
  });
});
