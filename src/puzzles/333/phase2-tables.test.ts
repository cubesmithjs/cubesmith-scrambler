import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { toPhase2Coordinate } from './phase2-coordinates';
import {
  PHASE2_MOVES,
  nextCornerPerm,
  nextEdge8Perm,
  nextUdSliceOrder,
} from './phase2-tables';
import { phase1Search } from './phase1-search';
import { randomState } from './random-state';
import { applyMove, applyMoves, SOLVED_STATE } from './state';

describe('phase2-tables — cross-check against direct CubeState application', () => {
  it('agrees with applying the move to a full CubeState, for many random G1 states', () => {
    const random = createRandomSource('phase2-table-cross-check');
    for (let trial = 0; trial < 50; trial += 1) {
      const scrambled = randomState(random);
      const g1State = applyMoves(scrambled, phase1Search(scrambled));
      const before = toPhase2Coordinate(g1State);
      const move = PHASE2_MOVES[randomInt(random, PHASE2_MOVES.length)]!;
      const afterDirect = toPhase2Coordinate(applyMove(g1State, move));

      expect(nextCornerPerm(before.cornerPerm, move)).toBe(afterDirect.cornerPerm);
      expect(nextEdge8Perm(before.edge8Perm, move)).toBe(afterDirect.edge8Perm);
      expect(nextUdSliceOrder(before.udSliceOrder, move)).toBe(afterDirect.udSliceOrder);
    }
  });
});

describe('phase2-tables — structural invariants', () => {
  it('U and D (any amount) applied 4 times return to solved', () => {
    const solved = toPhase2Coordinate(SOLVED_STATE);
    for (const move of PHASE2_MOVES.filter((m) => m.face === 'U' || m.face === 'D')) {
      let cornerPerm = solved.cornerPerm;
      let edge8Perm = solved.edge8Perm;
      let udSliceOrder = solved.udSliceOrder;
      for (let i = 0; i < 4; i += 1) {
        cornerPerm = nextCornerPerm(cornerPerm, move);
        edge8Perm = nextEdge8Perm(edge8Perm, move);
        udSliceOrder = nextUdSliceOrder(udSliceOrder, move);
      }
      expect(cornerPerm).toBe(solved.cornerPerm);
      expect(edge8Perm).toBe(solved.edge8Perm);
      expect(udSliceOrder).toBe(solved.udSliceOrder);
    }
  });

  it('the half-turn-only moves (L2/R2/F2/B2) applied twice return to solved', () => {
    const solved = toPhase2Coordinate(SOLVED_STATE);
    for (const move of PHASE2_MOVES.filter((m) => m.face !== 'U' && m.face !== 'D')) {
      let cornerPerm = solved.cornerPerm;
      let edge8Perm = solved.edge8Perm;
      let udSliceOrder = solved.udSliceOrder;
      for (let i = 0; i < 2; i += 1) {
        cornerPerm = nextCornerPerm(cornerPerm, move);
        edge8Perm = nextEdge8Perm(edge8Perm, move);
        udSliceOrder = nextUdSliceOrder(udSliceOrder, move);
      }
      expect(cornerPerm).toBe(solved.cornerPerm);
      expect(edge8Perm).toBe(solved.edge8Perm);
      expect(udSliceOrder).toBe(solved.udSliceOrder);
    }
  });

  it('a long random walk in coordinate space matches the same walk applied to a full CubeState', () => {
    const random = createRandomSource('phase2-table-walk');
    const moves = Array.from(
      { length: 30 },
      () => PHASE2_MOVES[randomInt(random, PHASE2_MOVES.length)]!,
    );

    const solved = toPhase2Coordinate(SOLVED_STATE);
    let cornerPerm = solved.cornerPerm;
    let edge8Perm = solved.edge8Perm;
    let udSliceOrder = solved.udSliceOrder;
    for (const move of moves) {
      cornerPerm = nextCornerPerm(cornerPerm, move);
      edge8Perm = nextEdge8Perm(edge8Perm, move);
      udSliceOrder = nextUdSliceOrder(udSliceOrder, move);
    }

    const direct = toPhase2Coordinate(applyMoves(SOLVED_STATE, moves));
    expect({ cornerPerm, edge8Perm, udSliceOrder }).toEqual(direct);
  });
});
