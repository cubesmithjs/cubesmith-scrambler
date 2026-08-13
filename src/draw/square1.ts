import { parseSquare1Scramble } from '../puzzles/square1/notation';
import {
  applySquare1Moves,
  isCornerPiece,
  LOWER_RING,
  RING_SLOTS,
  SOLVED_SQUARE1_STATE,
  UPPER_RING,
  type Square1State,
} from '../puzzles/square1/state';
import { colorFor } from './color';
import { registerDrawer, type PuzzleDrawer } from './registry';
import { apply, rotate, translate, translation, type Transform2D } from './transform';
import type { ColorScheme, ImageShape, ScrambleImage } from './types';

/**
 * Square-1, from `SquareOnePuzzle.java` — two stacked layer views plus the middle
 * bar.
 *
 * ```java
 * private static final int radius = 32;
 * private static final double RADIUS_MULTIPLIER = Math.sqrt(2) * Math.cos(Math.toRadians(15));
 * private static final double multiplier = 1.4;
 * private static int getWidth(int radius)  { return (int) (2 * RADIUS_MULTIPLIER * multiplier * radius); }
 * private static int getHeight(int radius) { return (int) (4 * RADIUS_MULTIPLIER * multiplier * radius); }
 * ```
 */
const RADIUS = 32;
const RADIUS_MULTIPLIER = Math.SQRT2 * Math.cos((15 * Math.PI) / 180);
const MULTIPLIER = 1.4;
const BLACK = '#000000';

export const SQUARE1_IMAGE_WIDTH = Math.trunc(2 * RADIUS_MULTIPLIER * MULTIPLIER * RADIUS);
export const SQUARE1_IMAGE_HEIGHT = Math.trunc(4 * RADIUS_MULTIPLIER * MULTIPLIER * RADIUS);

/**
 * 🔴 **Its own scheme again** — `U` yellow and `D` white, which is the reverse of
 * the cube net, and `R` green where the cube has red:
 *
 * ```java
 * defaultColorScheme.put("B", new Color(255, 128, 0)); // #ff8000 orange heraldic tincture
 * defaultColorScheme.put("D", Color.WHITE);            // #ffffff
 * defaultColorScheme.put("F", Color.RED);              // #ff0000
 * defaultColorScheme.put("L", Color.BLUE);             // #0000ff
 * defaultColorScheme.put("R", Color.GREEN);            // #00ff00
 * defaultColorScheme.put("U", Color.YELLOW);           // #ffff00
 * ```
 */
export const SQUARE1_DEFAULT_SCHEME: ColorScheme = {
  B: '#ff8000',
  D: '#ffffff',
  F: '#ff0000',
  L: '#0000ff',
  R: '#00ff00',
  U: '#ffff00',
};

/**
 * The four side faces, indexed by `piece % 4`.
 *
 * 🔴 **Not TNoodle's `"LBRFUD"` order**, and the difference is not cosmetic. This
 * package's ring frame is TNoodle's rotated a quarter turn: its cut plane runs
 * between slots `(2,3)` and `(8,9)` (`CUT_BOUNDARIES`), where TNoodle's runs between
 * its indices `(11,0)` and `(5,6)`. The cut plane's position **relative to the
 * colours** is a real, drawable fact — the middle bar draws the `F` face split at a
 * corner's width, which only means anything if the cut actually bisects `F` — so the
 * labels have to be turned back by that same quarter turn. `SIDES[m]` is therefore
 * TNoodle's `colorScheme[(m + 3) % 4]`.
 *
 * Getting this wrong is invisible on a solved puzzle and visible one slice later:
 * with the labels a quarter turn out, `/` exchanges the wrong half of the picture.
 */
const SIDES: readonly string[] = ['F', 'L', 'B', 'R'];
const FRONT = 'F';
const BACK = 'B';

/**
 * `getWedgePoly` — an edge piece: a 30° triangle on the layer's face, plus the
 * quadrilateral strip that is its side sticker.
 *
 * ```java
 * p.moveTo(0, 0); p.lineTo(radius, 0); p.lineTo(sqrt(3)*radius/2, radius/2); p.closePath();
 * side.moveTo(radius, 0); side.lineTo(multiplier*radius, 0);
 * side.lineTo(multiplier*tempx, multiplier*tempy); side.lineTo(tempx, tempy); side.closePath();
 * ```
 */
