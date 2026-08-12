import { createRandomSource } from '../random/random-source';
import { InvalidScrambleCountError, UnimplementedEventError } from './errors';
import { drawScrambleResult, resolveCubesPerAttempt } from './scramble-draw';
import { getScrambler } from './scrambler-registry';
import {
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

  if (!registration.multiScramble && options.count !== undefined) {
    // `count` is rejected rather than ignored: a caller who asks for ten and
    // silently receives one has been misled, and the mistake is invisible.
    throw new InvalidScrambleCountError(
      event,
      options.count,
      'the event is a single scramble, so count does not apply',
    );
  }

  return drawScrambleResult(
    event,
    registration,
    random,
    options,
    registration.multiScramble ? resolveCubesPerAttempt(event, options.count) : 1,
  );
}
