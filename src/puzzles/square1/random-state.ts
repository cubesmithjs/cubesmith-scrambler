import type { RandomSource } from '../../random/random-source';
import { randomPermutation } from '../../utils/permutation';
import { randomInt } from '../../utils/random-int';
import { enumerateAllShapeKeys, isTwistableShapeKey, stateForShape } from './shapes';
import { SQUARE1_CORNER_COUNT, type Square1State } from './state';

/**
 * A uniformly random Square-1 position.
 *
 * The space is a clean product, which is what makes a uniform draw possible
 * without rejection: **3,678** twistable shapes × `8!` corner arrangements ×
 * `8!` edge arrangements × 2 for the middle = 11,958,666,854,400 — the
 * published twistable position count, reproduced independently in
 * `shapes.test.ts`. Nothing links the factors (there is no parity constraint on
 * this puzzle), so drawing each one uniformly and independently draws the
 * position uniformly.
 *
 * Only **twistable** shapes are drawn, which is Regulation 4b3d's second
 * clause — *"the state must allow a `/` move to be applied without a prior
 * (X, Y) move"* — satisfied by construction rather than by filtering.
 */

let twistable: readonly number[] | undefined;

/** The 3,678 shapes a scramble may finish on. */
export function twistableShapeKeys(): readonly number[] {
  twistable ??= enumerateAllShapeKeys().filter(isTwistableShapeKey);
  return twistable;
}

export function randomSquare1State(random: RandomSource): Square1State {
  const shapes = twistableShapeKeys();
  return stateForShape(
    shapes[randomInt(random, shapes.length)]!,
    randomPermutation(random, SQUARE1_CORNER_COUNT),
    randomPermutation(random, SQUARE1_CORNER_COUNT),
    randomInt(random, 2) === 1,
  );
}
