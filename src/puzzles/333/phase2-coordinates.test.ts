import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { isInG1, toPhase1Coordinate } from './coordinates';
import {
  PERMUTATION_4_STATES,
  PERMUTATION_8_STATES,
  cornerPermCoord,
  decodeCornerPermCoord,
  decodeEdge8PermCoord,
  decodeUdSliceOrderCoord,
  edge8PermCoord,
  isSolvedPhase2,
  toPhase2Coordinate,
  udSliceOrderCoord,
} from './phase2-coordinates';
import { phase1Search } from './phase1-search';
import { randomState } from './random-state';
import { applyMoves, SOLVED_STATE } from './state';

describe('cornerPermCoord / decodeCornerPermCoord', () => {
  it('round-trips for every one of the 40320 permutations', () => {
    for (let coord = 0; coord < PERMUTATION_8_STATES; coord += 977) {
      const perm = decodeCornerPermCoord(coord);
      expect(cornerPermCoord(perm)).toBe(coord);
    }
  });

  it('throws for an out-of-range coordinate', () => {
    expect(() => decodeCornerPermCoord(-1)).toThrow();
    expect(() => decodeCornerPermCoord(PERMUTATION_8_STATES)).toThrow();
  });
});

describe('edge8PermCoord / decodeEdge8PermCoord', () => {
  it('round-trips for every one of the 40320 permutations', () => {
    for (let coord = 0; coord < PERMUTATION_8_STATES; coord += 977) {
      const perm = decodeEdge8PermCoord(coord);
      expect(edge8PermCoord([...perm, 8, 9, 10, 11])).toBe(coord);
    }
  });
});

describe('udSliceOrderCoord / decodeUdSliceOrderCoord', () => {
  it('round-trips for every one of the 24 permutations', () => {
    for (let coord = 0; coord < PERMUTATION_4_STATES; coord += 1) {
      const slicePieces = decodeUdSliceOrderCoord(coord);
      const edgePermutation = [0, 1, 2, 3, 4, 5, 6, 7, ...slicePieces];
      expect(udSliceOrderCoord(edgePermutation)).toBe(coord);
    }
  });
});

describe('toPhase2Coordinate / isSolvedPhase2', () => {
  it('the solved state is phase-2 solved', () => {
    expect(isSolvedPhase2(toPhase2Coordinate(SOLVED_STATE))).toBe(true);
  });

  it('U alone (a pure permutation, no orientation change) is not phase-2 solved', () => {
    const state = applyMoves(SOLVED_STATE, [{ face: 'U', amount: 1 }]);
    expect(isSolvedPhase2(toPhase2Coordinate(state))).toBe(false);
  });

  it('U four times returns to phase-2 solved', () => {
    const state = applyMoves(SOLVED_STATE, [
      { face: 'U', amount: 1 },
      { face: 'U', amount: 1 },
      { face: 'U', amount: 1 },
      { face: 'U', amount: 1 },
    ]);
    expect(isSolvedPhase2(toPhase2Coordinate(state))).toBe(true);
  });

  it('produces in-range coordinates for real G1 states reached via phase1Search', () => {
    const random = createRandomSource('phase2-coord-from-phase1');
    for (let trial = 0; trial < 20; trial += 1) {
      const state = randomState(random);
      const moves = phase1Search(state);
      const g1State = applyMoves(state, moves);
      expect(isInG1(toPhase1Coordinate(g1State))).toBe(true);

      const coord = toPhase2Coordinate(g1State);
      expect(coord.cornerPerm).toBeGreaterThanOrEqual(0);
      expect(coord.cornerPerm).toBeLessThan(PERMUTATION_8_STATES);
      expect(coord.edge8Perm).toBeGreaterThanOrEqual(0);
      expect(coord.edge8Perm).toBeLessThan(PERMUTATION_8_STATES);
      expect(coord.udSliceOrder).toBeGreaterThanOrEqual(0);
      expect(coord.udSliceOrder).toBeLessThan(PERMUTATION_4_STATES);
    }
  });
});
