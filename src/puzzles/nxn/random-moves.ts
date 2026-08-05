import type { RandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { allMovesForSize, moveAxis, moveLayerSet, type WideMove } from './notation';

/**
 * Random-moves scramble generation for the big cubes.
 *
 * WCA Regulation 4b3e:
 *
 * > 5x5x5 Cube, 6x6x6 Cube, 7x7x7 Cube, and Megaminx: sufficiently many
 * > random moves (instead of random state), at least 2 moves to solve.
 *
 * So this is the official method for these events, not a simplification of
 * one — there is no solver here because WCA's own scrambler doesn't do a
 * random-state optimal solve for them either.
 *
 * ## The one rule: no move may be redundant
 *
 * "Random moves" cannot mean *uniformly* random moves, or the sequence would
 * contain visible cancellations — `R R'` collapses to nothing, `R R` to `R2`.
 * Moves on the same axis commute, which makes the correct rule slightly
 * stronger than "don't repeat the previous move":
 *
 * > Within any run of consecutive moves on the same axis, no two moves may
 * > turn the same set of layers.
 *
 * Because same-axis moves can be freely reordered, two moves of the same
 * layer set anywhere inside such a run could be brought together and merged —
 * so `R Rw R'` is just as redundant as `R R'`, and both are excluded. This is
 * the same rule stated elsewhere as "not twice in the same rotating set, and
 * not three times in the same rotating group".
 *
 * Note what is *not* excluded: `R L R'` is fine on a cube, because R and L
 * turn disjoint layer sets and no reordering merges them.
 */

/** Whether `candidate` would be redundant after `history` (most recent last). */
export function isRedundantMove(
  history: readonly WideMove[],
  candidate: WideMove,
): boolean {
  const axis = moveAxis(candidate);
  const layerSet = moveLayerSet(candidate);
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const previous = history[i]!;
    // The run of same-axis moves ends here; nothing earlier can be reordered
    // next to the candidate.
    if (moveAxis(previous) !== axis) return false;
    if (moveLayerSet(previous) === layerSet) return true;
  }
  return false;
}

/**
 * `count` random moves for a cube of `size`, with no redundant move anywhere.
 *
 * Rejection sampling rather than filtering the candidate list first: it keeps
 * the draw uniform over the *legal* moves at each step, which is what makes
 * the sequence's distribution the intended one. The rejection rate is low —
 * at most a handful of the moves available on any axis are excluded.
 */
export function randomMoveSequence(
  random: RandomSource,
  size: number,
  count: number,
): WideMove[] {
  const available = allMovesForSize(size);
  const moves: WideMove[] = [];

  while (moves.length < count) {
    const candidate = available[randomInt(random, available.length)]!;
    if (isRedundantMove(moves, candidate)) continue;
    moves.push(candidate);
  }

  return moves;
}
