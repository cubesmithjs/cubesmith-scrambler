import type { RandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { permutationParity, randomPermutation, swapToFlipParity } from '../../utils/permutation';
import { CORNER_COUNT, EDGE_COUNT, type CubeState } from './state';

/**
 * A uniformly random corner-orientation vector whose 8 entries sum to
 * `≡ 0 (mod 3)` — the constraint every reachable cube state satisfies (a
 * single corner can't be twisted in isolation; twisting one always
 * counter-twists another). The first 7 entries are drawn independently and
 * uniformly from `{0,1,2}` (3^7 = 2187 possibilities, matching the standard
 * "corner orientation coordinate" space size for this algorithm family);
 * the 8th is whatever value makes the sum divisible by 3, which keeps the
 * whole vector uniform over the valid subspace rather than just valid.
 */
function randomCornerOrientation(random: RandomSource): number[] {
  const orientation = new Array<number>(CORNER_COUNT);
  let sum = 0;
  for (let i = 0; i < CORNER_COUNT - 1; i += 1) {
    const value = randomInt(random, 3);
    orientation[i] = value;
    sum += value;
  }
  orientation[CORNER_COUNT - 1] = (3 - (sum % 3)) % 3;
  return orientation;
}

/**
 * Same idea for edges: 11 independent draws from `{0,1}` (2^11 = 2048
 * possibilities, matching the standard "edge orientation coordinate" size),
 * the 12th forced so the sum is even.
 */
function randomEdgeOrientation(random: RandomSource): number[] {
  const orientation = new Array<number>(EDGE_COUNT);
  let sum = 0;
  for (let i = 0; i < EDGE_COUNT - 1; i += 1) {
    const value = randomInt(random, 2);
    orientation[i] = value;
    sum += value;
  }
  orientation[EDGE_COUNT - 1] = sum % 2;
  return orientation;
}

/**
 * A uniformly random *physically reachable* cube state: corner and edge
 * permutations are each drawn uniformly (Fisher–Yates), then — since
 * exactly half of all (cornerPerm, edgePerm) pairs have mismatched parity,
 * and a real cube can never be in one of those — the edge permutation's
 * parity is flipped via a single swap whenever it doesn't match the
 * corner permutation's. That swap is a bijection between "wrong-parity"
 * and "right-parity" permutations, so it corrects the constraint without
 * biasing the distribution over the states that satisfy it (see
 * `random-state.test.ts` for the parity-matching and rough-uniformity
 * checks this relies on).
 */
export function randomState(random: RandomSource): CubeState {
  const cornerPermutation = randomPermutation(random, CORNER_COUNT);
  const edgePermutation = randomPermutation(random, EDGE_COUNT);
  if (permutationParity(cornerPermutation) !== permutationParity(edgePermutation)) {
    swapToFlipParity(edgePermutation);
  }
  return {
    cornerPermutation,
    cornerOrientation: randomCornerOrientation(random),
    edgePermutation,
    edgeOrientation: randomEdgeOrientation(random),
  };
}
