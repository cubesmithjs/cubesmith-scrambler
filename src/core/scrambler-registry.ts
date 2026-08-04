import type { RandomSource } from '../random/random-source';
import type { GenerateScrambleOptions, WcaEventId } from './types';

export type EventScrambler = (
  random: RandomSource,
  options: GenerateScrambleOptions,
) => string;

const registry = new Map<WcaEventId, EventScrambler>();

/** Registers the scrambler for an event. Called once per implemented puzzle at module load (e.g. `puzzles/333/index.ts`). */
export function registerScrambler(event: WcaEventId, scrambler: EventScrambler): void {
  registry.set(event, scrambler);
}

export function getScrambler(event: WcaEventId): EventScrambler | undefined {
  return registry.get(event);
}

export function isImplementedEvent(event: WcaEventId): boolean {
  return registry.has(event);
}

/** Test-only: clears every registration. Not exported from the package's public entry point. */
export function _resetRegistryForTests(): void {
  registry.clear();
}