function wedgePolygons(): readonly (readonly [number, number])[][] {
  const tempx = (Math.sqrt(3) * RADIUS) / 2;
  const tempy = RADIUS / 2;
  return [
    [
      [0, 0],
      [RADIUS, 0],
      [tempx, tempy],
    ],
    [
      [RADIUS, 0],
      [MULTIPLIER * RADIUS, 0],
      [MULTIPLIER * tempx, MULTIPLIER * tempy],
      [tempx, tempy],
    ],
  ];
}

/**
 * `getCornerPoly` — a corner piece: a 60° quadrilateral on the face, plus **two**
 * side strips, because a corner shows two side colours.
 *
 * ```java
 * double tempx = radius*(1 + Math.cos(Math.toRadians(75))/Math.sqrt(2));
 * double tempy = radius*Math.sin(Math.toRadians(75))/Math.sqrt(2);
 * double tempX = radius / 2.0;
 * double tempY = Math.sqrt(3) * radius / 2.0;
 * ```
 */
function cornerPolygons(): readonly (readonly [number, number])[][] {
  const tempx = RADIUS * (1 + Math.cos((75 * Math.PI) / 180) / Math.SQRT2);
  const tempy = (RADIUS * Math.sin((75 * Math.PI) / 180)) / Math.SQRT2;
  const tempX = RADIUS / 2;
  const tempY = (Math.sqrt(3) * RADIUS) / 2;
  return [
    [
      [0, 0],
      [RADIUS, 0],
      [tempx, tempy],
      [tempX, tempY],
    ],
    [
      [RADIUS, 0],
      [MULTIPLIER * RADIUS, 0],
      [MULTIPLIER * tempx, MULTIPLIER * tempy],
      [tempx, tempy],
    ],
    [
      [MULTIPLIER * tempx, MULTIPLIER * tempy],
      [tempx, tempy],
      [tempX, tempY],
      [MULTIPLIER * tempX, MULTIPLIER * tempY],
    ],
  ];
}

/**
 * A piece's colours, in TNoodle's order: the layer face first, then the side
 * stickers counter-clockwise.
 *
 * ```java
 * Color top = up ? colorScheme[4] : colorScheme[5];   // U or D
 * // corner: a = colorScheme[(piece/2+3) % 4], b = colorScheme[piece/2]; swapped when !up
 * // wedge:  colorScheme[piece/2]
 * ```
 *
 * This package numbers pieces differently — `0..7` corners then `8..15` edges,
 * rather than TNoodle's interleaving — so the arithmetic is rewritten over this
 * model's own indices. The *structure* is identical: a corner shows its layer's
 * face plus two adjacent side faces, an edge shows its layer's face plus one.
 *
 * 🔴 The lower layer's `[top, b, a]` is **not** a colour correction — the two rings
 * share one angular frame, so a lower corner's stickers sit in the same order as an
 * upper one's. It is there because the lower layer is drawn **mirrored**, viewed from
 * underneath, so its ring is walked backwards ({@link drawSquare1Scramble}) and the
 * corner's two strips come out in the opposite order. Swapping without reversing —
 * or reversing without swapping — tears every face run into three pieces.
 */
function pieceColors(piece: number): readonly string[] {
  const corner = isCornerPiece(piece);
  const up = corner ? piece < 4 : piece < 12;
  const top = up ? 'U' : 'D';
  const index = piece % 4;

  if (!corner) return [top, SIDES[index]!];
  const a = SIDES[(index + 3) % 4]!;
  const b = SIDES[index]!;
  return up ? [top, a, b] : [top, b, a];
}

