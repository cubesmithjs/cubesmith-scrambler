import { parseClockScramble, type ClockToken } from '../puzzles/clock/notation';
import { applyClockTokens, SOLVED_CLOCK_STATE, type ClockState } from '../puzzles/clock/state';
import { colorFor } from './color';
import { registerDrawer, type PuzzleDrawer } from './registry';
import { apply, rotate, translate, translation, type Transform2D } from './transform';
import type { ColorScheme, ImageShape, ScrambleImage } from './types';

/**
 * Rubik's Clock, drawn from `ClockPuzzle.java`.
 *
 * Both sides, side by side, each a 3x3 grid of dials over a round panel — which is
 * why this is the event task 03 proved the contract on. It needs `circle` and
 * `path` and no polygons at all, its state model needs nothing derived
 * (`front[9]`/`back[9]` are already dial readings), and its picture is the least
 * like the other sixteen: a contract that fits the Clock fits the rest.
 *
 * Constants, verbatim:
 *
 * ```java
 * private static final int STROKE_WIDTH = 2;
 * private static final int FACE_STROKE_WIDTH = 1;
 * private static final int radius = 70;
 * private static final int clockRadius = 14;
 * private static final int clockOuterRadius = 21;
 * private static final int pointRadius = (clockRadius + clockOuterRadius) / 2;
 * private static final int tickMarkRadius = 1;
 * private static final int topTickMarkRadius = 2;
 * private static final int arrowHeight = 10;
 * private static final int arrowRadius = 2;
 * private static final int pinRadius = 4;
 * private static final int gap = 5;
 * ```
 */
const STROKE_WIDTH = 2;
const FACE_STROKE_WIDTH = 1;
const RADIUS = 70;
const CLOCK_RADIUS = 14;
const CLOCK_OUTER_RADIUS = 21;
/** Integer division in Java: `(14 + 21) / 2` is 17, not 17.5. */
const POINT_RADIUS = Math.floor((CLOCK_RADIUS + CLOCK_OUTER_RADIUS) / 2);
const TICK_MARK_RADIUS = 1;
const TOP_TICK_MARK_RADIUS = 2;
const ARROW_HEIGHT = 10;
const ARROW_RADIUS = 2;
const PIN_RADIUS = 4;
const GAP = 5;
const ARROW_ANGLE = Math.PI / 2 - Math.acos(ARROW_RADIUS / ARROW_HEIGHT);

const BLACK = '#000000';

/** `getPreferredSize()` — `new Dimension(4*(radius+gap), 2*(radius+gap))`. */
export const CLOCK_IMAGE_WIDTH = 4 * (RADIUS + GAP);
export const CLOCK_IMAGE_HEIGHT = 2 * (RADIUS + GAP);

/**
 * Twelve keys, not six faces — and every one of them is part of the public
 * contract, because a consumer overriding a colour needs the key.
 *
 * ```java
 * Color bright = new Color(0xccddee);
 * Color dark = new Color(0x113366);
 * ```
 */
export const CLOCK_DEFAULT_SCHEME: ColorScheme = {
  Front: '#113366',
  FrontClock: '#ccddee',
  FrontTopClock: '#ffcc44',
  FrontHand: '#113366',
  FrontHandBorder: '#113366',
  FrontPin: '#88aacc',
  Back: '#ccddee',
  BackClock: '#113366',
  BackTopClock: '#cc6600',
  BackHand: '#ccddee',
  BackHandBorder: '#ccddee',
  BackPin: '#446699',
};

/**
 * Whether the puzzle ended the scramble the way it started it.
 *
 * TNoodle carries a `rightSideUp` flag on its state and swaps its two nine-dial
 * halves on each `y2`; this package's `ClockState` normalises instead, always
 * reporting `front` and `back` in the front's own frame. Both are complete
 * descriptions, but they do not draw the same picture: TNoodle's **left panel is
 * whichever side is facing the solver when the scramble ends**, and an official
 * Clock scramble contains exactly one `y2`, so the left panel is the *back*.
 *
 * Counting the flips is how that frame is recovered — it is the one bit of
 * TNoodle's state model this package's does not keep, and dropping it would draw
 * the two sides swapped on every real scramble.
 */
function endsRightSideUp(tokens: readonly ClockToken[]): boolean {
  return tokens.filter((token) => token.kind === 'flip').length % 2 === 0;
}

