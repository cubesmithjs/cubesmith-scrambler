/**
 * `@cubesmith/scrambler/unofficial/draw`: pictures of unofficial-event
 * scrambles, as data. Separate from `./unofficial` for the reason `./draw` is
 * separate from the main entry: a consumer that only scrambles never bundles
 * the drawing code, the shape-mod geometry engine included.
 *
 * - **Big cubes and blindfolded cubes**: the WCA cube net, at any size.
 * - **`pyrambf`, `minxbf`**: the Pyraminx and Megaminx nets.
 * - **Shape mods**: two isometric views of the solid, drawn by a convex-piece
 *   engine (`shape-mod/render.ts`). The Mirror Cube also has a flat height map.
 *   Axis, Windmill and Ghost have no drawing yet, because their geometry has no
 *   source; see `docs/shape-mod-drawing-design.md` §5.
 */
import { mergeColorScheme } from '../../draw/color';
import { imageToSvg } from '../../draw/svg';
import type { PartialColorScheme } from '../../draw/types';
import type { UnofficialEventId } from '../types';
import { UnimplementedUnofficialDrawingError } from './errors';
import { registerNetDrawers } from './nets';
import { getUnofficialDrawer } from './registry';
import { registerShapeModDrawers } from './shape-mods';
import type {
  UnofficialDrawer,
  UnofficialDrawingView,
  UnofficialDrawOptions,
  UnofficialScrambleImage,
} from './types';

// Real calls rather than side-effect imports, for the reason `src/index.ts` gives.
registerNetDrawers();
registerShapeModDrawers();

function drawerFor(event: UnofficialEventId): UnofficialDrawer {
  const drawer = getUnofficialDrawer(event);
  if (!drawer) throw new UnimplementedUnofficialDrawingError(event);
  return drawer;
}

/**
 * Draws `scramble` for `event`, returning the picture as data. The scramble is
 * taken as **text**, so a typed or stored scramble draws exactly as a generated
 * one does.
 *
 * @throws {UnimplementedUnofficialDrawingError} if `event` has no drawing, or
 *   no drawing in `options.view`.
 * @throws {AlgorithmSyntaxError | ScrambleSyntaxError} for a malformed scramble,
 *   unwrapped.
 * @throws {UnsupportedUnofficialScrambleError} for valid cube notation a scramble
 *   never contains: a slice move, a layer range, a commutator.
 * @throws {InvalidColorError} if a supplied colour is not a colour string.
 */
export function drawUnofficialScramble(
  event: UnofficialEventId,
  scramble: string,
  colorScheme?: PartialColorScheme,
  options: UnofficialDrawOptions = {},
): UnofficialScrambleImage {
  const drawer = drawerFor(event);
  const view = options.view ?? drawer.views[0]!;
  if (!drawer.views.includes(view)) throw new UnimplementedUnofficialDrawingError(event, view);
  return { event, ...drawer.draw(scramble, mergeColorScheme(drawer.defaultScheme, colorScheme), view) };
}

/**
 * The event's default colour scheme. The keys are what an override may set: six
 * faces for the cubes and Fisher, four for Pyraminx and Mastermorphix, twelve
 * for Megaminx, and `surface` for the Mirror Cube. Every shape mod also has
 * `body`, the plastic its exposed cut faces show.
 */
export function defaultUnofficialColorScheme(event: UnofficialEventId): Readonly<Record<string, string>> {
  return drawerFor(event).defaultScheme;
}

/** The views `event` can be drawn in, default first. */
export function drawingViews(event: UnofficialEventId): readonly UnofficialDrawingView[] {
  return drawerFor(event).views;
}

/** Whether `event` has a drawing: the non-throwing sibling of `drawUnofficialScramble`'s first check. */
export function isDrawableUnofficialEvent(event: UnofficialEventId): boolean {
  return getUnofficialDrawer(event) !== undefined;
}

/** Serializes an unofficial scramble image to a standalone SVG document string. */
export function scrambleImageToSvg(image: UnofficialScrambleImage): string {
  return imageToSvg(image);
}

export { drawableUnofficialEvents } from './registry';
export { UnimplementedUnofficialDrawingError, UnsupportedUnofficialScrambleError } from './errors';
// The same classes this entry throws. Each entry point is a self-contained file,
// so catching the main draw entry's `InvalidColorError` would not match one
// thrown from here.
export { InvalidColorError } from '../../draw/errors';
export { AlgorithmSyntaxError } from '../../notation/alg/types';
export { ScrambleSyntaxError } from '../../core/scramble-errors';
export type { ImageShape, PartialColorScheme } from '../../draw/types';
export type {
  UnofficialDrawingView,
  UnofficialDrawOptions,
  UnofficialScrambleImage,
} from './types';
export type { UnofficialEventId } from '../types';