/**
 * The first slot of the ring that begins a piece rather than continuing one.
 *
 * 🔴 TNoodle's walk starts unconditionally at slot 0, and its corner test is
 * `if(ch < 11 && face[ch] == face[ch+1])` — so it assumes no corner spans the
 * boundary between the last slot and the first. In *TNoodle's* frame that holds for
 * every state it draws. In **this package's** frame it does not: the cut plane runs
 * between slots `(2,3)` and `(8,9)` (`CUT_BOUNDARIES`), so a perfectly legal,
 * twistable state can have a corner occupying slots 11 and 0.
 *
 * Starting at 0 there draws that corner **twice** — once as a whole piece at slot 0
 * and again at slot 11 — which adds three polygons and, worse, advances the
 * rotation by 120° for a 60° piece, sliding every piece after it. Measured: a real
 * seeded `sq1` scramble produced 47 polygons instead of 44.
 *
 * Finding the first real boundary and rotating the start to match fixes it for any
 * state and costs one pass over twelve slots. The picture is unchanged for a state
 * where slot 0 already starts a piece, which includes every solved one.
 */
function firstPieceBoundary(slots: readonly number[]): number {
  for (let slot = 0; slot < RING_SLOTS; slot += 1) {
    if (slots[(slot + RING_SLOTS - 1) % RING_SLOTS] !== slots[slot]) return slot;
  }
  // Twelve slots all holding one id is not a Square-1 state; a silent wrong picture
  // would be worse than saying so.
  throw new Error('draw-square1: a ring with no piece boundary is not a legal layer');
}

/**
 * One layer view: twelve unit slots walked in order, a corner consuming two of
 * them, the transform rotating 30° per unit as it goes.
 *
 * ```java
 * for(int ch = 0; ch < 12; ch++) {
 *     if(ch < 11 && face[ch] == face[ch+1]) { ch++; }
 *     drawPiece(...);                       // then transform.rotate(30 or 60 degrees, x, y)
 * }
 * ```
 *
 * TNoodle appends each piece's paths in **reverse** order (`for(ch = cls.length-1;
 * ch >= 0; ch--)`), so the side strips land under the face polygon; kept.
 *
 * The walk begins at {@link firstPieceBoundary} rather than at slot 0, with the
 * start angle advanced by 30° per skipped unit so the piece still lands where its
 * angle says it should.
 */
function drawLayer(
  slots: readonly number[],
  centre: readonly [number, number],
  startDegrees: number,
  scheme: ColorScheme,
  out: ImageShape[],
): void {
  const start = firstPieceBoundary(slots);
  let transform = rotate(
    translation(centre[0], centre[1]),
    ((startDegrees + 30 * start) * Math.PI) / 180,
  );

  for (let unit = 0; unit < RING_SLOTS; unit += 1) {
    const slot = (start + unit) % RING_SLOTS;
    const piece = slots[slot]!;
    if (slots[(slot + 1) % RING_SLOTS] === piece) unit += 1;

    const corner = isCornerPiece(piece);
    const polygons = corner ? cornerPolygons() : wedgePolygons();
    const colors = pieceColors(piece);

    for (let i = colors.length - 1; i >= 0; i -= 1) {
      out.push({
        kind: 'polygon',
        points: polygons[i]!.map(([x, y]) => apply(transform, x, y)),
        fill: colorFor(scheme, colors[i]!),
        stroke: BLACK,
        face: colors[i]!,
      });
    }

    transform = rotate(transform, ((corner ? 60 : 30) * Math.PI) / 180);
  }
}

/**
 * The middle layer: two rectangles flanking the centre.
 *
 * 🔴 The second one takes the **front** colour when the slice is solved and the
 * **back** colour when it is not — and that single bit is the one piece of Square-1
 * state a picture can silently drop. Dropping it makes two genuinely different
 * states draw identically. `Square1State.middleFlipped` is that bit, and it is
 * exactly `!sliceSolved`.
 *
 * ```java
 * double half_square_width = (radius * RADIUS_MULTIPLIER * multiplier) / Math.sqrt(2);
 * double edge_width = 2 * radius * multiplier * Math.sin(Math.toRadians(15));
 * double corner_width = half_square_width - edge_width / 2.;
 * ```
 *
 * TNoodle paints both filled, then both again stroked-and-unfilled — because the
 * left one "will clobber part of the other guy" — so four rectangles, in that order.
 */