interface Panel {
  /** The nine dial readings shown on this panel, row-major in its own frame. */
  readonly dials: readonly number[];
  /** `'Front'` or `'Back'` — the colour-scheme prefix. */
  readonly prefix: 'Front' | 'Back';
  readonly centre: Transform2D;
}

/**
 * The two panels, left then right.
 *
 * `Transform.getTranslateInstance((s*2+1)*(radius + gap), radius + gap)` — so the
 * left panel centres at `(75, 75)` and the right at `(225, 75)`.
 */
function panels(state: ClockState, rightSideUp: boolean): readonly [Panel, Panel] {
  const near = rightSideUp ? state.front : state.back;
  const far = rightSideUp ? state.back : state.front;
  const nearPrefix = rightSideUp ? 'Front' : 'Back';
  const farPrefix = rightSideUp ? 'Back' : 'Front';
  return [
    { dials: near, prefix: nearPrefix, centre: translation(RADIUS + GAP, RADIUS + GAP) },
    { dials: far, prefix: farPrefix, centre: translation(3 * (RADIUS + GAP), RADIUS + GAP) },
  ];
}

/** `drawBackground` — the four corner discs, the panel disc, then the discs again inside the border. */
function drawBackground(panel: Panel, scheme: ColorScheme, out: ImageShape[]): void {
  const panelColor = colorFor(scheme, panel.prefix);
  const offsets = [-2 * CLOCK_OUTER_RADIUS, 2 * CLOCK_OUTER_RADIUS];

  for (const cx of offsets) {
    for (const cy of offsets) {
      const [x, y] = apply(panel.centre, cx, cy);
      out.push({ kind: 'circle', cx: x, cy: y, r: CLOCK_OUTER_RADIUS, fill: 'none', stroke: BLACK });
    }
  }

  const [px, py] = apply(panel.centre, 0, 0);
  out.push({ kind: 'circle', cx: px, cy: py, r: RADIUS, fill: panelColor, stroke: BLACK });

  // Redrawn filled and unstroked, slightly smaller: TNoodle's own comment says
  // "We don't want to clobber part of our nice thick outer border."
  const innerRadius = CLOCK_OUTER_RADIUS - STROKE_WIDTH / 2;
  for (const cx of offsets) {
    for (const cy of offsets) {
      const [x, y] = apply(panel.centre, cx, cy);
      out.push({ kind: 'circle', cx: x, cy: y, r: innerRadius, fill: panelColor, stroke: 'none' });
    }
  }

  // Nine dial faces, each with twelve tick marks; the one at twelve o'clock is
  // bigger and takes the `Top` colour, which is how a reader tells which way up a
  // dial is.
  for (let i = -1; i <= 1; i += 1) {
    for (let j = -1; j <= 1; j += 1) {
      const dial = translate(
        panel.centre,
        2 * i * CLOCK_OUTER_RADIUS,
        2 * j * CLOCK_OUTER_RADIUS,
      );
      const [fx, fy] = apply(dial, 0, 0);
      out.push({
        kind: 'circle',
        cx: fx,
        cy: fy,
        r: CLOCK_RADIUS,
        fill: colorFor(scheme, `${panel.prefix}Clock`),
        stroke: BLACK,
        strokeWidth: FACE_STROKE_WIDTH,
        face: `${panel.prefix}Clock`,
      });
      for (let k = 0; k < 12; k += 1) {
        const [tx, ty] = apply(rotate(dial, (Math.PI / 6) * k), 0, -POINT_RADIUS);
        const key = `${panel.prefix}${k === 0 ? 'Top' : ''}Clock`;
        out.push({
          kind: 'circle',
          cx: tx,
          cy: ty,
          r: k === 0 ? TOP_TICK_MARK_RADIUS : TICK_MARK_RADIUS,
          fill: colorFor(scheme, key),
          stroke: 'none',
          face: key,
        });
      }
    }
  }
}

/**
 * `drawClock` — one hand, as a four-point arrow plus a disc at its base, rotated
 * `position*30` degrees.
 *
 * TNoodle draws each of them twice: once stroked in `…HandBorder` with no fill,
 * then again filled in `…Hand` with no stroke. Both are kept, in that order,
 * because the border is what makes a hand visible against a dial of nearly its own
 * colour.
 */
