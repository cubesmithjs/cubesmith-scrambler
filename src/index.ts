/**
 * `@cubesmith/scrambler` public entry point. Pure computation only — no
 * Web Worker, no DOM, no browser-only API — so importing this (and calling
 * `generateScramble`) works identically in Node, Bun, Vite, and both
 * Next.js server and client contexts.
 */
import { register222Scrambler } from './puzzles/222';
import { register333Scrambler, register333FewestMovesScrambler } from './puzzles/333';
import { registerClockScrambler } from './puzzles/clock';
import { registerFtoScrambler } from './puzzles/fto';
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
registerFtoScrambler();
// Last, because the variant events build on the scramblers registered above.
registerVariantScramblers();

export { generateScramble } from './core/generate-scramble';
/**
 * `generateScrambles` is the batch draw, and it is not sugar over a loop: it
 * creates **one** `RandomSource` for the whole batch, which is what makes a
 * seeded batch reproducible *and* its members distinct. A caller-side loop over
 * `generateScramble({ seed })` reseeds every iteration and therefore returns the
 * same scramble N times.
 *
 * `prepareEvent` pays a puzzle's table-build cost on purpose — 7 s for a cold
 * `444` — rather than charging it to the first scramble a user waits for.
 */
export { generateScrambles } from './core/generate-scrambles';
export { prepareEvent } from './core/prepare-event';
export { InvalidScrambleCountError, UnimplementedEventError } from './core/errors';
export { MAX_BATCH_COUNT, MAX_SCRAMBLE_COUNT } from './core/types';
export type {
  GenerateScrambleOptions,
  GenerateScramblesOptions,
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
 *
 * `validateAlgorithm` is the non-throwing sibling of `parseAlgorithm`, for the
 * calling context where invalid input is normal rather than exceptional — a
 * text field being typed into. Either way, a rejection carries a stable
 * `SyntaxErrorReason` code and the data to interpolate, so the sentence shown
 * to a user is the consumer's to write, in the consumer's language.
 */
export {
  parseAlgorithm,
  serializeAlgorithm,
  invertAlgorithm,
  validateAlgorithm,
} from './notation/alg';
export { AlgorithmSyntaxError } from './notation/alg';
export type {
  Algorithm,
  AlgorithmNode,
  AlgorithmSyntaxErrorDetail,
  AlgorithmValidation,
  CommutatorNode,
  ConjugateNode,
  GroupNode,
  MoveFamily,
  MoveNode,
  PauseNode,
  SyntaxErrorReason,
} from './notation/alg';

/**
 * One door onto **all seven** notations, keyed on the event.
 *
 * `parseAlgorithm` reads the twelve cube events. The other six — Megaminx,
 * Clock, Pyraminx, Skewb, Square-1 and, since v0.15, the Face Turning
 * Octahedron — are written in grammars of their own. The first five parsers
 * lived inside this package, fully tested, and were reachable from nowhere
 * outside it until v0.12. `validateScramble` is that reach, and it gives all
 * six what v0.11 gave cube notation: an offset, a span, and a stable code
 * instead of an English sentence.
 *
 * `ScrambleSyntaxError` is deliberately **not** a subclass of
 * `AlgorithmSyntaxError`, and `ScrambleErrorReason` deliberately not a member
 * of `SyntaxErrorReason` — see their doc comments. Two grammars, two unions,
 * and an existing cube-only consumer's exhaustive table keeps compiling.
 */
export { validateScramble } from './core/validate-scramble';
export type { ScrambleValidation } from './core/validate-scramble';
export { ScrambleSyntaxError } from './core/scramble-errors';
export type {
  BespokeNotation,
  Notation,
  ScrambleErrorReason,
  ScrambleSyntaxErrorDetail,
} from './core/scramble-errors';
export { notationForEvent } from './core/event-notation';

export { createRandomSource, type RandomSource } from './random/random-source';
