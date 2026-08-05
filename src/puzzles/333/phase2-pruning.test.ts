import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import {
  PERMUTATION_4_STATES,
  PERMUTATION_8_STATES,
  SOLVED_CORNER_PERM_COORD,
  SOLVED_EDGE8_PERM_COORD,
  SOLVED_UD_SLICE_ORDER_COORD,
} from './phase2-coordinates';
import { PHASE2_MOVES, nextCornerPerm, nextEdge8Perm, nextUdSliceOrder } from './phase2-tables';
import {
  UNVISITED_DISTANCE,
  cornerPermUdSliceOrderDistance,
  edge8PermUdSliceOrderDistance,
  phase2Heuristic,
} from './phase2-pruning';
import { phase1Search } from './phase1-search';
import { randomState } from './random-state';
import { applyMoves, SOLVED_STATE } from './state';
import { toPhase2Coordinate } from './phase2-coordinates';

describe('cornerPermUdSliceOrderDistance / edge8PermUdSliceOrderDistance', () => {
  it('distance from solved to itself is 0', () => {
    expect(cornerPermUdSliceOrderDistance(SOLVED_CORNER_PERM_COORD, SOLVED_UD_SLICE_ORDER_COORD)).toBe(0);
    expect(edge8PermUdSliceOrderDistance(SOLVED_EDGE8_PERM_COORD, SOLVED_UD_SLICE_ORDER_COORD)).toBe(0);
  });

  it('BFS layering is consistent for the corner-perm table', () => {
    const random = createRandomSource('phase2-corner-layering');
    for (let i = 0; i < 500; i += 1) {
      const cornerPerm = randomInt(random, PERMUTATION_8_STATES);
      const udSliceOrder = randomInt(random, PERMUTATION_4_STATES);
      const dist = cornerPermUdSliceOrderDistance(cornerPerm, udSliceOrder);
      if (dist === UNVISITED_DISTANCE || dist === 0) continue;
      const hasCloserNeighbor = PHASE2_MOVES.some(
        (move) =>
          cornerPermUdSliceOrderDistance(
            nextCornerPerm(cornerPerm, move),
            nextUdSliceOrder(udSliceOrder, move),
          ) === dist - 1,
      );
      expect(hasCloserNeighbor).toBe(true);
    }
  });

  it('BFS layering is consistent for the edge8-perm table', () => {
    const random = createRandomSource('phase2-edge8-layering');
    for (let i = 0; i < 500; i += 1) {
      const edge8Perm = randomInt(random, PERMUTATION_8_STATES);
      const udSliceOrder = randomInt(random, PERMUTATION_4_STATES);
      const dist = edge8PermUdSliceOrderDistance(edge8Perm, udSliceOrder);
      if (dist === UNVISITED_DISTANCE || dist === 0) continue;
      const hasCloserNeighbor = PHASE2_MOVES.some(
        (move) =>
          edge8PermUdSliceOrderDistance(
            nextEdge8Perm(edge8Perm, move),
            nextUdSliceOrder(udSliceOrder, move),
          ) === dist - 1,
      );
      expect(hasCloserNeighbor).toBe(true);
    }
  });

  it('every real G1 state (reached via phase1Search) has a *visited* (non-UNVISITED) phase-2 distance', () => {
    // The reachability of the full 3-coordinate phase-2 space is
    // constrained by a parity relationship between corner and edge
    // permutation parity — not every (cornerPerm, udSliceOrder) pair in
    // isolation is necessarily reachable from every possible edge8Perm.
    // What actually matters for correctness is that every *real* scrambled
    // state's own coordinates always resolve to a finite distance, which
    // this checks directly rather than assuming full 2D-table coverage.
    const random = createRandomSource('phase2-real-state-coverage');
    for (let trial = 0; trial < 50; trial += 1) {
      const scrambled = randomState(random);
      const g1State = applyMoves(scrambled, phase1Search(scrambled));
      const coord = toPhase2Coordinate(g1State);
      expect(cornerPermUdSliceOrderDistance(coord.cornerPerm, coord.udSliceOrder)).not.toBe(
        UNVISITED_DISTANCE,
      );
      expect(edge8PermUdSliceOrderDistance(coord.edge8Perm, coord.udSliceOrder)).not.toBe(
        UNVISITED_DISTANCE,
      );
    }
  });
});

describe('phase2Heuristic — admissibility', () => {
  it('is 0 exactly at solved', () => {
    const solved = toPhase2Coordinate(SOLVED_STATE);
    expect(phase2Heuristic(solved.cornerPerm, solved.edge8Perm, solved.udSliceOrder)).toBe(0);
  });

  it('never overestimates the true distance, for real G1 states scrambled by N phase-2 moves', () => {
    const random = createRandomSource('phase2-admissibility');
    for (let trial = 0; trial < 200; trial += 1) {
      const n = 1 + randomInt(random, 12);
      const moves = Array.from({ length: n }, () => PHASE2_MOVES[randomInt(random, PHASE2_MOVES.length)]!);
      const state = applyMoves(SOLVED_STATE, moves);
      const coord = toPhase2Coordinate(state);
      const heuristic = phase2Heuristic(coord.cornerPerm, coord.edge8Perm, coord.udSliceOrder);
      expect(heuristic).toBeLessThanOrEqual(n);
    }
  });
});
