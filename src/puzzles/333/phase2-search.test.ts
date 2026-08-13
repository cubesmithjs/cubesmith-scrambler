import { describe, expect, it } from 'vitest';
import { axisOf } from '../../notation/move';
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
    // The heaviest single test in the suite: 30 full phase-1+phase-2 solves,
    // each after building all 4 pruning tables.
    //
    // 🔴 It used to carry a test-specific 120 s on the stated grounds that it ran
    // "comfortably under 35s standalone". Re-measured 2026-08-13: **59 s
    // standalone under `--coverage`**, and it began failing at 120 s under full
    // parallel load — contention roughly doubles it, which is the very effect the
    // original comment named. Rather than pick a third number that will go stale,
    // it now takes the file-wide 180 s from `vitest.config.ts`, which is the same
    // budget every other solver test gets and leaves 3x headroom on the measured
    // standalone cost.
    //
    // What it must not become is a *speed* test. It asserts that phase 1 and
    // phase 2 together solve the cube; the tables are built once and cached, and
    // none of this reaches real scramble generation.
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

describe('phase2Search — end-axis restrictions', () => {
  /** A G1 state to solve, reached the way `solve333` reaches one. */
  function g1StateFrom(seed: string, trial: number) {
    const random = createRandomSource(`${seed}-${trial}`);
    const scrambled = randomState(random);
    return applyMoves(scrambled, phase1Search(scrambled));
  }

  it('never closes on a barred axis, and still solves', () => {
    // The end that matters most for `333fm`: a two-phase solution's last move
    // is a phase-2 move in all but a vanishing fraction of cases.
    for (let trial = 0; trial < 20; trial += 1) {
      const g1State = g1StateFrom('phase2-last-axis', trial);
      const moves = phase2Search(g1State, { lastMoveAxis: 'FB' });
      expect(isSolved(applyMoves(g1State, moves))).toBe(true);
      if (moves.length > 0) {
        expect(axisOf(moves[moves.length - 1]!.face)).not.toBe('FB');
      }
    }
  });

  it('never opens on a barred axis, and still solves', () => {
    for (let trial = 0; trial < 20; trial += 1) {
      const g1State = g1StateFrom('phase2-first-axis', trial);
      const moves = phase2Search(g1State, { firstMoveAxis: 'UD' });
      expect(isSolved(applyMoves(g1State, moves))).toBe(true);
      if (moves.length > 0) {
        expect(axisOf(moves[0]!.face)).not.toBe('UD');
      }
    }
  });

  it('honours both ends at once, including the four-of-ten case', () => {
    // `'UD'` bars four of the ten phase-2 moves — the harshest restriction
    // available here — and a solution still exists for every state.
    for (let trial = 0; trial < 20; trial += 1) {
      const g1State = g1StateFrom('phase2-both-axes', trial);
      const moves = phase2Search(g1State, { firstMoveAxis: 'UD', lastMoveAxis: 'UD' });
      expect(isSolved(applyMoves(g1State, moves))).toBe(true);
      if (moves.length > 0) {
        expect(axisOf(moves[0]!.face)).not.toBe('UD');
        expect(axisOf(moves[moves.length - 1]!.face)).not.toBe('UD');
      }
    }
  });

  it('an unrestricted call is unchanged', () => {
    const g1State = g1StateFrom('phase2-restrictions-default', 0);
    expect(phase2Search(g1State, {})).toEqual(phase2Search(g1State));
  });
});
