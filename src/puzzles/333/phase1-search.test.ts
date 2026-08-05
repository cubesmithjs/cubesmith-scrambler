import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { isInG1, toPhase1Coordinate } from './coordinates';
import { phase1Search } from './phase1-search';
import { randomState } from './random-state';
import { applyMoves, SOLVED_STATE } from './state';

describe('phase1Search', () => {
  it('the solved state needs no moves', () => {
    expect(phase1Search(SOLVED_STATE)).toEqual([]);
  });

  it('finds a sequence that actually reaches G1, for many random states', () => {
    const random = createRandomSource('phase1-search-correctness');
    for (let trial = 0; trial < 30; trial += 1) {
      const state = randomState(random);
      const moves = phase1Search(state);
      const result = applyMoves(state, moves);
      expect(isInG1(toPhase1Coordinate(result))).toBe(true);
    }
  });

  it('never turns the same face twice in a row', () => {
    const random = createRandomSource('phase1-search-no-redundant-moves');
    for (let trial = 0; trial < 30; trial += 1) {
      const state = randomState(random);
      const moves = phase1Search(state);
      for (let i = 1; i < moves.length; i += 1) {
        expect(moves[i]!.face).not.toBe(moves[i - 1]!.face);
      }
    }
  });

  it('a state already in G1 needs no moves', () => {
    // A single U turn stays in G1 (verified in coordinates.test.ts).
    const state = applyMoves(SOLVED_STATE, [{ face: 'U', amount: 1 }]);
    expect(phase1Search(state)).toEqual([]);
  });
});
