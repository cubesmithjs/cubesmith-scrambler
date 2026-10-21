/**
 * Types for the **unofficial** events: puzzles the WCA does not hold, served
 * from `@cubesmith/scrambler/unofficial` rather than the main entry.
 *
 * They are separate types, not new members of `WcaEventId`, on purpose. Every
 * claim the main entry makes is backed by a WCA Regulation or by TNoodle, and
 * none of these events has either. Folding them into `WcaEventId` would put
 * claims the package cannot back on the same surface as ones it can, and would
 * change `isImplementedEvent()`'s answer for consumers that rely on "the main
 * entry knows only WCA events".
 */

/**
 * Every unofficial event, by the id the CubeManager event catalogue already
 * uses for it (`cube-manager-backend/database/seeders/EventSeeder.php`). Ids
 * are `[a-z0-9]+`: no hyphen, because a consumer may split a WCIF-style
 * activity code on `-`.
 */
export type UnofficialEventId =
  // Big cubes, random-moves like 555–777.
  | '888'
  | '999'
  | '1010'
  | '1111'
  | '1212'
  // Blindfolded variants of WCA puzzles.
  | '222bf'
  | '666bf'
  | '777bf'
  | 'pyrambf'
  | 'minxbf'
  // Shape mods of a 3x3x3 mechanism.
  | 'mirror'
  | 'axis'
  | 'fisher'
  | 'windmill'
  | 'ghost'
  | 'mastermorphix';

/**
 * How a scramble was drawn.
 *
 * - `random-state`: uniform over the puzzle's reachable states.
 * - `random-moves`: a sequence of random moves, as WCA Regulation 4b3e
 *   prescribes for its big cubes.
 * - `random-state-mechanism`: uniform over a **hidden mechanism's** states,
 *   not over what the solver sees. A 3x3x3 random-state scramble applied to an
 *   Axis Cube gives a uniform corner and edge state, but the visible centre
 *   orientations follow from the move sequence. They are not drawn uniformly
 *   from the 4⁶/2 supercube possibilities. Calling that `random-state` would be
 *   a false claim about what the competitor receives.
 */
export type UnofficialScrambleQuality = 'random-state' | 'random-moves' | 'random-state-mechanism';

export interface UnofficialScrambleResult {
  readonly event: UnofficialEventId;
  readonly moves: string;
  readonly quality: UnofficialScrambleQuality;
}

export interface UnofficialScrambleOptions {
  /** Deterministic when provided; drawn from `crypto.getRandomValues` (falling back to `Math.random`) otherwise. */
  readonly seed?: string | number;
}

export interface UnofficialScramblesOptions {
  /** Seeds the whole batch, so the same seed and count give the same batch. */
  readonly seed?: string | number;
  /** Called after each scramble with `(done, total)`. Awaited, so a caller may yield to its event loop. */
  readonly onProgress?: (done: number, total: number) => void | Promise<void>;
}
