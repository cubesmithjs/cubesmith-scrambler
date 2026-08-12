import type { RandomSource } from '../random/random-source';
import type { GenerateScrambleOptions, ScrambleQuality, WcaEventId } from './types';

export type EventScrambler = (
  random: RandomSource,
  options: GenerateScrambleOptions,
) => string;

export interface Registration {
  readonly scramble: EventScrambler;
  readonly quality: ScrambleQuality;
  /**
   * Whether the event covers many cubes in one attempt, and therefore accepts
   * `options.count`. True only for `333mbf`.
   *
   * Note what this does *not* need: a separate "generate N" function. The N
   * scrambles are N independent calls to the same `scramble`, sharing one
   * `RandomSource`, which is exactly what TNoodle's `generateScrambles(r,
   * count)` does — a bare loop over `generateWcaScramble`. Independence comes
   * from the source being stateful, not from anything the event has to know.
   */
  readonly multiScramble: boolean;
  /**
   * Builds this event's lookup/pruning tables now, so the one-off cost is not
   * charged to the first user-visible scramble. Supplied only by the puzzles
   * that *have* tables; `prepareEvent` treats its absence as "nothing left to
   * precompute", not as an error.
   *
   * 🔴 It must not generate and discard a scramble. A discarded draw consumes
   * entropy, so under a seed it would shift every subsequent scramble — turning
   * a performance helper into a correctness hazard. Every implementation here
   * calls the solvers' own memoised builders directly.
   */
  readonly prepare?: (() => void) | undefined;
}

const registry = new Map<WcaEventId, Registration>();

/**
 * Registers the scrambler for an event. Called once per implemented puzzle
 * from `src/index.ts`.
 *
 * `quality` is declared here rather than assumed by `generateScramble`,
 * because it genuinely varies by event: WCA Regulation 4b3e specifies
 * *random-moves* for 5x5x5, 6x6x6, 7x7x7 and Megaminx, and random-state for
 * everything else. Reporting one when the other was used would be a
 * misleading claim about the scramble.
 */
export function registerScrambler(
  event: WcaEventId,
  scramble: EventScrambler,
  quality: ScrambleQuality = 'random-state',
  prepare?: () => void,
): void {
  registry.set(event, { scramble, quality, multiScramble: false, prepare });
}

/**
 * Registers an event whose attempt covers **many** cubes, so `generateScramble`
 * will accept `options.count` for it and return a `scrambles` array.
 *
 * Separate from `registerScrambler` rather than a fourth parameter on it,
 * because there is exactly one such event (`333mbf`) and a boolean at fifteen
 * other call sites would carry no information.
 */
export function registerMultiScrambler(
  event: WcaEventId,
  scramble: EventScrambler,
  quality: ScrambleQuality = 'random-state',
  prepare?: () => void,
): void {
  registry.set(event, { scramble, quality, multiScramble: true, prepare });
}

export function getScrambler(event: WcaEventId): Registration | undefined {
  return registry.get(event);
}

export function isImplementedEvent(event: WcaEventId): boolean {
  return registry.has(event);
}

/** Every event with a registered scrambler, in registration order. */
export function implementedEvents(): WcaEventId[] {
  return [...registry.keys()];
}

/** Test-only: clears every registration. Not exported from the package's public entry point. */
export function _resetRegistryForTests(): void {
  registry.clear();
}