function drawMiddle(state: Square1State, scheme: ColorScheme, out: ImageShape[]): void {
  const halfSquareWidth = (RADIUS * RADIUS_MULTIPLIER * MULTIPLIER) / Math.SQRT2;
  const edgeWidth = 2 * RADIUS * MULTIPLIER * Math.sin((15 * Math.PI) / 180);
  const cornerWidth = halfSquareWidth - edgeWidth / 2;
  const x = SQUARE1_IMAGE_WIDTH / 2 - halfSquareWidth;
  const y = SQUARE1_IMAGE_HEIGHT / 2 - (RADIUS * (MULTIPLIER - 1)) / 2;
  const h = RADIUS * (MULTIPLIER - 1);

  const sliceSolved = !state.middleFlipped;
  const rightWidth = sliceSolved ? 2 * cornerWidth + edgeWidth : cornerWidth + edgeWidth;
  const rightFace = sliceSolved ? FRONT : BACK;

  out.push({
    kind: 'rect',
    x,
    y,
    w: rightWidth,
    h,
    fill: colorFor(scheme, rightFace),
    stroke: 'none',
    face: rightFace,
  });
  out.push({
    kind: 'rect',
    x,
    y,
    w: cornerWidth,
    h,
    fill: colorFor(scheme, FRONT),
    stroke: 'none',
    face: FRONT,
  });
  out.push({ kind: 'rect', x, y, w: rightWidth, h, fill: 'none', stroke: BLACK });
  out.push({ kind: 'rect', x, y, w: cornerWidth, h, fill: 'none', stroke: BLACK });
}

/**
 * Where slot 0 of each ring lands on screen.
 *
 * 🔴 **Not TNoodle's `±(90 + 15)`**, for the same reason {@link SIDES} is not its
 * `"LBRFUD"`: this frame is a quarter turn from TNoodle's, so the whole picture turns
 * back by the same quarter turn. `+15°` puts the cut plane on the vertical, with the
 * half a `/` moves on the right — which is what the middle bar draws.
 *
 * The two together are one rotation, so on a *solved* puzzle either pair draws the
 * same upper layer. They come apart one slice later.
 */
const UPPER_START_DEGREES = 15;
const LOWER_START_DEGREES = -15;

export function drawSquare1Scramble(scramble: string, scheme: ColorScheme): ScrambleImage {
  const state = applySquare1Moves(SOLVED_SQUARE1_STATE, parseSquare1Scramble(scramble));
  const shapes: ImageShape[] = [];

  drawMiddle(state, scheme, shapes);

  const x = SQUARE1_IMAGE_WIDTH / 2;
  drawLayer(
    state.slots.slice(UPPER_RING, UPPER_RING + RING_SLOTS),
    [x, SQUARE1_IMAGE_HEIGHT / 4],
    UPPER_START_DEGREES,
    scheme,
    shapes,
  );
  // 🔴 **Reversed**, and that is the whole of the lower layer's geometry. The upper
  // view looks down at `U`; the lower one looks *up* at `D`, so it is the same
  // angular frame seen in a mirror — slot 11 where the upper view puts slot 0, and
  // angle running the other way. Drawing the ring forwards, as the upper one is,
  // scatters each face's three units around the picture: the solved layer still looks
  // like a plausible ring of colours, which is exactly why it survived.
  //
  // Reversing maps slot `i` to unit `11 - i`, which keeps a corner's two slots
  // adjacent, so `firstPieceBoundary` and the 30°-per-unit walk carry over unchanged.
  drawLayer(
    state.slots.slice(LOWER_RING, LOWER_RING + RING_SLOTS).reverse(),
    [x, (3 * SQUARE1_IMAGE_HEIGHT) / 4],
    LOWER_START_DEGREES,
    scheme,
    shapes,
  );

  return {
    event: 'sq1',
    width: SQUARE1_IMAGE_WIDTH,
    height: SQUARE1_IMAGE_HEIGHT,
    // `g.setStroke(2, 10, "round")`.
    strokeWidth: 2,
    shapes,
  };
}

export const SQUARE1_DRAWER: PuzzleDrawer = {
  draw: drawSquare1Scramble,
  defaultScheme: SQUARE1_DEFAULT_SCHEME,
};

export function registerSquare1Drawer(): void {
  registerDrawer('sq1', SQUARE1_DRAWER);
}

export { pieceColors, translate, type Transform2D };
