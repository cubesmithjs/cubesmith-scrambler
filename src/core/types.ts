/**
 * The full target WCA event surface this package aims to eventually cover
 * (mirrors the event catalog `cube-manager-frontend` itself already uses in
 * `src/lib/data.ts`, for consistency once this package is wired into that
 * app). Declaring the full union now is just a type — it makes no claim
 * about what's implemented; `isImplementedEvent()`/the scrambler registry
 * are the source of truth for that.
 */
export type WcaEventId =
  | '222'
  | '333'
  | '444'
  | '555'
  | '666'
  | '777'
  | '333bf'
  | '333fm'
  | '333oh'
  | '333mbf'
  | '444bf'
  | '555bf'
  | 'minx'
  | 'pyram'
  | 'clock'
  | 'skewb'
  | 'sq1';

/**
 * How the scramble was produced, and therefore what can be claimed about it.
 *
 * - `random-state` — a uniformly random legal state, solved near-optimally
 *   and inverted.
 * - `random-moves` — a fixed-length sequence of randomly chosen moves, with
 *   no solve involved.
 *
 * This is not a quality ranking of *this* package's work: WCA Regulation
 * 4b3e specifies random-moves for 5x5x5, 6x6x6, 7x7x7 and Megaminx, so for
 * those events random-moves *is* the official method and a random-state
 * scramble would be the non-conforming one. Every other implemented event is
 * random-state.
 */
export type ScrambleQuality = 'random-state' | 'random-moves';

export interface ScrambleResult {
  readonly event: WcaEventId;
  readonly moves: string;
  readonly quality: ScrambleQuality;
  /**
   * Every scramble the call produced, for a **multi-scramble event** — today
   * only `333mbf`, where one attempt covers many cubes. Absent for every other
   * event, and `scrambles[0] === moves` when present, so a caller that only
   * knows about `moves` still gets a correct single scramble.
   *
   * See `GenerateScrambleOptions.count` for how many are drawn.
   */
  readonly scrambles?: readonly string[];
}

/**
 * How many cubes a single multi-blind attempt may cover in one call.
 *
 * This is a guard, not a regulation: nothing in the WCA Regulations caps the
 * number of cubes (H1a caps the *time* instead, at 10 minutes per cube up to
 * 60). The bound exists because every cube is a full random-state 3x3x3 solve
 * — roughly 100 ms each once the pruning tables are warm — in a package with
 * no Worker to hide the work in. An unbounded `count` fed from user input
 * would be a trivial way to block a caller's main thread for minutes.
 */
export const MAX_SCRAMBLE_COUNT = 100;

export interface GenerateScrambleOptions {
  /** Deterministic when provided; drawn from `crypto.getRandomValues` (falling back to `Math.random`) otherwise. */
  readonly seed?: string | number;
  /**
   * How many scrambles to draw, for a **multi-scramble event** only. Defaults
   * to 1, which is what `333mbf` returns without it — the same single oriented
   * 3BLD scramble `333bf` gives.
   *
   * Passing it to any other event throws `InvalidScrambleCountError` rather
   * than being ignored. Must be an integer in `1..MAX_SCRAMBLE_COUNT`; see
   * that constant for the per-cube cost the bound is protecting.
   */
  readonly count?: number;
}

/**
 * How many scrambles one `generateScrambles()` call may draw.
 *
 * A guard, not a regulation — the same framing `MAX_SCRAMBLE_COUNT` uses, and
 * deliberately a *different number* from it. `MAX_SCRAMBLE_COUNT` bounds how
 * many cubes one multi-blind attempt covers; reusing it here would conflate two
 * unrelated protections and cap `555` (about 1 ms a scramble) at the same 100 as
 * `444bf` (833 ms warm, measured 2026-08-11).
 *
 * 500 × that worst measured warm cost is roughly seven minutes of computation,
 * which is a long time but is the deliberate act of a caller that passed 500
 * rather than an accident. A consumer's real limit is its own; this one only
 * stops an unbounded number arriving from user input.
 */
export const MAX_BATCH_COUNT = 500;

export interface GenerateScramblesOptions {
  /**
   * Deterministic when provided. **One** random source feeds the whole batch,
   * so a seed makes the batch reproducible *and* its members distinct — unlike
   * a caller-side loop over `generateScramble({ seed })`, which reseeds every
   * iteration and therefore returns the same scramble `count` times.
   */
  readonly seed?: string | number;
  /**
   * Called after each scramble lands, and **awaited**.
   *
   * Awaiting it is the package's entire answer to a long batch blocking a
   * thread, and what the caller returns decides the behaviour: nothing keeps
   * the tightest loop (right in a Worker, in Node, in a CLI), while
   * `scheduler.yield()` or `new Promise(r => setTimeout(r, 0))` gives the
   * browser a real macrotask boundary so it can paint between scrambles.
   *
   * Called exactly `count` times, never before the first draw, always with
   * `(done, total)`. A throw from it propagates and stops further draws — which
   * is the cancel path, so no `AbortSignal` and no DOM type is needed.
   */
  readonly onProgress?: (done: number, total: number) => void | Promise<void>;
  /**
   * For a **multi-scramble event** (`333mbf`) only: how many cubes each of the
   * `count` attempts covers. The two axes stay orthogonal — `count` is how many
   * attempts, this is how many cubes in one attempt — and this one maps onto
   * `GenerateScrambleOptions.count`, so `MAX_SCRAMBLE_COUNT` keeps governing it
   * exactly as it does today.
   *
   * Passing it for any other event throws `InvalidScrambleCountError`, for the
   * same reason `count` does: a caller who asks for something and silently
   * receives something else has been misled.
   */
  readonly cubesPerAttempt?: number;
}
