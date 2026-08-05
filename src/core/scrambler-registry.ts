import type { RandomSource } from '../random/random-source';
import type { GenerateScrambleOptions, ScrambleQuality, WcaEventId } from './types';

export type EventScrambler = (
  random: RandomSource,
  options: GenerateScrambleOptions,
) => string;

interface Registration {
  readonly scramble: EventScrambler;
  readonly quality: ScrambleQuality;
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
): void {
  registry.set(event, { scramble, quality });
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
