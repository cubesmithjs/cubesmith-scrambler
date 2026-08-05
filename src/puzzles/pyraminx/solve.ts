import { registerScrambler } from '../../core/scrambler-registry';
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
import { solvePyraminxLayers } from './search';
import {
  applyPyraminxMoves,
  SOLVED_PYRAMINX_STATE,
  VERTEX_COUNT_PYRAMINX,
  type PyraminxState,
} from './state';
import { ALL_LAYER_MOVES_PYRAMINX } from './tables';

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

/**
 * Draws a uniformly random reachable Pyraminx state, solves its layers
 * optimally, and returns the inverse of that solution — then appends the
 * tip turns that bring the tips to the drawn state's tip values.
 *
 * Tips are reconciled at the end rather than by inverting the solution's own
 * tip moves, so they land where WCA scrambles put them without relying on a
 * commutation argument to reorder anything after the fact.
 */
export function generatePyraminxScramble(random: RandomSource): string {
  const state = randomPyraminxState(random);
  const moveOrder = randomPermutation(random, ALL_LAYER_MOVES_PYRAMINX.length);

  const layerScramble = inversePyraminxMoves(solvePyraminxLayers(state, moveOrder));
  const afterScramble = applyPyraminxMoves(SOLVED_PYRAMINX_STATE, layerScramble);

  return pyraminxMovesToString([
    ...layerScramble,
    ...tipMoves(afterScramble.tipOrientation, state.tipOrientation),
  ]);
}

/** Registers `'pyram'` — called explicitly from `src/index.ts`, same reasoning as every other puzzle here. */
export function registerPyraminxScrambler(): void {
  registerScrambler('pyram', (random) => generatePyraminxScramble(random));
}
