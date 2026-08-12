import type { WcaEventId } from '../core/types';
import type { ColorScheme, ScrambleImage } from './types';

export interface PuzzleDrawer {
  /**
   * Draws `scramble` — as **text**, exactly as TNoodle's public
   * `drawScramble(String, Map)` takes it — so a hand-typed or pasted scramble
   * draws identically to a generated one.
   *
   * `scheme` is already merged over this drawer's defaults, so every key the
   * drawer reads is present.
   */
  readonly draw: (scramble: string, scheme: ColorScheme) => ScrambleImage;
  readonly defaultScheme: ColorScheme;
}

const drawers = new Map<WcaEventId, PuzzleDrawer>();

/**
 * Registers the drawer for an event. Called from `src/draw/index.ts` as a real
 * function call, for the same reason `src/index.ts` registers scramblers that way:
 * a bare `import '...'` kept only for its side effect is exactly what a bundler's
 * tree-shaking is allowed to drop, and `package.json` deliberately does not claim
 * `sideEffects: false`.
 */
export function registerDrawer(event: WcaEventId, drawer: PuzzleDrawer): void {
  drawers.set(event, drawer);
}

/** Registers one drawer for several events — the cube net covers twelve of them. */
export function registerDrawers(events: readonly WcaEventId[], drawer: PuzzleDrawer): void {
  for (const event of events) drawers.set(event, drawer);
}

export function getDrawer(event: WcaEventId): PuzzleDrawer | undefined {
  return drawers.get(event);
}

/** Every event with a registered drawer, in registration order. */
export function drawableEvents(): WcaEventId[] {
  return [...drawers.keys()];
}
