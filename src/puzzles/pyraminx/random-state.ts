import type { RandomSource } from '../../random/random-source';
import { permutationParity, randomPermutation, swapToFlipParity } from '../../utils/permutation';
import { randomInt } from '../../utils/random-int';
import { EDGE_COUNT_PYRAMINX, VERTEX_COUNT_PYRAMINX, type PyraminxState } from './state';

/**
 * A uniformly random *reachable* Pyraminx state.
 *
 * Two constraints have to be respected, and both are confirmed by the
 * pruning table's BFS coverage rather than assumed by analogy:
 *
 * - **Edge permutation is even.** Every layer turn 3-cycles three edges, and
 *   a 3-cycle is an even permutation, so no odd permutation is reachable.
 *   A uniformly drawn permutation is corrected with a single swap when it
 *   comes out odd — a bijection from the odd half onto the even half, so
 *   the result stays uniform over the even permutations rather than merely
 *   landing in them (same technique and same reasoning as
 *   `puzzles/333/random-state.ts`'s parity fix-up).
 * - **Total edge flip is even.** Each turn flips exactly two of the three
 *   edges it moves, so the sum is invariant mod 2. Five flips are drawn
 *   freely and the sixth is forced, which is uniform over the legal 32.
 *
 * The four axial twists and the four tip twists are each free and
 * independent — an axial's twist counts net turns of its own vertex and
 * nothing constrains it, and nothing on the puzzle can even observe a tip.
 */
export function randomPyraminxState(random: RandomSource): PyraminxState {
  const edgePermutation = randomPermutation(random, EDGE_COUNT_PYRAMINX);
  if (permutationParity(edgePermutation) === 1) {
    swapToFlipParity(edgePermutation);
  }

  const edgeOrientation = new Array<number>(EDGE_COUNT_PYRAMINX);
  let flipSum = 0;
  for (let i = 0; i < EDGE_COUNT_PYRAMINX - 1; i += 1) {
    const value = randomInt(random, 2);
    edgeOrientation[i] = value;
    flipSum += value;
  }
  edgeOrientation[EDGE_COUNT_PYRAMINX - 1] = flipSum % 2;

  const axialOrientation = Array.from({ length: VERTEX_COUNT_PYRAMINX }, () => randomInt(random, 3));
  const tipOrientation = Array.from({ length: VERTEX_COUNT_PYRAMINX }, () => randomInt(random, 3));

  return { edgePermutation, edgeOrientation, axialOrientation, tipOrientation };
}
