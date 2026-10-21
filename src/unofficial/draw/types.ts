import type { ColorScheme, ImageShape } from '../../draw/types';
import type { UnofficialEventId } from '../types';

/**
 * A scramble picture for an unofficial event: the same data as the main draw
 * entry's `ScrambleImage`, carrying an unofficial event id. Serialize it with
 * this entry's `scrambleImageToSvg`.
 */
export interface UnofficialScrambleImage {
  readonly event: UnofficialEventId;
  /** Intrinsic width, in the drawing's own units. */
  readonly width: number;
  /** Intrinsic height, in the drawing's own units. */
  readonly height: number;
  /** The document-level stroke width. A shape's own `strokeWidth` overrides it. */
  readonly strokeWidth: number;
  /** Every shape, in paint order: later shapes draw over earlier ones. */
  readonly shapes: readonly ImageShape[];
}

/**
 * Which picture of the puzzle to draw.
 *
 * - `net`: the flat sticker net, as for the WCA cubes, Pyraminx and Megaminx.
 * - `isometric`: two isometric views of the solid (front-top-right and
 *   back-bottom-left), so every face appears once. This is what a shape mod
 *   looks like in the hand.
 * - `height-map`: the Mirror Cube only. A flat net whose tiles are tinted by
 *   how far each one stands out, with a contour line at every step.
 */
export type UnofficialDrawingView = 'net' | 'isometric' | 'height-map';

export interface UnofficialDrawOptions {
  /** Which picture to draw. Defaults to the event's first view (`drawingViews(event)[0]`). */
  readonly view?: UnofficialDrawingView;
}

export interface UnofficialDrawer {
  /** The views this event can be drawn in. The first is the default. */
  readonly views: readonly UnofficialDrawingView[];
  readonly defaultScheme: ColorScheme;
  readonly draw: (
    scramble: string,
    scheme: ColorScheme,
    view: UnofficialDrawingView,
  ) => Omit<UnofficialScrambleImage, 'event'>;
}
