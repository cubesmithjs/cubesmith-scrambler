import type { RandomSource } from '../../random/random-source';
import { randomPermutation } from '../../utils/permutation';
import { randomInt } from '../../utils/random-int';
import { CENTRE_COUNT_444, CORNER_COUNT_444, pieces444, WING_COUNT_444 } from './pieces';
import type { Cube444State } from './state';

/**
 * The 4x4x4's coordinates, and the count they have to multiply to.
 *
 * ## The count
 *
 * ```
 *    8!         corner permutation
 *  x 3^7        corner orientation — the eighth is forced, the sum being 0 mod 3
 *  x 24!        wing permutation — every permutation is reachable
 *  x 24!/4!^6   centre arrangement, four indistinguishable per colour
 *  / 24         the whole-cube rotations, which are not part of a position
 *  = 7,401,196,841,564,901,869,874,093,974,498,574,336,000,000,000
 * ```
 *
 * That is the published figure, and reproducing it is **checkpoint B** of
 * `docs/444-design.md` — the gate the project stops at if it fails, the way
 * Square-1 stopped at 3,678.
 *
 * ## Two claims inside it, both checked rather than assumed
 *
 * **No parity constraint links wings to corners.** An inner slice quarter turn
 * is a 4-cycle on wings — odd — and a 4-cycle on centres, and the centre cycle
 * is *invisible* because the four centres of a face are identical. So an odd
 * wing permutation with even corners is a real position, which is exactly the
 * "parity" case 4x4x4 solvers meet, and the product above needs no correction.
 * `coordinates.test.ts` produces the witness with two moves.
 *
 * **The corner orientation sum is invariant mod 3**, so the eighth orientation
 * is determined and `3^7` is right rather than `3^8`.
 *
 * ## The frame
 *
 * An even cube has no fixed centre, so 24 facelet configurations describe one
 * physical position — hence the `/ 24`. Drawing in a **fixed frame** therefore
 * produces each physical position exactly 24 times, which leaves the marginal
 * over positions uniform. For `444bf` that is not a compromise but the feature:
 * the frame draw *is* Regulation 4b3a's random orientation.
 */

export const CORNER_PERMUTATIONS_444 = 40_320n; // 8!
export const CORNER_ORIENTATIONS_444 = 2_187n; // 3^7
export const WING_PERMUTATIONS_444 = factorial(24n); // 24!
export const CENTRE_ARRANGEMENTS_444 = factorial(24n) / factorial(4n) ** 6n;
export const CUBE_ROTATIONS = 24n;

/** The published 4x4x4 position count, reproduced from the coordinate sizes. */
export const STATE_COUNT_444 =
  (CORNER_PERMUTATIONS_444 *
    CORNER_ORIENTATIONS_444 *
    WING_PERMUTATIONS_444 *
    CENTRE_ARRANGEMENTS_444) /
  CUBE_ROTATIONS;

function factorial(n: bigint): bigint {
  let product = 1n;
  for (let i = 2n; i <= n; i += 1n) product *= i;
  return product;
}

/**
 * A uniformly random position, in a fixed frame.
 *
 * Every factor is drawn independently, with no rejection, because nothing links
 * them — see above. The one dependent value is the eighth corner orientation,
 * which is forced.
 */
export function randomCube444State(random: RandomSource): Cube444State {
  const cornerPermutation = randomPermutation(random, CORNER_COUNT_444);

  const cornerOrientation = new Array<number>(CORNER_COUNT_444).fill(0);
  let twistSum = 0;
  for (let corner = 0; corner < CORNER_COUNT_444 - 1; corner += 1) {
    const twist = randomInt(random, 3);
    cornerOrientation[corner] = twist;
    twistSum += twist;
  }
  cornerOrientation[CORNER_COUNT_444 - 1] = (3 - (twistSum % 3)) % 3;

  const wingPermutation = randomPermutation(random, WING_COUNT_444);

  // Centres: a uniformly random arrangement of the multiset {four of each of six
  // colours}. Shuffling the multiset directly is what keeps it uniform over
  // *arrangements* rather than over the 4!^6 relabellings that are not states.
  const centreColour = pieces444().centreFace.map((face) => face);
  for (let i = centreColour.length - 1; i > 0; i -= 1) {
    const j = randomInt(random, i + 1);
    [centreColour[i], centreColour[j]] = [centreColour[j]!, centreColour[i]!];
  }

  return { cornerPermutation, cornerOrientation, wingPermutation, centreColour };
}

/** How many of each colour a centre arrangement must show — four, always. */
export function centreColourCounts(state: Cube444State): readonly number[] {
  const counts = new Array<number>(6).fill(0);
  for (const colour of state.centreColour) counts[colour]! += 1;
  return counts;
}

export function isWellFormedCube444State(state: Cube444State): boolean {
  const permutationIsComplete = (values: readonly number[], size: number): boolean =>
    values.length === size && new Set(values).size === size && values.every((v) => v >= 0 && v < size);

  if (!permutationIsComplete(state.cornerPermutation, CORNER_COUNT_444)) return false;
  if (!permutationIsComplete(state.wingPermutation, WING_COUNT_444)) return false;
  if (state.cornerOrientation.length !== CORNER_COUNT_444) return false;
  if (state.cornerOrientation.some((twist) => twist < 0 || twist > 2)) return false;
  if (state.cornerOrientation.reduce((sum, twist) => sum + twist, 0) % 3 !== 0) return false;
  if (state.centreColour.length !== CENTRE_COUNT_444) return false;
  return centreColourCounts(state).every((count) => count === 4);
}
