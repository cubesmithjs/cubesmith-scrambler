/**
 * `@cubesmith/scrambler` public entry point. Pure computation only — no
 * Web Worker, no DOM, no browser-only API — so importing this (and calling
 * `generateScramble`) works identically in Node, Bun, Vite, and both
 * Next.js server and client contexts.
 */
import { register222Scrambler } from './puzzles/222';
import { register333Scrambler } from './puzzles/333';
import { registerPyraminxScrambler } from './puzzles/pyraminx';
import { registerSkewbScrambler } from './puzzles/skewb';

// Real function calls, not bare `import '...'` for their side effect —
// registering a puzzle mutates the scrambler registry, and an import kept
// around only for that effect is exactly the pattern a bundler's
// tree-shaking is allowed to drop once it sees this package declare
// `sideEffects` (see package.json, which deliberately does NOT claim
// `false` for this reason). A visible top-level call is not eligible for
// that kind of removal.
register222Scrambler();
register333Scrambler();
registerPyraminxScrambler();
registerSkewbScrambler();

export { generateScramble } from './core/generate-scramble';
export { UnimplementedEventError } from './core/errors';
export type {
  GenerateScrambleOptions,
  ScrambleQuality,
  ScrambleResult,
  WcaEventId,
} from './core/types';
export { isImplementedEvent } from './core/scrambler-registry';

export {
  AMOUNTS,
  FACES,
  inverseMove,
  inverseMoves,
  moveToString,
  movesToString,
  parseMove,
  type Amount,
  type Face,
  type FaceMove,
} from './notation/move';

export { createRandomSource, type RandomSource } from './random/random-source';
