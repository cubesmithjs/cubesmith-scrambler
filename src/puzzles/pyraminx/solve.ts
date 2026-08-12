import { registerScrambler } from '../../core/scrambler-registry';
import {
  drawStateAtLeastMovesFromSolved,
  solveAtLeastLength,
} from '../../core/scramble-shape';
import type { RandomSource } from '../../random/random-source';
import { randomPermutation } from '../../utils/permutation';
import {
  inversePyraminxMoves,
  PYRAMINX_VERTICES,
  pyraminxMovesToString,
  type PyraminxAmount,
  type PyraminxMove,
} from './notation';
import { randomPyraminxState } from './random-state';
import {
  pyraminxLayerSolveDistance,
  solvePyraminxLayers,
  solvePyraminxLayersInExactly,
} from './search';
import {
  applyPyraminxMoves,
  SOLVED_PYRAMINX_STATE,
  VERTEX_COUNT_PYRAMINX,
  type PyraminxState,
} from './state';
import { buildPruningTablePyraminx } from './pruning';
import { ALL_LAYER_MOVES_PYRAMINX, buildTablesPyraminx } from './tables';

/**
 * The tip moves that carry each tip from `from` to `to`, in
 * `PYRAMINX_VERTICES` order, skipping any tip that already matches. A tip
 * turn commutes with every other move on the puzzle, so where they sit in
 * the sequence is free — WCA scrambles put them last, which is what this
 * produces.
 */
function tipMoves(from: readonly number[], to: readonly number[]): PyraminxMove[] {
  const moves: PyraminxMove[] = [];
  for (let i = 0; i < VERTEX_COUNT_PYRAMINX; i += 1) {
    const amount = (to[i]! - from[i]! + 3) % 3;
    if (amount === 0) continue;
    moves.push({ vertex: PYRAMINX_VERTICES[i]!, amount: amount as PyraminxAmount, tip: true });
  }
  return moves;
}

/**
 * A complete solution: an optimal layer-turn solve followed by up to four
 * tip turns. Tips are solved last rather than searched over, because they
 * genuinely are independent — no arrangement of them can make the layer
 * solve any shorter, so folding them into the search would multiply its
 * state space by 81 while changing nothing.
 */
export function solvePyraminx(
  state: PyraminxState,
  moveOrder?: readonly number[],
): PyraminxMove[] {
  const layerMoves = solvePyraminxLayers(state, moveOrder);
  const afterLayers = applyPyraminxMoves(state, layerMoves);
  return [...layerMoves, ...tipMoves(afterLayers.tipOrientation, SOLVED_PYRAMINX_STATE.tipOrientation)];
}

/** WCA Regulation 4b3f: a Pyraminx scramble's state must require at least 6 moves to solve. */
export const MIN_PYRAMINX_SOLVE_DISTANCE = 6;

/**
 * WCA's scrambler pads Pyraminx sequences to 11 layer turns so a short
 * solution can't be spotted on a printed scramble sheet — see
 * `core/scramble-shape.ts`. Tip turns are appended after and don't count
 * toward it; they carry no difficulty.
 *
 * The regulation's ≥ 6 is about the *state*, this is about the *sequence*,
 * and 11 is also this puzzle's God's number — so a padded scramble is
 * frequently a deliberately non-optimal route to a state only 8 or 9 turns
 * from solved.
 */
export const MIN_PYRAMINX_SCRAMBLE_LENGTH = 11;

/**
 * Draws a uniformly random reachable Pyraminx state that is far enough from
 * solved to be a legal scramble, solves its layers, and returns the inverse
 * of that solution — then appends the tip turns that bring the tips to the
 * drawn state's tip values.
 *
 * Tips are reconciled at the end rather than by inverting the solution's own
 * tip moves, so they land where WCA scrambles put them without relying on a
 * commutation argument to reorder anything after the fact.
 */
export function generatePyraminxScramble(random: RandomSource): string {
  const state = drawStateAtLeastMovesFromSolved(
    random,
    randomPyraminxState,
    pyraminxLayerSolveDistance,
    MIN_PYRAMINX_SOLVE_DISTANCE,
  );
  const moveOrder = randomPermutation(random, ALL_LAYER_MOVES_PYRAMINX.length);

  const layerSolution = solveAtLeastLength(
    pyraminxLayerSolveDistance(state),
    MIN_PYRAMINX_SCRAMBLE_LENGTH,
    (length) => solvePyraminxLayersInExactly(state, length, moveOrder),
  );
  const layerScramble = inversePyraminxMoves(layerSolution);
  const afterScramble = applyPyraminxMoves(SOLVED_PYRAMINX_STATE, layerScramble);

  return pyraminxMovesToString([
    ...layerScramble,
    ...tipMoves(afterScramble.tipOrientation, state.tipOrientation),
  ]);
}

/** Builds the layer-move and pruning tables now; both are memoised, so a second call is cheap. */
export function preparePyraminxTables(): void {
  buildTablesPyraminx();
  buildPruningTablePyraminx();
}

/** Registers `'pyram'` — called explicitly from `src/index.ts`, same reasoning as every other puzzle here. */
export function registerPyraminxScrambler(): void {
  registerScrambler(
    'pyram',
    (random) => generatePyraminxScramble(random),
    'random-state',
    preparePyraminxTables,
  );
}
