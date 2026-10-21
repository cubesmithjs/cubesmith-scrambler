/**
 * `@cubesmith/scrambler/unofficial`: scrambles for puzzles the WCA does not
 * hold. Pure computation only, like the main entry.
 *
 * 🔴 Nothing here is a WCA scramble, and nothing here claims to be. There is no
 * regulation for these events, so each length, orientation rule and notation
 * choice is either cited or labelled a CubeSmith convention in
 * `docs/unofficial-design.md`. The main entry is unchanged by this one:
 * `isImplementedEvent()` still answers `false` for every id below.
 */
import { registerUnofficialScramblers } from './events';
import { getUnofficialScrambler, implementedUnofficialEvents } from './registry';
import type { UnofficialEventId } from './types';

// A real call rather than a bare side-effect import, for the reason
// `src/index.ts` gives: a bundler may drop an import kept only for its effect.
registerUnofficialScramblers();

/** Whether `event` has a scrambler in this entry. Never consults the WCA registry. */
export function isImplementedUnofficialEvent(event: UnofficialEventId): boolean {
  return getUnofficialScrambler(event) !== undefined;
}

/** Every unofficial event with a scrambler, in registration order. */
export function unofficialEvents(): UnofficialEventId[] {
  return implementedUnofficialEvents();
}

export {
  generateUnofficialScramble,
  generateUnofficialScrambles,
  prepareUnofficialEvent,
  validateUnofficialScramble,
} from './generate';
export { InvalidUnofficialScrambleCountError, UnimplementedUnofficialEventError } from './errors';
export { BIG_CUBES, NOTATION_OF, SHAPE_MODS } from './catalogue';
export { MAX_BATCH_COUNT } from '../core/types';
// The classes inside a failed `validateUnofficialScramble` result. Each entry
// point is a self-contained file, so the main entry's copies would not match
// them under `instanceof`.
export { AlgorithmSyntaxError } from '../notation/alg/types';
export { ScrambleSyntaxError } from '../core/scramble-errors';
export type {
  UnofficialEventId,
  UnofficialScrambleOptions,
  UnofficialScrambleQuality,
  UnofficialScrambleResult,
  UnofficialScramblesOptions,
} from './types';
export type { ScrambleValidation } from '../core/validate-scramble';
