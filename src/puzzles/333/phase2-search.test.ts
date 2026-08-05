import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { phase1Search } from './phase1-search';
import { phase2Search } from './phase2-search';
import { randomState } from './random-state';
import { applyMoves, isSolved, SOLVED_STATE } from './state';

describe('phase2Search', () => {
  it('the solved state needs no moves', () => {
    expect(phase2Search(SOLVED_STATE)).toEqual([]);
  });

  it(
    'combined with phase1Search, fully solves many random states end to end',
    () => {
      const random = createRandomSource('phase2-search-full-solve');
      for (let trial = 0; trial < 30; trial += 1) {
        const scrambled = randomState(random);
        const phase1Moves = phase1Search(scrambled);
        const g1State = applyMoves(scrambled, phase1Moves);
        const phase2Moves = phase2Search(g1State);
        const finalState = applyMoves(g1State, phase2Moves);
        expect(isSolved(finalState)).toBe(true);
      }
    },
    // The heaviest single test in the suite (30 full phase-1+phase-2
    // solves, each after building all 4 pruning tables) — comfortably
    // under 35s standalone, but v8 coverage instrumentation and/or
    // CPU contention from other test files running concurrently can push
    // it past a lower bound. A generous, test-specific timeout here (built
    // once and cached, no impact on real-world scramble generation speed)
    // is simpler than raising the whole file's default for every test.
    120000,
  );

  it('never turns the same face twice in a row', () => {
    const random = createRandomSource('phase2-search-no-redundant-moves');
    for (let trial = 0; trial < 30; trial += 1) {
      const scrambled = randomState(random);
      const g1State = applyMoves(scrambled, phase1Search(scrambled));
      const moves = phase2Search(g1State);
      for (let i = 1; i < moves.length; i += 1) {
        expect(moves[i]!.face).not.toBe(moves[i - 1]!.face);
      }
    }
  });
});
