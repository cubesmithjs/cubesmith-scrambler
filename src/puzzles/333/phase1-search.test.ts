import { describe, expect, it } from 'vitest';
import { axisOf } from '../../notation/move';
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

describe('phase1Search — end-axis restrictions', () => {
  it('never opens on a barred axis, and still reaches G1', () => {
    const random = createRandomSource('phase1-first-axis-restriction');
    for (let trial = 0; trial < 20; trial += 1) {
      const state = randomState(random);
      const moves = phase1Search(state, { firstMoveAxis: 'RL' });
      expect(moves.length).toBeGreaterThan(0);
      expect(axisOf(moves[0]!.face)).not.toBe('RL');
      expect(isInG1(toPhase1Coordinate(applyMoves(state, moves)))).toBe(true);
    }
  });

  it('never closes on a barred axis, and still reaches G1', () => {
    const random = createRandomSource('phase1-last-axis-restriction');
    for (let trial = 0; trial < 20; trial += 1) {
      const state = randomState(random);
      const moves = phase1Search(state, { lastMoveAxis: 'FB' });
      expect(axisOf(moves[moves.length - 1]!.face)).not.toBe('FB');
      expect(isInG1(toPhase1Coordinate(applyMoves(state, moves)))).toBe(true);
    }
  });

  it('honours both ends at once', () => {
    const random = createRandomSource('phase1-both-axis-restrictions');
    for (let trial = 0; trial < 20; trial += 1) {
      const state = randomState(random);
      const moves = phase1Search(state, { firstMoveAxis: 'RL', lastMoveAxis: 'FB' });
      expect(axisOf(moves[0]!.face)).not.toBe('RL');
      expect(axisOf(moves[moves.length - 1]!.face)).not.toBe('FB');
      expect(isInG1(toPhase1Coordinate(applyMoves(state, moves)))).toBe(true);
    }
  });

  it('solves every state it is given — a restriction never makes a state unsolvable', () => {
    // The property the uniformity of `333fm` rests on: the restriction changes
    // the route, so no state is ever rejected. See `search-restrictions.ts`.
    const random = createRandomSource('phase1-no-state-rejected');
    for (let trial = 0; trial < 20; trial += 1) {
      const state = randomState(random);
      expect(() => phase1Search(state, { firstMoveAxis: 'UD', lastMoveAxis: 'UD' })).not.toThrow();
    }
  });

  it('an unrestricted call is unchanged', () => {
    const random = createRandomSource('phase1-restrictions-default');
    const state = randomState(random);
    expect(phase1Search(state, {})).toEqual(phase1Search(state));
  });
});