function drawHand(
  slot: number,
  position: number,
  prefix: 'Front' | 'Back',
  panelCentre: Transform2D,
  scheme: ColorScheme,
  out: ImageShape[],
): void {
  const dial = translate(
    panelCentre,
    2 * ((slot % 3) - 1) * CLOCK_OUTER_RADIUS,
    2 * (Math.floor(slot / 3) - 1) * CLOCK_OUTER_RADIUS,
  );
  const t = rotate(dial, (Math.PI / 6) * position);

  const tip = ARROW_RADIUS * Math.cos(ARROW_ANGLE);
  const shoulder = -ARROW_RADIUS * Math.sin(ARROW_ANGLE);
  const points: readonly (readonly [number, number])[] = [
    apply(t, 0, 0),
    apply(t, tip, shoulder),
    apply(t, 0, -ARROW_HEIGHT),
    apply(t, -tip, shoulder),
  ];
  const [bx, by] = apply(t, 0, 0);

  const border = colorFor(scheme, `${prefix}HandBorder`);
  const hand = colorFor(scheme, `${prefix}Hand`);
  out.push({ kind: 'polygon', points, fill: 'none', stroke: border });
  out.push({ kind: 'circle', cx: bx, cy: by, r: ARROW_RADIUS, fill: 'none', stroke: border });
  out.push({ kind: 'polygon', points, fill: hand, stroke: 'none' });
  out.push({ kind: 'circle', cx: bx, cy: by, r: ARROW_RADIUS, fill: hand, stroke: 'none' });
}

/**
 * `drawPins` — four discs per panel, all one colour.
 *
 * 🔴 The pins are **decoration, not state**, and that is TNoodle's choice rather
 * than an omission here: its `ClockState` is eighteen dial readings and carries no
 * pin positions at all, so each panel's four pins take a single colour that says
 * which side you are looking at, not which pins are up. This package *does* model
 * `pinsUp`, and the drawing deliberately ignores it — drawing it would be a
 * picture no official sheet shows.
 */
function drawPins(rightSideUp: boolean, scheme: ColorScheme, out: ImageShape[]): void {
  const panelOffsets: readonly [number, string][] = [
    [RADIUS + GAP, rightSideUp ? 'BackPin' : 'FrontPin'],
    [3 * (RADIUS + GAP), rightSideUp ? 'FrontPin' : 'BackPin'],
  ];
  for (const [centreX, key] of panelOffsets) {
    for (let i = -1; i <= 1; i += 2) {
      for (let j = -1; j <= 1; j += 2) {
        out.push({
          kind: 'circle',
          cx: centreX + j * CLOCK_OUTER_RADIUS,
          cy: RADIUS + GAP + i * CLOCK_OUTER_RADIUS,
          r: PIN_RADIUS,
          fill: colorFor(scheme, key),
          stroke: 'none',
          face: key,
        });
      }
    }
  }
}

export function drawClockScramble(scramble: string, scheme: ColorScheme): ScrambleImage {
  const tokens = parseClockScramble(scramble);
  const state = applyClockTokens(SOLVED_CLOCK_STATE, tokens);
  const rightSideUp = endsRightSideUp(tokens);
  const [left, right] = panels(state, rightSideUp);

  const shapes: ImageShape[] = [];
  drawBackground(left, scheme, shapes);
  drawBackground(right, scheme, shapes);
  for (const panel of [left, right]) {
    for (let slot = 0; slot < 9; slot += 1) {
      drawHand(slot, panel.dials[slot]!, panel.prefix, panel.centre, scheme, shapes);
    }
  }
  drawPins(rightSideUp, scheme, shapes);

  return {
    event: 'clock',
    width: CLOCK_IMAGE_WIDTH,
    height: CLOCK_IMAGE_HEIGHT,
    // `svg.setStroke(STROKE_WIDTH, 10, "round")` — the Clock is the one puzzle
    // that sets a document-level stroke width other than 1.
    strokeWidth: STROKE_WIDTH,
    shapes,
  };
}

export const CLOCK_DRAWER: PuzzleDrawer = {
  draw: drawClockScramble,
  defaultScheme: CLOCK_DEFAULT_SCHEME,
};

export function registerClockDrawer(): void {
  registerDrawer('clock', CLOCK_DRAWER);
}
