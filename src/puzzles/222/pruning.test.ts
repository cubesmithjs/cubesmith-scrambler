import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import {
  CORNER_ORIENTATION_222_STATES,
  CORNER_PERM_222_STATES,
  SOLVED_CORNER_ORIENTATION_222_COORD,
  SOLVED_CORNER_PERM_222_COORD,
  toCoordinate222,
} from './coordinates';
import { distance222, UNVISITED_DISTANCE_222 } from './pruning';
import { ALL_MOVES_222, nextCornerOrientation222, nextCornerPerm222 } from './tables';
import { applyMoves222, SOLVED_222_STATE } from './state';

describe('distance222', () => {
  it('distance from solved to itself is 0', () => {
    expect(distance222(SOLVED_CORNER_PERM_222_COORD, SOLVED_CORNER_ORIENTATION_222_COORD)).toBe(0);
  });

  it('every reachable (perm, orientation) pair in the *entire* group is visited — the well-known Pocket Cube order is 7! x 3^6 = 3,674,160, so this fully-covered table is a strong cross-check', () => {
    let unvisited = 0;
    for (let perm = 0; perm < CORNER_PERM_222_STATES; perm += 1) {
      for (let orientation = 0; orientation < CORNER_ORIENTATION_222_STATES; orientation += 1) {
        if (distance222(perm, orientation) === UNVISITED_DISTANCE_222) unvisited += 1;
      }
    }
    expect(unvisited).toBe(0);
  });

  it('max distance stays within a sane bound (catches a runaway/broken BFS)', () => {
    let max = 0;
    for (let perm = 0; perm < CORNER_PERM_222_STATES; perm += 1) {
      for (let orientation = 0; orientation < CORNER_ORIENTATION_222_STATES; orientation += 1) {
        max = Math.max(max, distance222(perm, orientation));
      }
    }
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThan(20);
  });

  it('BFS layering is consistent: every non-zero entry has a neighbor exactly one layer closer', () => {
    const random = createRandomSource('222-layering-check');
    for (let i = 0; i < 500; i += 1) {
      const perm = randomInt(random, CORNER_PERM_222_STATES);
      const orientation = randomInt(random, CORNER_ORIENTATION_222_STATES);
      const dist = distance222(perm, orientation);
      if (dist === 0) continue;
      const hasCloserNeighbor = ALL_MOVES_222.some(
        (move) =>
          distance222(nextCornerPerm222(perm, move), nextCornerOrientation222(orientation, move)) ===
          dist - 1,
      );
      expect(hasCloserNeighbor).toBe(true);
    }
  });

  it('never overestimates the true distance: after scrambling with N random moves, distance is always <= N', () => {
    const random = createRandomSource('222-admissibility');
    for (let trial = 0; trial < 200; trial += 1) {
      const n = 1 + randomInt(random, 15);
      const moves = Array.from({ length: n }, () => ALL_MOVES_222[randomInt(random, ALL_MOVES_222.length)]!);
      const state = applyMoves222(SOLVED_222_STATE, moves);
      const coord = toCoordinate222(state);
      expect(distance222(coord.cornerPerm, coord.cornerOrientation)).toBeLessThanOrEqual(n);
    }
  });
});
