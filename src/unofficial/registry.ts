import type { RandomSource } from '../random/random-source';
import type { UnofficialEventId, UnofficialScrambleQuality } from './types';

export interface UnofficialRegistration {
  readonly scramble: (random: RandomSource) => string;
  readonly quality: UnofficialScrambleQuality;
  /** Builds the puzzle's tables now; absent when there is nothing to precompute. */
  readonly prepare?: (() => void) | undefined;
}

/**
 * 🔴 A separate map from `core/scrambler-registry.ts`'s, never a write into it.
 * Registering an unofficial event there would make the main entry's
 * `isImplementedEvent('888')` true as soon as both entries were loaded in one
 * process: a side effect across entry points, which is exactly the coupling
 * the split exists to remove. `unofficial.test.ts` checks it.
 */
const registry = new Map<UnofficialEventId, UnofficialRegistration>();

export function registerUnofficialScrambler(
  event: UnofficialEventId,
  registration: UnofficialRegistration,
): void {
  registry.set(event, registration);
}

export function getUnofficialScrambler(event: UnofficialEventId): UnofficialRegistration | undefined {
  return registry.get(event);
}

/** Every unofficial event with a registered scrambler, in registration order. */
export function implementedUnofficialEvents(): UnofficialEventId[] {
  return [...registry.keys()];
}
