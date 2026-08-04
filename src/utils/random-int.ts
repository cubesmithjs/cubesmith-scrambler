import type { RandomSource } from '../random/random-source';

const UINT32_RANGE = 0x1_0000_0000;

/**
 * A uniformly random integer in `[0, maxExclusive)`, unbiased even when
 * `maxExclusive` doesn't evenly divide 2^32 — plain `nextUint32() % max`
 * would otherwise slightly favor the smaller remainders. Standard rejection
 * sampling: redraw whenever the raw value falls in the partial final bucket.
 */
export function randomInt(random: RandomSource, maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error(`randomInt: maxExclusive must be a positive integer, got ${maxExclusive}`);
  }
  const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
  let value: number;
  do {
    value = random.nextUint32();
  } while (value >= limit);
  return value % maxExclusive;
}
