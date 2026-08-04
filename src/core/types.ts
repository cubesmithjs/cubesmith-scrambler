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

/** How the scramble was produced. `random-state`: a uniformly random legal state, solved near-optimally and inverted — the same quality class WCA competitions use. */
export type ScrambleQuality = 'random-state';

export interface ScrambleResult {
  readonly event: WcaEventId;
  readonly moves: string;
  readonly quality: ScrambleQuality;
}

export interface GenerateScrambleOptions {
  /** Deterministic when provided; drawn from `crypto.getRandomValues` (falling back to `Math.random`) otherwise. */
  readonly seed?: string | number;
}
