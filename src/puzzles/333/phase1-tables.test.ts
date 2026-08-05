import { describe, expect, it } from 'vitest';
import { toPhase1Coordinate } from './coordinates';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { ALL_MOVES, nextFlip, nextTwist, nextUdSlice } from './phase1-tables';
import { applyMove, applyMoves, SOLVED_STATE } from './state';
import { randomState } from './random-state';

describe('phase1-tables — cross-check against direct CubeState application', () => {
  it('agrees with applying the move to a full CubeState, for many random states and every move', () => {
    const random = createRandomSource('phase1-table-cross-check');
    for (let trial = 0; trial < 100; trial += 1) {
      const state = randomState(random);
      const before = toPhase1Coordinate(state);
      const move = ALL_MOVES[randomInt(random, ALL_MOVES.length)]!;
      const afterDirect = toPhase1Coordinate(applyMove(state, move));
      expect(nextTwist(before.twist, move)).toBe(afterDirect.twist);
      expect(nextFlip(before.flip, move)).toBe(afterDirect.flip);
      expect(nextUdSlice(before.udSlice, move)).toBe(afterDirect.udSlice);
    }
  });

  it('agrees for every move applied to the solved state', () => {
    const solved = toPhase1Coordinate(SOLVED_STATE);
    for (const move of ALL_MOVES) {
      const afterDirect = toPhase1Coordinate(applyMove(SOLVED_STATE, move));
      expect(nextTwist(solved.twist, move)).toBe(afterDirect.twist);
      expect(nextFlip(solved.flip, move)).toBe(afterDirect.flip);
      expect(nextUdSlice(solved.udSlice, move)).toBe(afterDirect.udSlice);
    }
  });
});

describe('phase1-tables — structural invariants', () => {
  it('every move has order dividing 4 in each coordinate, starting from solved', () => {
    const solved = toPhase1Coordinate(SOLVED_STATE);
    for (const move of ALL_MOVES) {
      let twist = solved.twist;
      let flip = solved.flip;
      let udSlice = solved.udSlice;
      for (let i = 0; i < 4; i += 1) {
        twist = nextTwist(twist, move);
        flip = nextFlip(flip, move);
        udSlice = nextUdSlice(udSlice, move);
      }
      expect(twist).toBe(solved.twist);
      expect(flip).toBe(solved.flip);
      expect(udSlice).toBe(solved.udSlice);
    }
  });

  it('a long random walk in coordinate space matches the same walk applied to a full CubeState', () => {
    const random = createRandomSource('phase1-table-walk');
    const moves = Array.from({ length: 40 }, () => ALL_MOVES[randomInt(random, ALL_MOVES.length)]!);

    let twist = toPhase1Coordinate(SOLVED_STATE).twist;
    let flip = toPhase1Coordinate(SOLVED_STATE).flip;
    let udSlice = toPhase1Coordinate(SOLVED_STATE).udSlice;
    for (const move of moves) {
      twist = nextTwist(twist, move);
      flip = nextFlip(flip, move);
      udSlice = nextUdSlice(udSlice, move);
    }

    const direct = toPhase1Coordinate(applyMoves(SOLVED_STATE, moves));
    expect({ twist, flip, udSlice }).toEqual(direct);
  });
});
