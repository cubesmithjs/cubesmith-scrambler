import { registerScrambler } from '../../core/scrambler-registry';
import type { RandomSource } from '../../random/random-source';
import { randomPermutation } from '../../utils/permutation';
import { ALL_MOVES_FTO, MOVE_COUNT_FTO, mayFollow } from './coordinates';
import { ftoMovesToString, inverseFtoMoves } from './notation';
import { prepareFtoTables } from './phases';
import { randomFtoState } from './random-state';
import { solveFto } from './search';
import { applyFtoMove, isSolvedFto, type FtoState } from './state';

/**
 * The fewest moves a scramble's state must need — **provisional**.
 *
 * The FTO regulations are not published yet (a draft is expected in the
 * January 2027 cycle). Until they are, this is WCA Regulation 4b3's general
 * floor — *"all states that require at least 2 moves to solve"* — which is what
 * every event without a number of its own gets, 3x3x3 included. Raised past
 * that, a state that is solvable in three moves would need refusing too;
 * {@link isAtLeastMovesFromSolved} can prove any small bound, so changing it
 * is this one number. See `fto_event_plan/00-official-baseline.md` §5.
 */
export const MIN_FTO_SOLVE_DISTANCE = 2;

/**
 * Whether no sequence of fewer than `minimum` moves solves `state`.
 *
 * FTO is far too large for an optimal solver, so the package cannot know a
 * state's exact distance — but it can *prove a lower bound* by trying every
 * shorter sequence, which for a floor of two or three is a few hundred states.
 * The same pruning the search uses (no face twice running, opposite faces in one
 * order) keeps it exhaustive: every sequence it skips equals one it tries.
 */
export function isAtLeastMovesFromSolved(state: FtoState, minimum: number): boolean {
  const solvableWithin = (s: FtoState, depth: number, last: number): boolean => {
    if (isSolvedFto(s)) return true;
    if (depth === 0) return false;
    for (let m = 0; m < MOVE_COUNT_FTO; m += 1) {
      if (!mayFollow(last, m)) continue;
      if (solvableWithin(applyFtoMove(s, ALL_MOVES_FTO[m]!), depth - 1, m)) return true;
    }
    return false;
  };
  return !solvableWithin(state, minimum - 1, -1);
}

/**
 * Draws a uniformly random FTO state far enough from solved to be a legal
 * scramble, solves it, and returns the inverse.
 *
 * Redrawing on a state that is too close keeps the draw uniform over the states
 * that qualify (`core/scramble-shape.ts` gives the argument). At a floor of two
 * it never actually redraws in practice: 17 of 3.8 × 10²³ visible states qualify
 * for refusal.
 */
export function generateFtoScramble(random: RandomSource): string {
  let state = randomFtoState(random);
  while (!isAtLeastMovesFromSolved(state, MIN_FTO_SOLVE_DISTANCE)) state = randomFtoState(random);
  const moveOrder = randomPermutation(random, MOVE_COUNT_FTO);
  return ftoMovesToString(inverseFtoMoves(solveFto(state, { moveOrder })));
}

/** Builds every table the solver reads; memoised, so a second call is cheap. */
export function prepareFtoScrambler(): void {
  prepareFtoTables();
}

/** Registers `'fto'` — called explicitly from `src/index.ts`. */
export function registerFtoScrambler(): void {
  registerScrambler('fto', (random) => generateFtoScramble(random), 'random-state', prepareFtoScrambler);
}
