/**
 * `@cubesmith/scrambler/draw` — the 2D scramble picture, as data.
 *
 * A **second entry point** on purpose. The drawing layer is roughly as large as
 * the scrambling one, and a consumer that only scrambles — a practice timer, a
 * results page — must not pay for it. So `package.json`'s `exports` carries `./draw`
 * and 🔴 **the main entry re-exports nothing from here**; `draw-bundle.test.ts`
 * reads the built `dist/index.js` and fails if that ever stops being true.
 *
 * Importing this module registers every drawer, the same way importing the main
 * entry registers every scrambler:
 *
 * ```ts
 * import { drawScramble, scrambleImageToSvg } from '@cubesmith/scrambler/draw';
 *
 * const image = drawScramble('333', "R U R' U'");
 * image.shapes.length;            // 54 stickers
 * scrambleImageToSvg(image);      // a standalone <svg> string
 * ```
 *
 * Pure computation, like the rest of the package: no DOM, no canvas, no WebGL, no
 * `customElements`. 2D is in scope precisely because it is geometry — numbers and
 * colour strings — and needs no browser API. 3D is not, and nothing here changes
 * that.
 */
import type { WcaEventId } from '../core/types';
import { registerClockDrawer } from './clock';
import { registerCubeDrawers } from './cube';
import { registerMegaminxDrawer } from './megaminx';
import { registerPyraminxDrawer } from './pyraminx';
import { registerSkewbDrawer } from './skewb';
import { registerSquare1Drawer } from './square1';
import { mergeColorScheme } from './color';
import { UnimplementedDrawingError } from './errors';
import { getDrawer } from './registry';
import type { PartialColorScheme, ScrambleImage } from './types';

// Real function calls rather than bare side-effect imports — the same reasoning
// `src/index.ts` spells out for the scrambler registry.
registerCubeDrawers();
registerPyraminxDrawer();
registerSkewbDrawer();
registerClockDrawer();
registerMegaminxDrawer();
registerSquare1Drawer();

/**
 * Draws `scramble` for `event`, returning the picture as data.
 *
 * The scramble is taken as **text**, which is TNoodle's public signature
 * (`drawScramble(String scramble, Map<String, Color>)`) and is the decision that
 * matters: a hand-typed, pasted or database-stored scramble draws exactly as a
 * freshly generated one does, because there is only one path.
 *
 * `colorScheme` overrides some or all of the puzzle's defaults and inherits the
 * rest, matching TNoodle's "missing entries merged from defaults". 🔴 The schemes
 * are **not interchangeable between puzzles** — three of them disagree about what
 * colour `R` is, and the Clock's keys are not faces — so read
 * {@link defaultColorScheme} for the event before overriding a key.
 *
 * @throws {UnimplementedDrawingError} if `event` has no drawer. Deliberately not
 *   `UnimplementedEventError`, which means "no scrambler" — two different absences.
 * @throws {AlgorithmSyntaxError | ScrambleSyntaxError} for a malformed scramble,
 *   **unchanged and unwrapped**, so a consumer already handling those from
 *   `validateScramble` keeps its handling.
 * @throws {UnsupportedScrambleError} for valid cube notation a scramble never
 *   contains — a slice move, a layer range, a commutator.
 * @throws {InvalidColorError} if a supplied colour is not a colour string.
 */
export function drawScramble(
  event: WcaEventId,
  scramble: string,
  colorScheme?: PartialColorScheme,
): ScrambleImage {
  const drawer = getDrawer(event);
  if (!drawer) throw new UnimplementedDrawingError(event);
  return drawer.draw(scramble, mergeColorScheme(drawer.defaultScheme, colorScheme));
}

/**
 * The puzzle's default colour scheme — TNoodle's `getDefaultColorScheme()`,
 * transcribed from `java.awt.Color` values to `#rrggbb`.
 *
 * Public because the key set is what a caller needs in order to override anything:
 * six face names for the cubes, four for Pyraminx, twelve for Megaminx, and twelve
 * non-face names for the Clock.
 */
export function defaultColorScheme(event: WcaEventId): Readonly<Record<string, string>> {
  const drawer = getDrawer(event);
  if (!drawer) throw new UnimplementedDrawingError(event);
  return drawer.defaultScheme;
}

/** Whether `event` has a drawer — the non-throwing sibling of `drawScramble`'s first check. */
export function isDrawableEvent(event: WcaEventId): boolean {
  return getDrawer(event) !== undefined;
}

export { drawableEvents } from './registry';
export { scrambleImageToSvg } from './svg';
export { InvalidColorError, UnimplementedDrawingError, UnsupportedScrambleError } from './errors';
export type {
  ColorScheme,
  ImageShape,
  PartialColorScheme,
  ScrambleImage,
} from './types';
