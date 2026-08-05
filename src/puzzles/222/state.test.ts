import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { inverseMoves } from '../../notation/move';
import { randomInt } from '../../utils/random-int';
import {
  allMoves222,
  applyMove222,
  applyMoves222,
  CORNER_COUNT_222,
  isSolved222,
  SOLVED_222_STATE,
  statesEqual222,
  type Cube222State,
} from './state';

describe('every 2x2x2 move has order 4', () => {
  for (const move of allMoves222()) {
    it(`${move.face}${move.amount}`, () => {
      let state: Cube222State = SOLVED_222_STATE;
      for (let i = 0; i < 4; i += 1) state = applyMove222(state, move);
      expect(statesEqual222(state, SOLVED_222_STATE)).toBe(true);
    });
  }
});

describe('corner 6 (DBL) is never touched by U/R/F — the standard fixed reference corner', () => {
  it('stays at position 6 with orientation 0 across many random U/R/F sequences', () => {
    const random = createRandomSource('222-fixed-corner-check');
    const moves = allMoves222();
    for (let trial = 0; trial < 100; trial += 1) {
      const sequence = Array.from(
        { length: 1 + randomInt(random, 30) },
        () => moves[randomInt(random, moves.length)]!,
      );
      const state = applyMoves222(SOLVED_222_STATE, sequence);
      expect(state.cornerPermutation[6]).toBe(6);
      expect(state.cornerOrientation[6]).toBe(0);
    }
  });
});

describe('amount=2/amount=3 agree with repeated amount=1 application', () => {
  const faces = ['U', 'R', 'F'] as const;

  it('amount=2 equals two amount=1 applications', () => {
    for (const face of faces) {
      const viaHalf = applyMove222(SOLVED_222_STATE, { face, amount: 2 });
      const viaTwoQuarters = applyMove222(applyMove222(SOLVED_222_STATE, { face, amount: 1 }), {
        face,
        amount: 1,
      });
      expect(statesEqual222(viaHalf, viaTwoQuarters)).toBe(true);
    }
  });

  it('amount=3 equals three amount=1 applications', () => {
    for (const face of faces) {
      const viaPrime = applyMove222(SOLVED_222_STATE, { face, amount: 3 });
      let viaThree: Cube222State = SOLVED_222_STATE;
      for (let i = 0; i < 3; i += 1) viaThree = applyMove222(viaThree, { face, amount: 1 });
      expect(statesEqual222(viaPrime, viaThree)).toBe(true);
    }
  });
});

describe('round-trip: a sequence followed by its inverse returns to solved', () => {
  it('holds for many random sequences', () => {
    const random = createRandomSource('222-round-trip');
    const moves = allMoves222();
    for (let trial = 0; trial < 100; trial += 1) {
      const sequence = Array.from(
        { length: 1 + randomInt(random, 25) },
        () => moves[randomInt(random, moves.length)]!,
      );
      const scrambled = applyMoves222(SOLVED_222_STATE, sequence);
      const restored = applyMoves222(scrambled, inverseMoves(sequence));
      expect(statesEqual222(restored, SOLVED_222_STATE)).toBe(true);
    }
  });
});

describe('isSolved222 / statesEqual222', () => {
  it('SOLVED_222_STATE is solved', () => {
    expect(isSolved222(SOLVED_222_STATE)).toBe(true);
  });

  it('a single move is not solved', () => {
    expect(isSolved222(applyMove222(SOLVED_222_STATE, { face: 'R', amount: 1 }))).toBe(false);
  });

  it('rejects a move outside U/R/F', () => {
    expect(() => applyMove222(SOLVED_222_STATE, { face: 'D', amount: 1 })).toThrow();
  });

  it('every corner index appears exactly once in the permutation, always', () => {
    const random = createRandomSource('222-permutation-validity');
    const moves = allMoves222();
    for (let trial = 0; trial < 50; trial += 1) {
      const sequence = Array.from(
        { length: 1 + randomInt(random, 20) },
        () => moves[randomInt(random, moves.length)]!,
      );
      const state = applyMoves222(SOLVED_222_STATE, sequence);
      expect(new Set(state.cornerPermutation).size).toBe(CORNER_COUNT_222);
    }
  });
});
