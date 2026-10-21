import { FTO_FACES, parseFtoScramble, type FtoFace } from '../puzzles/fto/notation';
import {
  CORNER_POSITIONS_FTO,
  deriveFaceletTurn,
  FACE_NORMALS,
  FACELETS_FTO,
} from '../puzzles/fto/geometry';
import { vecDot, type Vec3 } from '../utils/vec3';
import { colorFor } from './color';
import { registerDrawer, type PuzzleDrawer } from './registry';
import type { ColorScheme, ImageShape, ScrambleImage } from './types';

/**
 * Face Turning Octahedron — **this package's own picture, not TNoodle's.**
 *
 * Every other drawer here reproduces TNoodle's `drawScramble` to the unit. No
 * TNoodle release draws an FTO yet (2026-10-21), so there is nothing to
 * reproduce, and this drawing is provisional in the same sense as the notation:
 * if the official program gains one, this follows it (`fto_event_plan` task 10).
 *
 * ## The net
 *
 * Two squares, side by side — the layout FTO scramble images have long used,
 * and the one xyzzy's solver lays its facelets out in:
 *
 * - **left**, the four faces around the top vertex, seen from above: `U` at the
 *   top, `L` left, `R` right, `F` at the bottom;
 * - **right**, the four around the bottom vertex, seen from below after tipping
 *   the puzzle forward: `D` at the top, `BL` left, `BR` right, `B` at the bottom.
 *
 * Looking straight down a vertex, its four faces project to the four triangles
 * a square's diagonals cut it into, and each face's nine stickers to the nine
 * triangles of that triangle's 3×3 subdivision. Both views are from *outside*
 * the puzzle, so neither is mirrored: a clockwise turn turns clockwise on paper.
 *
 * ## Colours
 *
 * The **Lanlan** scheme, which xyzzy's solver names and most FTOs are sold in:
 * `U` white, `F` red, `BR` grey, `BL` orange, `L` purple, `R` green, `D` yellow,
 * `B` blue. Like every scheme here it is a default, merged under whatever a
 * caller passes.
 */

const SQUARE = 180;
const GAP = 10;
const STROKE = '#000000';

export const FTO_IMAGE_WIDTH = 2 * SQUARE + 3 * GAP;
export const FTO_IMAGE_HEIGHT = SQUARE + 2 * GAP;

export const FTO_DEFAULT_SCHEME: ColorScheme = {
  U: '#ffffff',
  F: '#ff0000',
  BR: '#808080',
  BL: '#ff8000',
  L: '#8000ff',
  R: '#00ff00',
  D: '#ffff00',
  B: '#0000ff',
};

/**
 * One half of the net: the vertex looked down on, the screen directions of
 * "up" and "right" in the puzzle's frame (both perpendicular to that vertex),
 * and where the square's centre sits on the image.
 */
interface HalfView {
  readonly vertex: Vec3;
  readonly up: Vec3;
  readonly right: Vec3;
  readonly cx: number;
  readonly cy: number;
}

/**
 * `right × up` must point *at the viewer*, i.e. along `vertex`, for the view to
 * be from outside rather than a mirror image — checked in `fto.test.ts`.
 */
const VIEWS: readonly HalfView[] = [
  { vertex: [0, 0, 1], up: [1, 1, 0], right: [1, -1, 0], cx: GAP + SQUARE / 2, cy: GAP + SQUARE / 2 },
  {
    vertex: [0, 0, -1],
    up: [-1, -1, 0],
    right: [1, -1, 0],
    cx: 2 * GAP + (3 * SQUARE) / 2,
    cy: GAP + SQUARE / 2,
  },
];

/** Exported for the test that checks both views are from outside. */
export const FTO_VIEWS: readonly HalfView[] = VIEWS;

/**
 * Where a point of the puzzle (scaled frame: vertices at `9v`) lands on the
 * image. Up and right are diagonals of the vertex's equator square, so an
 * equator vertex lands on a corner of the drawn square: half its side away
 * along both axes.
 */
