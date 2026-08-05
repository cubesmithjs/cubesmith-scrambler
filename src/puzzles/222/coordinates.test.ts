import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import {
  CORNER_ORIENTATION_222_STATES,
  CORNER_PERM_222_STATES,
  cornerOrientation222Coord,
  cornerPerm222Coord,
  decodeCornerOrientation222Coord,
  decodeCornerPerm222Coord,
  isSolved222Coordinate,
  toCoordinate222,
} from './coordinates';
import { allMoves222, applyMoves222, SOLVED_222_STATE } from './state';

describe('cornerPerm222Coord / decodeCornerPerm222Coord', () => {
  it('the solved permutation encodes to some in-range value, and round-trips', () => {
    const coord = cornerPerm222Coord(SOLVED_222_STATE.cornerPermutation);
    expect(coord).toBeGreaterThanOrEqual(0);
    expect(coord).toBeLessThan(CORNER_PERM_222_STATES);
    expect(decodeCornerPerm222Coord(coord)).toEqual(SOLVED_222_STATE.cornerPermutation);
  });

  it('round-trips for every one of the 5040 permutations', () => {
    for (let coord = 0; coord < CORNER_PERM_222_STATES; coord += 1) {
      const perm = decodeCornerPerm222Coord(coord);
      expect(perm[6]).toBe(6);
      expect(cornerPerm222Coord(perm)).toBe(coord);
    }
  });

  it('round-trips for real scrambled states', () => {
    const random = createRandomSource('222-perm-roundtrip');
    const moves = allMoves222();
    for (let trial = 0; trial < 100; trial += 1) {
      const sequence = Array.from(
        { length: 1 + randomInt(random, 20) },
        () => moves[randomInt(random, moves.length)]!,
      );
      const state = applyMoves222(SOLVED_222_STATE, sequence);
      const coord = cornerPerm222Coord(state.cornerPermutation);
      expect(decodeCornerPerm222Coord(coord)).toEqual(state.cornerPermutation);
    }
  });
});

describe('cornerOrientation222Coord / decodeCornerOrientation222Coord', () => {
  it('the solved orientation encodes to 0', () => {
    expect(cornerOrientation222Coord(SOLVED_222_STATE.cornerOrientation)).toBe(0);
  });

  it('round-trips for every one of the 729 orientation coordinates', () => {
    for (let coord = 0; coord < CORNER_ORIENTATION_222_STATES; coord += 1) {
      const orientation = decodeCornerOrientation222Coord(coord);
      expect(orientation[6]).toBe(0);
      const sum = orientation.reduce((a, b) => a + b, 0);
      expect(sum % 3).toBe(0);
      expect(cornerOrientation222Coord(orientation)).toBe(coord);
    }
  });

  it('round-trips for real scrambled states', () => {
    const random = createRandomSource('222-orientation-roundtrip');
    const moves = allMoves222();
    for (let trial = 0; trial < 100; trial += 1) {
      const sequence = Array.from(
        { length: 1 + randomInt(random, 20) },
        () => moves[randomInt(random, moves.length)]!,
      );
      const state = applyMoves222(SOLVED_222_STATE, sequence);
      const coord = cornerOrientation222Coord(state.cornerOrientation);
      expect(decodeCornerOrientation222Coord(coord)).toEqual(state.cornerOrientation);
    }
  });
});

describe('toCoordinate222 / isSolved222Coordinate', () => {
  it('the solved state is solved', () => {
    expect(isSolved222Coordinate(toCoordinate222(SOLVED_222_STATE))).toBe(true);
  });

  it('a single move is not solved', () => {
    const state = applyMoves222(SOLVED_222_STATE, [{ face: 'R', amount: 1 }]);
    expect(isSolved222Coordinate(toCoordinate222(state))).toBe(false);
  });
});
