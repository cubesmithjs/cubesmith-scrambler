import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import {
  ALL_MOVES_SKEWB,
  buildProjectionsSkewb,
  centerCoordSkewb,
  centerStatesSkewb,
  cornerCoordSkewb,
  cornerStatesSkewb,
  isSolvedSkewbCoordinate,
  nextCenterCoordSkewb,
  nextCornerCoordSkewb,
  packSkewbCoordinate,
  skewbCoordinateStates,
  toSkewbCoordinate,
  unpackSkewbState,
} from './coordinates';
import { applySkewbMoves, skewbStatesEqual, SOLVED_SKEWB_STATE } from './state';

buildProjectionsSkewb();

/**
 * The projection sizes are *discovered* by BFS, never declared — so these
 * assertions are checking the derived move tables against published facts
 * about the puzzle, not checking the code against itself.
 */
describe('the discovered projection sizes reproduce the published Skewb figures', () => {
  it('corners (permutation and twist jointly) span 8,748 states', () => {
    expect(cornerStatesSkewb()).toBe(8_748);
  });

  it('centers span 360 states — half of 6!, i.e. exactly the even permutations', () => {
    expect(centerStatesSkewb()).toBe(360);
    expect(centerStatesSkewb() * 2).toBe(720);
  });

  it('their product is 3,149,280 — the published number of Skewb positions', () => {
    expect(skewbCoordinateStates()).toBe(3_149_280);
  });

  it('corner permutation and twist really do have to be ranked jointly', () => {
    // Separately the corner permutation spans 36 values and the twist vector
    // spans 3^7 = 2187, whose product is 78,732 — nine times too many. The
    // joint projection absorbs that coupling instead of leaving 8/9 of the
    // table unreachable.
    expect(36 * 3 ** 7).toBe(78_732);
    expect(78_732 / cornerStatesSkewb()).toBe(9);
  });
});

describe('coordinates round-trip', () => {
  it('pack ∘ toCoordinate ∘ unpack is the identity on every sampled index', () => {
    const random = createRandomSource('skewb-pack-round-trip');
    for (let trial = 0; trial < 20_000; trial += 1) {
      const index = randomInt(random, skewbCoordinateStates());
      expect(packSkewbCoordinate(toSkewbCoordinate(unpackSkewbState(index)))).toBe(index);
    }
  });

  it('unpack produces a genuine state: permutations and twists in range', () => {
    const random = createRandomSource('skewb-unpack-validity');
    for (let trial = 0; trial < 5_000; trial += 1) {
      const state = unpackSkewbState(randomInt(random, skewbCoordinateStates()));
      expect(new Set(state.cornerPermutation).size).toBe(8);
      expect(new Set(state.centerPermutation).size).toBe(6);
      expect(state.cornerOrientation.every((o) => o >= 0 && o <= 2)).toBe(true);
    }
  });

  it('solved maps to index 0 and is recognised', () => {
    const coordinate = toSkewbCoordinate(SOLVED_SKEWB_STATE);
    expect(packSkewbCoordinate(coordinate)).toBe(0);
    expect(isSolvedSkewbCoordinate(coordinate)).toBe(true);
    expect(isSolvedSkewbCoordinate({ corners: 1, centers: 0 })).toBe(false);
    expect(isSolvedSkewbCoordinate({ corners: 0, centers: 1 })).toBe(false);
    expect(skewbStatesEqual(unpackSkewbState(0), SOLVED_SKEWB_STATE)).toBe(true);
  });

  it('rejects an out-of-range index and an unreachable state', () => {
    expect(() => unpackSkewbState(skewbCoordinateStates())).toThrow();
    expect(() =>
      // Two corners swapped is an odd permutation and cannot occur.
      cornerCoordSkewb({ ...SOLVED_SKEWB_STATE, cornerPermutation: [0, 2, 1, 3, 4, 5, 6, 7] }),
    ).toThrow(/not a reachable/);
    expect(() =>
      centerCoordSkewb({ ...SOLVED_SKEWB_STATE, centerPermutation: [1, 0, 2, 3, 4, 5] }),
    ).toThrow(/not a reachable/);
  });
});

/**
 * The check that catches modelling bugs: for many random states and every
 * move, the coordinate transition tables must agree with applying that move
 * to the full state and re-encoding.
 */
describe('coordinate move tables agree with full-state move application', () => {
  it('holds for 3,000 random states x all 8 moves', () => {
    const random = createRandomSource('skewb-table-cross-check');
    for (let trial = 0; trial < 3_000; trial += 1) {
      const sequence = Array.from(
        { length: randomInt(random, 24) },
        () => ALL_MOVES_SKEWB[randomInt(random, ALL_MOVES_SKEWB.length)]!,
      );
      const state = applySkewbMoves(SOLVED_SKEWB_STATE, sequence);
      const coordinate = toSkewbCoordinate(state);

      for (let m = 0; m < ALL_MOVES_SKEWB.length; m += 1) {
        const direct = toSkewbCoordinate(applySkewbMoves(state, [ALL_MOVES_SKEWB[m]!]));
        expect(nextCornerCoordSkewb(coordinate.corners, m)).toBe(direct.corners);
        expect(nextCenterCoordSkewb(coordinate.centers, m)).toBe(direct.centers);
      }
    }
  });
});