function project(view: HalfView, point: Vec3): readonly [number, number] {
  const scale = SQUARE / 2 / 9;
  const x = vecDot(point, view.right) * scale;
  const y = vecDot(point, view.up) * scale;
  return [view.cx + x, view.cy - y];
}

/**
 * The three corners of the small triangle a sticker occupies: the three points
 * of its face's 3×3 grid nearest its centroid. A grid point is `3(k₁v₁ + k₂v₂ +
 * k₃v₃)` with `k₁ + k₂ + k₃ = 3`, so all ten are enumerated and the closest three
 * kept — a small triangle's centroid is nearer its own corners than any other
 * grid point.
 */
function stickerCorners(point: Vec3, vertices: readonly Vec3[]): Vec3[] {
  const grid: Vec3[] = [];
  for (let a = 0; a <= 3; a += 1) {
    for (let b = 0; a + b <= 3; b += 1) {
      const c = 3 - a - b;
      const [v1, v2, v3] = vertices as [Vec3, Vec3, Vec3];
      grid.push([
        3 * (a * v1[0] + b * v2[0] + c * v3[0]),
        3 * (a * v1[1] + b * v2[1] + c * v3[1]),
        3 * (a * v1[2] + b * v2[2] + c * v3[2]),
      ]);
    }
  }
  const dist2 = (q: Vec3): number =>
    (q[0] - point[0]) ** 2 + (q[1] - point[1]) ** 2 + (q[2] - point[2]) ** 2;
  return grid.sort((p, q) => dist2(p) - dist2(q)).slice(0, 3);
}

/** For each facelet, the view it is drawn in and its polygon on the image. Fixed; computed once. */
const FACELET_POLYGONS: readonly (readonly (readonly [number, number])[])[] = FACELETS_FTO.map(
  (facelet) => {
    const normal = FACE_NORMALS[facelet.face];
    const view = VIEWS.find((v) => vecDot(v.vertex, normal) > 0);
    if (!view) throw new Error(`draw-fto: ${facelet.face} is in neither half`);
    const vertices = CORNER_POSITIONS_FTO.filter((v) => vecDot(v, normal) > 0);
    return stickerCorners(facelet.point, vertices).map((p) => project(view, p));
  },
);

/** The clockwise sticker permutation per face, then the prime one as two of it. */
const FACELET_TURNS: ReadonlyMap<string, readonly number[]> = (() => {
  const turns = new Map<string, readonly number[]>();
  for (const face of FTO_FACES) {
    const once = deriveFaceletTurn(face);
    turns.set(`${face}1`, once);
    turns.set(
      `${face}2`,
      once.map((d) => once[d]!),
    );
  }
  return turns;
})();

/** Which face's colour each sticker shows after `scramble`, facelet by facelet. */
export function ftoFaceletColours(scramble: string): FtoFace[] {
  let colours: FtoFace[] = FACELETS_FTO.map((f) => f.face);
  for (const move of parseFtoScramble(scramble)) {
    const turn = FACELET_TURNS.get(`${move.face}${move.amount}`)!;
    const next = new Array<FtoFace>(colours.length);
    colours.forEach((c, i) => {
      next[turn[i]!] = c;
    });
    colours = next;
  }
  return colours;
}

export function drawFtoScramble(scramble: string, scheme: ColorScheme): ScrambleImage {
  const colours = ftoFaceletColours(scramble);
  const shapes: ImageShape[] = colours.map((face, i) => ({
    kind: 'polygon',
    points: FACELET_POLYGONS[i]!,
    fill: colorFor(scheme, face),
    stroke: STROKE,
    face,
  }));
  return {
    event: 'fto',
    width: FTO_IMAGE_WIDTH,
    height: FTO_IMAGE_HEIGHT,
    strokeWidth: 1,
    shapes,
  };
}

export const FTO_DRAWER: PuzzleDrawer = {
  draw: drawFtoScramble,
  defaultScheme: FTO_DEFAULT_SCHEME,
};

export function registerFtoDrawer(): void {
  registerDrawer('fto', FTO_DRAWER);
}
