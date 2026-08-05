import type { RandomSource } from '../../random/random-source';
import { inverseMoves, movesToString } from '../../notation/move';
import { registerScrambler } from '../../core/scrambler-registry';
import { phase1Search } from './phase1-search';
import { phase2Search } from './phase2-search';
import { randomState } from './random-state';
import { applyMoves, type CubeState } from './state';
import type { FaceMove } from './move-tables';

/** A shortest-ish sequence (phase-1 optimal, then phase-2 optimal from wherever phase 1 lands) solving `state` back to `SOLVED_STATE`. */
export function solve333(state: CubeState): FaceMove[] {
  const phase1Moves = phase1Search(state);
  const g1State = applyMoves(state, phase1Moves);
  const phase2Moves = phase2Search(g1State);
  return [...phase1Moves, ...phase2Moves];
}

/**
 * Draws a uniformly random, physically-reachable state and solves it. The
 * **scramble** returned to the caller is the *inverse* of that solution:
 * applying it to a solved cube reproduces the same random state a solver
 * would then have to undo — the same convention official WCA scramble
 * strings use.
 */
export function generate333Scramble(random: RandomSource): string {
  const state = randomState(random);
  const solution = solve333(state);
  return movesToString(inverseMoves(solution));
}

/**
 * Registers `'333'` with the core scrambler registry. Called explicitly
 * (a real function call, not relied upon as an import-time side effect) —
 * see the note in `src/index.ts` for why that distinction matters.
 */
export function register333Scrambler(): void {
  registerScrambler('333', (random) => generate333Scramble(random));
}
