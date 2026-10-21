import { validateScramble, type ScrambleValidation } from '../core/validate-scramble';
import { MAX_BATCH_COUNT } from '../core/types';
import { createRandomSource } from '../random/random-source';
import { InvalidUnofficialScrambleCountError, UnimplementedUnofficialEventError } from './errors';
import { NOTATION_OF } from './catalogue';
import { getUnofficialScrambler, type UnofficialRegistration } from './registry';
import type {
  UnofficialEventId,
  UnofficialScrambleOptions,
  UnofficialScrambleResult,
  UnofficialScramblesOptions,
} from './types';

function registrationFor(event: UnofficialEventId): UnofficialRegistration {
  const registration = getUnofficialScrambler(event);
  if (!registration) throw new UnimplementedUnofficialEventError(event);
  return registration;
}

/**
 * Generates a scramble for an unofficial event. Deterministic given
 * `options.seed`; drawn from a cryptographically-random source otherwise.
 * `async` for the same reason `generateScramble` is: so a puzzle may later load
 * table data lazily without changing the signature.
 *
 * @throws {UnimplementedUnofficialEventError} if `event` has no scrambler.
 */
export async function generateUnofficialScramble(
  event: UnofficialEventId,
  options: UnofficialScrambleOptions = {},
): Promise<UnofficialScrambleResult> {
  const registration = registrationFor(event);
  const random = createRandomSource(options.seed);
  return { event, moves: registration.scramble(random), quality: registration.quality };
}

/**
 * Generates `count` scrambles from **one** random source, so a batch is
 * reproducible from a single seed. The same contract as `generateScrambles`:
 * `count` is an integer in `1..MAX_BATCH_COUNT`, and `onProgress` is awaited
 * after each scramble.
 *
 * @throws {UnimplementedUnofficialEventError} if `event` has no scrambler.
 * @throws {InvalidUnofficialScrambleCountError} for a count outside the bound.
 */
export async function generateUnofficialScrambles(
  event: UnofficialEventId,
  count: number,
  options: UnofficialScramblesOptions = {},
): Promise<readonly UnofficialScrambleResult[]> {
  const registration = registrationFor(event);
  if (!Number.isInteger(count)) {
    throw new InvalidUnofficialScrambleCountError(event, count, 'count must be a whole number');
  }
  if (count < 1) {
    throw new InvalidUnofficialScrambleCountError(event, count, 'count must be at least 1');
  }
  if (count > MAX_BATCH_COUNT) {
    throw new InvalidUnofficialScrambleCountError(
      event,
      count,
      `count must be at most ${MAX_BATCH_COUNT} — this is a runaway guard, not a regulation`,
    );
  }

  const random = createRandomSource(options.seed);
  const results: UnofficialScrambleResult[] = [];
  for (let i = 0; i < count; i += 1) {
    results.push({ event, moves: registration.scramble(random), quality: registration.quality });
    await options.onProgress?.(i + 1, count);
  }
  return results;
}

/**
 * Builds the event's lookup tables now, so the one-off cost is not charged to
 * the first scramble. Resolves at once for an event with nothing to build.
 *
 * @throws {UnimplementedUnofficialEventError} if `event` has no scrambler.
 */
export async function prepareUnofficialEvent(event: UnofficialEventId): Promise<void> {
  registrationFor(event).prepare?.();
}

/**
 * Checks a scramble's **notation**, the same check `validateScramble` makes for
 * the WCA event whose notation the unofficial event is written in
 * (`NOTATION_OF`): cube notation for the big cubes, the blindfolded cubes and
 * the shape mods, and Pyraminx or Megaminx notation for `pyrambf` and `minxbf`.
 * The result is `validateScramble`'s own, unchanged.
 */
export function validateUnofficialScramble(
  event: UnofficialEventId,
  text: string,
): ScrambleValidation {
  return validateScramble(NOTATION_OF[event], text);
}
