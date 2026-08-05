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
}

export interface GenerateScrambleOptions {
  /** Deterministic when provided; drawn from `crypto.getRandomValues` (falling back to `Math.random`) otherwise. */
  readonly seed?: string | number;
}
