import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import {
  CORNER_ORIENTATION_STATES,
  EDGE_ORIENTATION_STATES,
  SOLVED_UD_SLICE_COORD,
  UD_SLICE_STATES,
  toPhase1Coordinate,
} from './coordinates';
import { ALL_MOVES, nextFlip, nextTwist, nextUdSlice } from './phase1-tables';
import {
  UNVISITED_DISTANCE,
  flipUdSliceDistance,
  phase1Heuristic,
  twistUdSliceDistance,
} from './phase1-pruning';
import { applyMoves, SOLVED_STATE } from './state';

describe('twistUdSliceDistance / flipUdSliceDistance', () => {
  it('distance from the solved pair to itself is 0', () => {
    expect(twistUdSliceDistance(0, SOLVED_UD_SLICE_COORD)).toBe(0);
    expect(flipUdSliceDistance(0, SOLVED_UD_SLICE_COORD)).toBe(0);
  });

  it('every (twist, udSlice) pair is reachable — no UNVISITED entries remain', () => {
    let unvisitedCount = 0;
    for (let twist = 0; twist < CORNER_ORIENTATION_STATES; twist += 1) {
      for (let udSlice = 0; udSlice < UD_SLICE_STATES; udSlice += 1) {
        if (twistUdSliceDistance(twist, udSlice) === UNVISITED_DISTANCE) unvisitedCount += 1;
      }
    }
    expect(unvisitedCount).toBe(0);
  });

  it('every (flip, udSlice) pair is reachable — no UNVISITED entries remain', () => {
    let unvisitedCount = 0;
    for (let flip = 0; flip < EDGE_ORIENTATION_STATES; flip += 1) {
      for (let udSlice = 0; udSlice < UD_SLICE_STATES; udSlice += 1) {
        if (flipUdSliceDistance(flip, udSlice) === UNVISITED_DISTANCE) unvisitedCount += 1;
      }
    }
    expect(unvisitedCount).toBe(0);
  });

  it('distances stay within a sane bound (catches a runaway/broken BFS)', () => {
    let maxTwistDist = 0;
    for (let twist = 0; twist < CORNER_ORIENTATION_STATES; twist += 1) {
      for (let udSlice = 0; udSlice < UD_SLICE_STATES; udSlice += 1) {
        maxTwistDist = Math.max(maxTwistDist, twistUdSliceDistance(twist, udSlice));
      }
    }
    expect(maxTwistDist).toBeGreaterThan(0);
    expect(maxTwistDist).toBeLessThan(20);
  });

  it('BFS layering is consistent: every non-zero entry has a neighbor exactly one layer closer', () => {
    // Spot-check a sample rather than all ~1M entries, for test speed.
    const random = createRandomSource('layering-check');
    for (let i = 0; i < 500; i += 1) {
      const twist = randomInt(random, CORNER_ORIENTATION_STATES);
      const udSlice = randomInt(random, UD_SLICE_STATES);
      const dist = twistUdSliceDistance(twist, udSlice);
      if (dist === 0) continue;
      const hasCloserNeighbor = ALL_MOVES.some(
        (move) =>
          twistUdSliceDistance(nextTwist(twist, move), nextUdSlice(udSlice, move)) === dist - 1,
      );
      expect(hasCloserNeighbor).toBe(true);
    }
  });

  it('BFS layering is consistent for the flip/udSlice table too', () => {
    const random = createRandomSource('flip-layering-check');
    for (let i = 0; i < 500; i += 1) {
      const flip = randomInt(random, EDGE_ORIENTATION_STATES);
      const udSlice = randomInt(random, UD_SLICE_STATES);
      const dist = flipUdSliceDistance(flip, udSlice);
      if (dist === 0) continue;
      const hasCloserNeighbor = ALL_MOVES.some(
        (move) =>
          flipUdSliceDistance(nextFlip(flip, move), nextUdSlice(udSlice, move)) === dist - 1,
      );
      expect(hasCloserNeighbor).toBe(true);
    }
  });
});

describe('phase1Heuristic — admissibility', () => {
  it('is 0 exactly at the solved coordinate', () => {
    const solved = toPhase1Coordinate(SOLVED_STATE);
    expect(phase1Heuristic(solved.twist, solved.flip, solved.udSlice)).toBe(0);
  });

  it('never overestimates the true distance: after scrambling with N random moves, the heuristic is always <= N', () => {
    const random = createRandomSource('admissibility-check');
    for (let trial = 0; trial < 200; trial += 1) {
      const n = 1 + randomInt(random, 12);
      const moves = Array.from({ length: n }, () => ALL_MOVES[randomInt(random, ALL_MOVES.length)]!);
      const state = applyMoves(SOLVED_STATE, moves);
      const coord = toPhase1Coordinate(state);
      const heuristic = phase1Heuristic(coord.twist, coord.flip, coord.udSlice);
      // The reverse of the N scrambling moves is *a* valid solution of
      // length N, so the true shortest distance — and therefore the
      // admissible heuristic, which must never exceed it — is at most N.
      expect(heuristic).toBeLessThanOrEqual(n);
    }
  });
});
