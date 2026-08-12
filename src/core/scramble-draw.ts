import type { RandomSource } from '../random/random-source';
import { InvalidScrambleCountError } from './errors';
import type { Registration } from './scrambler-registry';
import {
  MAX_SCRAMBLE_COUNT,
  type GenerateScrambleOptions,
  type ScrambleResult,
  type WcaEventId,
} from './types';

/**
 * The one place a `ScrambleResult` is built, shared by `generateScramble` and
 * `generateScrambles`.
 *
 * It exists because the multi-scramble shape — `scrambles[]` drawn from one
 * source, with `moves === scrambles[0]` so a caller written before multi-blind
 * existed keeps working — is a contract, and two copies of a contract is one
 * copy too many. `generateScrambles` needs exactly the same shape for each of
 * its `count` attempts.
 *
 * `random` is passed in rather than created here: whether one source feeds one
 * result or a whole batch is the caller's decision, and it is the *whole*
 * difference between the two public functions.
 */
export function drawScrambleResult(
  event: WcaEventId,
  registration: Registration,
  random: RandomSource,
  options: GenerateScrambleOptions,
  cubes: number,
): ScrambleResult {
  if (!registration.multiScramble) {
    return { event, moves: registration.scramble(random, options), quality: registration.quality };
  }

  // N independent draws from one source, and deliberately *not* de-duplicated:
  // each cube is its own uniform draw, so a repeat is a legitimate outcome and
  // removing it would bias the distribution. TNoodle's `generateScrambles` is
  // the same bare loop.
  const scrambles: string[] = [];
  for (let i = 0; i < cubes; i += 1) {
    scrambles.push(registration.scramble(random, options));
  }
  return { event, moves: scrambles[0]!, quality: registration.quality, scrambles };
}

/**
 * Validates a cubes-per-attempt count against `MAX_SCRAMBLE_COUNT`, for a
 * multi-scramble event. Shared so `generateScramble`'s `count` and
 * `generateScrambles`' `cubesPerAttempt` — the same number under two names,
 * because they sit on different axes — cannot drift apart in what they accept.
 */
export function resolveCubesPerAttempt(
  event: WcaEventId,
  count: number | undefined,
): number {
  if (count === undefined) return 1;
  if (!Number.isInteger(count)) {
    throw new InvalidScrambleCountError(event, count, 'count must be a whole number');
  }
  if (count < 1) {
    throw new InvalidScrambleCountError(event, count, 'count must be at least 1');
  }
  if (count > MAX_SCRAMBLE_COUNT) {
    throw new InvalidScrambleCountError(
      event,
      count,
      `count must be at most ${MAX_SCRAMBLE_COUNT} — every cube is a full random-state solve`,
    );
  }
  return count;
}
