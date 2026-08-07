/**
 * `@cubesmith/scrambler` public entry point. Pure computation only — no
 * Web Worker, no DOM, no browser-only API — so importing this (and calling
 * `generateScramble`) works identically in Node, Bun, Vite, and both
 * Next.js server and client contexts.
 */
import { register222Scrambler } from './puzzles/222';
import { register333Scrambler, register333FewestMovesScrambler } from './puzzles/333';
import { registerClockScrambler } from './puzzles/clock';
import { registerMegaminxScrambler } from './puzzles/megaminx';
import { registerRandomMoveCubeScramblers } from './puzzles/nxn';
import { registerPyraminxScrambler } from './puzzles/pyraminx';
import { registerSkewbScrambler } from './puzzles/skewb';
import { registerSquare1Scrambler } from './puzzles/square1';
import { register444Scrambler } from './puzzles/444/solve';
import { registerVariantScramblers } from './puzzles/variants';

// Real function calls, not bare `import '...'` for their side effect —
// registering a puzzle mutates the scrambler registry, and an import kept
// around only for that effect is exactly the pattern a bundler's
// tree-shaking is allowed to drop once it sees this package declare
// `sideEffects` (see package.json, which deliberately does NOT claim
// `false` for this reason). A visible top-level call is not eligible for
// that kind of removal.
register222Scrambler();
register333Scrambler();
// A puzzle in its own right, not a variant of 333 — its scramble is padded
// with `R' U' F` at both ends. See `puzzles/333/fewest-moves.ts`.
register333FewestMovesScrambler();
registerPyraminxScrambler();
registerSkewbScrambler();
registerClockScrambler();
registerMegaminxScrambler();
registerRandomMoveCubeScramblers();
registerSquare1Scrambler();
register444Scrambler();
// Last, because the variant events build on the scramblers registered above.
registerVariantScramblers();

export { generateScramble } from './core/generate-scramble';
export { InvalidScrambleCountError, UnimplementedEventError } from './core/errors';
export { MAX_SCRAMBLE_COUNT } from './core/types';
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

/**
 * Full WCA algorithm notation — read, invert, write.
 *
 * Separate from the `move.ts` primitives above, which stay exactly as they
 * are: those are the narrow face-move type the cube puzzles are built on, and
 * nothing here supersedes them. This layer is syntax only — there is no puzzle
 * behind it, so no `simplify()` and no move cancellation. See
 * `docs/notation-design.md`.
 */
export { parseAlgorithm, serializeAlgorithm, invertAlgorithm } from './notation/alg';
export { AlgorithmSyntaxError } from './notation/alg';
export type {
  Algorithm,
  AlgorithmNode,
  CommutatorNode,
  ConjugateNode,
  GroupNode,
  MoveFamily,
  MoveNode,
  PauseNode,
} from './notation/alg';

export { createRandomSource, type RandomSource } from './random/random-source';
