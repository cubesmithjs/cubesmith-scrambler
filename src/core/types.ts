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
