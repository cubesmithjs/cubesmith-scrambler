import type { RandomSource } from '../../random/random-source';
import { inverseMoves, movesToString } from '../../notation/move';
import { registerScrambler } from '../../core/scrambler-registry';
import {
  drawStateAtLeastMovesFromSolved,
  solveAtLeastLength,
} from '../../core/scramble-shape';
import { randomPermutation } from '../../utils/permutation';
import { randomState222 } from './random-state';
import { solve222InExactly, solveDistance222 } from './search';
import { buildPruningTable222 } from './pruning';
import { ALL_MOVES_222, buildTables222 } from './tables';
import type { Cube222State } from './state';

/** WCA Regulation 4b3b: a 2x2x2 scramble's state must require at least 4 moves to solve. */
export const MIN_222_SOLVE_DISTANCE = 4;

/** WCA's scrambler pads 2x2x2 sequences to 11 moves so a short solution can't be spotted on a scramble sheet — see `core/scramble-shape.ts`. */
export const MIN_222_SCRAMBLE_LENGTH = 11;

/**
 * Draws a uniformly random reachable 2x2x2 state that is far enough from
 * solved to be a legal scramble, then returns the inverse of a solution
 * long enough to be presentable. The scramble is the *inverse* of that
 * solution — same convention as `puzzles/333/solve.ts`.
 */
export function generate222Scramble(random: RandomSource): string {
  const state: Cube222State = drawStateAtLeastMovesFromSolved(
    random,
    randomState222,
    solveDistance222,
    MIN_222_SOLVE_DISTANCE,
  );
  const moveOrder = randomPermutation(random, ALL_MOVES_222.length);
  const solution = solveAtLeastLength(
    solveDistance222(state),
    MIN_222_SCRAMBLE_LENGTH,
    (length) => solve222InExactly(state, length, moveOrder),
  );
  return movesToString(inverseMoves(solution));
}

/**
 * Builds the move and pruning tables now, rather than inside the first
 * scramble. Both builders are memoised, so this is cheap on every call after
 * the first — and it is *not* a discarded draw, so it consumes no entropy and
 * cannot shift a seeded sequence. See `core/prepare-event.ts`.
 */
export function prepare222Tables(): void {
  buildTables222();
  buildPruningTable222();
}

/** Registers `'222'` with the core scrambler registry — called explicitly from `src/index.ts`, same reasoning as `puzzles/333/solve.ts`'s `register333Scrambler`. */
export function register222Scrambler(): void {
  registerScrambler('222', (random) => generate222Scramble(random), 'random-state', prepare222Tables);
}
