import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { permutationParity } from '../../utils/permutation';
import {
  packSkewbCoordinate,
  skewbCoordinateStates,
  toSkewbCoordinate,
} from './coordinates';
import { distanceSkewb, UNVISITED_DISTANCE_SKEWB } from './pruning';
import { randomSkewbState } from './random-state';

describe('randomSkewbState draws only reachable states', () => {
  it('every one of 5,000 draws has a finite distance', () => {
    const random = createRandomSource('skewb-reachability');
    for (let trial = 0; trial < 5_000; trial += 1) {
      expect(distanceSkewb(toSkewbCoordinate(randomSkewbState(random)))).not.toBe(
        UNVISITED_DISTANCE_SKEWB,
      );
    }
  });

  it('the drawn states satisfy the puzzle’s parity invariants', () => {
    const random = createRandomSource('skewb-parities');
    for (let trial = 0; trial < 5_000; trial += 1) {
      const state = randomSkewbState(random);
      expect(permutationParity(state.cornerPermutation)).toBe(0);
      expect(permutationParity(state.centerPermutation)).toBe(0);
      expect(state.cornerPermutation[0]).toBe(0);
      expect(state.cornerOrientation[0]).toBe(0);
    }
  });
});

/**
 * Uniformity. Because the coordinate space *is* the reachable space, this
 * reduces to "is the index uniform" — but that's worth checking rather than
 * assuming, and the marginals below would each catch a stuck or skewed
 * coordinate. Fixed seeds keep it deterministic; the tolerances are loose
 * enough never to flake and tight enough to catch a real bias.
 */
describe('randomSkewbState is uniform over the 3,149,280 reachable states', () => {
  it('packed indices spread evenly across the space', () => {
    const random = createRandomSource('skewb-uniform-index');
    const BUCKETS = 64;
    const DRAWS = 200_000;
    const bucketSize = skewbCoordinateStates() / BUCKETS;
    const counts = new Array<number>(BUCKETS).fill(0);

    for (let trial = 0; trial < DRAWS; trial += 1) {
      const index = packSkewbCoordinate(toSkewbCoordinate(randomSkewbState(random)));
      counts[Math.min(BUCKETS - 1, Math.floor(index / bucketSize))]! += 1;
    }

    const expected = DRAWS / BUCKETS;
    for (const count of counts) {
      expect(count).toBeGreaterThan(expected * 0.9);
      expect(count).toBeLessThan(expected * 1.1);
    }
  });

  it('the distance distribution matches the pruning table’s own', () => {
    // If the draw were biased toward any region of the space, the sampled
    // distance histogram would drift away from the table's exact one.
    const random = createRandomSource('skewb-uniform-distance');
    const DRAWS = 100_000;
    const sampled = new Map<number, number>();
    for (let trial = 0; trial < DRAWS; trial += 1) {
      const d = distanceSkewb(toSkewbCoordinate(randomSkewbState(random)));
      sampled.set(d, (sampled.get(d) ?? 0) + 1);
    }

    // Exact population shares, from the table: distances 8 and 9 together
    // account for the great majority of all Skewb states.
    const share8 = (sampled.get(8) ?? 0) / DRAWS;
    const share9 = (sampled.get(9) ?? 0) / DRAWS;
    expect(share8).toBeGreaterThan(1_225_483 / 3_149_280 - 0.01);
    expect(share8).toBeLessThan(1_225_483 / 3_149_280 + 0.01);
    expect(share9).toBeGreaterThan(1_455_856 / 3_149_280 - 0.01);
    expect(share9).toBeLessThan(1_455_856 / 3_149_280 + 0.01);
  });
});

describe('seeding', () => {
  it('the same seed reproduces the same state', () => {
    expect(randomSkewbState(createRandomSource('same'))).toEqual(
      randomSkewbState(createRandomSource('same')),
    );
  });
});
