/**
 * `@cube/scrambler` public entry point. Pure computation only — no Web
 * Worker, no DOM, no browser-only API — so importing this (and calling
 * `generateScramble`) works identically in Node, Bun, Vite, and both
 * Next.js server and client contexts.
 */
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
