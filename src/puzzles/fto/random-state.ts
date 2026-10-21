import type { RandomSource } from '../../random/random-source';
import { permutationParity, randomPermutation, swapToFlipParity } from '../../utils/permutation';
import { randomInt } from '../../utils/random-int';
import { CENTRE_ORBIT_SIZE, CORNER_COUNT_FTO, EDGE_COUNT_FTO } from './geometry';
import type { FtoState } from './state';

/**
 * A uniformly random reachable FTO state.
 *
 * The reachable group is a plain product, which `state.test.ts` establishes
 * exactly (Schreier–Sims over the derived move tables, 158,260,810,061,489,
 * 362,698,240,000,000 elements):
 *
 * - corners: an **even** permutation of 6, with twists in `Z2` whose **sum is
 *   even** — `6!/2 · 2^5`;
 * - edges: an **even** permutation of 12 — `12!/2`;
 * - each centre orbit: an **even** permutation of 12 — `12!/2`, twice;
 *
 * and no constraint *links* any two of them. So each part is drawn on its own:
 * a uniform permutation corrected to even by one fixed swap (a bijection
 * between the odd and even halves, so the result stays uniform), and five free
 * twists with the sixth fixed by the sum.
 *
 * The centres are drawn as *labelled* pieces even though a colour's three look
 * alike. That is still uniform over what the eye sees: every colour arrangement
 * is reached by the same number of labelled permutations (`3!^4 / 2 = 648` even
 * ones per orbit), so drawing uniformly over labels draws uniformly over
 * arrangements.
 */
export function randomFtoState(random: RandomSource): FtoState {
  return {
    cornerPermutation: randomEvenPermutation(random, CORNER_COUNT_FTO),
    cornerOrientation: randomEvenTwists(random, CORNER_COUNT_FTO),
    edgePermutation: randomEvenPermutation(random, EDGE_COUNT_FTO),
    centreA: randomEvenPermutation(random, CENTRE_ORBIT_SIZE),
    centreB: randomEvenPermutation(random, CENTRE_ORBIT_SIZE),
  };
}

function randomEvenPermutation(random: RandomSource, n: number): number[] {
  const perm = randomPermutation(random, n);
  if (permutationParity(perm) === 1) swapToFlipParity(perm);
  return perm;
}

function randomEvenTwists(random: RandomSource, n: number): number[] {
  const twists = Array.from({ length: n - 1 }, () => randomInt(random, 2));
  twists.push(twists.reduce((sum, t) => sum ^ t, 0));
  return twists;
}
