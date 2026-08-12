import { createRandomSource } from '../random/random-source';
import { InvalidScrambleCountError, UnimplementedEventError } from './errors';
import { drawScrambleResult, resolveCubesPerAttempt } from './scramble-draw';
import { getScrambler } from './scrambler-registry';
import {
  MAX_BATCH_COUNT,
  type GenerateScramblesOptions,
  type ScrambleResult,
  type WcaEventId,
} from './types';

/**
 * Generates `count` scrambles for one event, drawn from **one** random source.
 *
 * That single source is the whole point, and it fixes a real trap rather than
 * saving a loop: `generateScramble(event, { seed })` creates its source from the
 * seed on every call, so a caller-side loop over it returns the *same* scramble
 * `count` times whenever a seed is passed. Here the source is created once and
 * consumed by `count` consecutive draws, exactly as `333mbf` already does
 * internally and as TNoodle's `generateScrambles(r, count)` does — so a seed
 * makes the batch reproducible **and** its members distinct.
 *
 * Duplicates are not removed. Each draw is its own uniform draw; a repeat is a
 * legitimate outcome and filtering it would bias the distribution.
 *
 * `result[i]` is the *i*-th draw, and that order is part of the contract — a
 * consumer mapping a batch onto (group, attempt) slots relies on it.
 *
 * ## Staying responsive
 *
 * A whole competition's scramble set is minutes of computation and this package
 * creates no Worker. `options.onProgress` is the seam: it is **awaited**, so
 * returning `scheduler.yield()` (or `new Promise(r => setTimeout(r, 0))`) gives
 * the browser a real macrotask boundary between scrambles.
 *
 * 🔴 An `await` on `generateScramble`'s promise is *not* such a seam. That
 * continuation is a microtask, and a microtask cannot interleave with
 * rendering — which is why a naive per-item `await` loop leaves a progress bar
 * frozen at zero until the entire batch is done, even though it looks like it
 * yields.
 *
 * @throws {UnimplementedEventError} if `event` has no registered scrambler yet —
 *   before any work is done.
 * @throws {InvalidScrambleCountError} if `count` is not an integer in
 *   `1..MAX_BATCH_COUNT`, or if `options.cubesPerAttempt` is given for an event
 *   that is not multi-scramble (or is out of `1..MAX_SCRAMBLE_COUNT`).
 */
export async function generateScrambles(
  event: WcaEventId,
  count: number,
  options: GenerateScramblesOptions = {},
): Promise<readonly ScrambleResult[]> {
  // Resolved first, so an unimplemented event fails before a caller has waited
  // for 499 scrambles of a 500-scramble batch.
  const registration = getScrambler(event);
  if (!registration) {
    throw new UnimplementedEventError(event);
  }

  const batchCount = resolveBatchCount(event, count);
  if (!registration.multiScramble && options.cubesPerAttempt !== undefined) {
    throw new InvalidScrambleCountError(
      event,
      options.cubesPerAttempt,
      'the event is a single scramble, so cubesPerAttempt does not apply',
    );
  }
  const cubes = registration.multiScramble
    ? resolveCubesPerAttempt(event, options.cubesPerAttempt)
    : 1;

  const random = createRandomSource(options.seed);
  const results: ScrambleResult[] = [];
  for (let i = 0; i < batchCount; i += 1) {
    results.push(drawScrambleResult(event, registration, random, {}, cubes));
    // Awaited, and after the draw rather than before it: `(1, n) … (n, n)`, so
    // `done` is always a count of scrambles that exist. A throw here propagates
    // and leaves the loop — the caller's cancel path.
    await options.onProgress?.(i + 1, batchCount);
  }
  return results;
}

function resolveBatchCount(event: WcaEventId, count: number): number {
  if (!Number.isInteger(count)) {
    throw new InvalidScrambleCountError(event, count, 'count must be a whole number');
  }
  if (count < 1) {
    throw new InvalidScrambleCountError(event, count, 'count must be at least 1');
  }
  if (count > MAX_BATCH_COUNT) {
    throw new InvalidScrambleCountError(
      event,
      count,
      `count must be at most ${MAX_BATCH_COUNT} — this is a runaway guard, not a regulation`,
    );
  }
  return count;
}
