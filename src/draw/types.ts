import type { WcaEventId } from '../core/types';

/**
 * A scramble picture as **data** — the flat sticker net that appears beside every
 * scramble on an official WCA scramble sheet, in TNoodle's own unit space.
 *
 * ## Why data rather than an SVG string
 *
 * TNoodle's `drawScramble` returns an `Svg` *document object* built from
 * `Rectangle`/`Circle`/`Path` primitives, not a string each puzzle concatenates.
 * This is the same decision, and it earns its keep three times:
 *
 * - A **React** consumer maps `shapes` to elements. An SVG string would force
 *   `dangerouslySetInnerHTML` and lose per-sticker keys, `title`s and click
 *   targets.
 * - A **print/PDF** consumer wants the string, and {@link scrambleImageToSvg} is
 *   a thin serializer over exactly this data.
 * - **Tests can assert geometry** — "the U-face centre rectangle is at (x, y) and
 *   is white" — instead of string-matching markup. That is the only way "the same
 *   as TNoodle" is checkable at all.
 *
 * ## Coordinates
 *
 * Numbers in TNoodle's own unit space (its `gap`/`cubieSize`/`radius` pixels),
 * with no `viewBox` scaling baked in. `width`/`height` are TNoodle's
 * `getPreferredSize()`. A consumer scales by setting `viewBox="0 0 width height"`,
 * which is what `scrambleImageToSvg` writes.
 */
export interface ScrambleImage {
  readonly event: WcaEventId;
  /** Intrinsic width — TNoodle's `getPreferredSize().width`. */
  readonly width: number;
  /** Intrinsic height — TNoodle's `getPreferredSize().height`. */
  readonly height: number;
  /**
   * The document-level stroke width, which TNoodle sets with `Svg.setStroke` —
   * `2` for the Clock, `1` (the SVG default) for every other puzzle. A shape's own
   * `strokeWidth` overrides it; the Clock's dial faces are the only shapes that do.
   */
  readonly strokeWidth: number;
  /**
   * Every shape, in paint order: later shapes draw over earlier ones, exactly as
   * TNoodle's `appendChild` order does. Two of the drawings depend on it — the
   * Clock lays its dial faces over a panel background, and the Square-1 draws its
   * middle bar over the layer views.
   */
  readonly shapes: readonly ImageShape[];
}

/** Fields every shape carries, whatever its geometry. */
interface ShapeCommon {
  /** A CSS colour string, or `'none'`. */
  readonly fill: string;
  /** A CSS colour string, or `'none'`. */
  readonly stroke: string;
  /** Absent means "the document default", which `scrambleImageToSvg` writes once on the root. */
  readonly strokeWidth?: number | undefined;
  /**
   * Which colour-scheme key this shape wears, when it is a sticker.
   *
   * Not in TNoodle's model, and an addition rather than a reinterpretation: it is
   * what lets a React consumer key and label a sticker, and what lets a test say
   * "every U-face shape is white" without re-deriving the layout it is checking.
   * Absent on the shapes that are not stickers — a Clock dial hand, a Square-1
   * middle bar — because inventing a face for those would be a false claim.
   */
  readonly face?: string | undefined;
}

export type ImageShape =
  | (ShapeCommon & {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    })
  | (ShapeCommon & {
      readonly kind: 'polygon';
      readonly points: readonly (readonly [number, number])[];
    })
  | (ShapeCommon & {
      readonly kind: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
    })
  | (ShapeCommon & {
      readonly kind: 'path';
      /** An SVG path `d` attribute this package produced. Never caller-supplied. */
      readonly d: string;
    });

/**
 * Face name → CSS colour string.
 *
 * 🔴 **The keys differ per puzzle and the schemes are not interchangeable.** Three
 * of them disagree about what colour `R` is, and the Clock has twelve keys that
 * are not faces at all. Copying the cube's scheme onto Skewb or Square-1 produces
 * a picture that is plausible and wrong.
 */
export type ColorScheme = Readonly<Record<string, string>>;

/** What a caller may pass to override some or all of a puzzle's default scheme. */
export type PartialColorScheme = Readonly<Record<string, string | undefined>>;
