import { registerScrambler } from '../../core/scrambler-registry';
import {
  drawStateAtLeastMovesFromSolved,
  solveAtLeastLength,
} from '../../core/scramble-shape';
import type { RandomSource } from '../../random/random-source';
import { randomPermutation } from '../../utils/permutation';
import { MOVE_COUNT_SKEWB } from './coordinates';
import { inverseSkewbMoves, skewbMovesToString } from './notation';
import { buildPruningTableSkewb } from './pruning';
import { randomSkewbState } from './random-state';
import { skewbSolveDistance, solveSkewbInExactly } from './search';

/** WCA Regulation 4b3c: a Skewb scramble's state must require at least 7 moves to solve. */
export const MIN_SKEWB_SOLVE_DISTANCE = 7;

/**
 * WCA's own scrambler pads every Skewb sequence to 11 moves so a short
 * solution can't be spotted on a printed scramble sheet — see
 * `core/scramble-shape.ts` for why that is a separate rule from the
 * regulation minimum above.
 */
export const MIN_SKEWB_SCRAMBLE_LENGTH = 11;

/**
 * Draws a uniformly random reachable Skewb state that is far enough from
 * solved to be a legal scramble, solves it in exactly enough moves to reach
 * the presentable length, and returns the inverse.
 *
 * Nothing needs appending afterwards: unlike the Pyraminx, a Skewb has no
 * trivially-independent pieces, so the whole puzzle is inside the search.
 */
export function generateSkewbScramble(random: RandomSource): string {
  const state = drawStateAtLeastMovesFromSolved(
    random,
    randomSkewbState,
    skewbSolveDistance,
    MIN_SKEWB_SOLVE_DISTANCE,
  );
  const moveOrder = randomPermutation(random, MOVE_COUNT_SKEWB);
  const solution = solveAtLeastLength(
    skewbSolveDistance(state),
    MIN_SKEWB_SCRAMBLE_LENGTH,
    (length) => solveSkewbInExactly(state, length, moveOrder),
  );
  return skewbMovesToString(inverseSkewbMoves(solution));
}

/** Builds the pruning table now; memoised, so a second call is cheap. */
export function prepareSkewbTables(): void {
  buildPruningTableSkewb();
}

/** Registers `'skewb'` — called explicitly from `src/index.ts`. */
export function registerSkewbScrambler(): void {
  registerScrambler(
    'skewb',
    (random) => generateSkewbScramble(random),
    'random-state',
    prepareSkewbTables,
  );
}
