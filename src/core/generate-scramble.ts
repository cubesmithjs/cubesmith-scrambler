import { createRandomSource } from '../random/random-source';
import { InvalidScrambleCountError, UnimplementedEventError } from './errors';
import { getScrambler } from './scrambler-registry';
import {
  MAX_SCRAMBLE_COUNT,
  type GenerateScrambleOptions,
  type ScrambleResult,
  type WcaEventId,
} from './types';

/**
 * Generates a WCA scramble for `event`. Deterministic given `options.seed`;
 * drawn from a cryptographically-random source otherwise. Pure computation
 * only — no Worker, no DOM — so this resolves synchronously-fast in any
 * JavaScript environment; it's `async` only so a future puzzle can lazily
 * load its own pruning-table data without changing the public signature.
 *
 * For a **multi-scramble event** (`333mbf`, where one attempt covers many
 * cubes) the result also carries `scrambles`, and `options.count` says how
 * many to draw. `moves` is always `scrambles[0]`, so a caller written before
 * multi-blind existed keeps working unchanged.
 *
 * @throws {UnimplementedEventError} if `event` has no registered scrambler yet.
 * @throws {InvalidScrambleCountError} if `options.count` is given for an event
 *   that is not multi-scramble, or is not an integer in `1..MAX_SCRAMBLE_COUNT`.
 */
export async function generateScramble(
  event: WcaEventId,
  options: GenerateScrambleOptions = {},
): Promise<ScrambleResult> {
  const registration = getScrambler(event);
  if (!registration) {
    throw new UnimplementedEventError(event);
  }
  const random = createRandomSource(options.seed);

  if (!registration.multiScramble) {
    // `count` is rejected rather than ignored: a caller who asks for ten and
    // silently receives one has been misled, and the mistake is invisible.
    if (options.count !== undefined) {
      throw new InvalidScrambleCountError(
        event,
        options.count,
        'the event is a single scramble, so count does not apply',
      );
    }
    const moves = registration.scramble(random, options);
    return { event, moves, quality: registration.quality };
  }

  const count = resolveCount(event, options.count);
  // N independent draws from one source, and deliberately *not* de-duplicated:
  // each cube is its own uniform draw, so a repeat is a legitimate outcome and
  // removing it would bias the distribution. TNoodle's `generateScrambles` is
  // the same bare loop.
  const scrambles: string[] = [];
  for (let i = 0; i < count; i += 1) {
    scrambles.push(registration.scramble(random, options));
  }
  return { event, moves: scrambles[0]!, quality: registration.quality, scrambles };
}

function resolveCount(event: WcaEventId, count: number | undefined): number {
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
