import { parseMegaminxScramble } from '../puzzles/megaminx/notation';
import {
  cornerFaceCycle,
  cornerOnFace,
  edgeOnFace,
  edgeReferenceFace,
  facesAtEdge,
  positionKey,
  rotateFifths,
  CORNER_POSITIONS_MINX,
  EDGE_POSITIONS_MINX,
  FACE_CENTERS,
  L_FACE,
  U_FACE,
  type Vec3f,
} from '../puzzles/megaminx/geometry';
import {
  applyMegaminxMoves,
  SOLVED_MEGAMINX_STATE,
  type MegaminxState,
} from '../puzzles/megaminx/state';
import { colorFor } from './color';
import { registerDrawer, type PuzzleDrawer } from './registry';
import type { ColorScheme, ImageShape, ScrambleImage } from './types';

/**
 * Megaminx, from `MegaminxPuzzle.java` — the twelve-pentagon unfold, 132 regions.
 *
 * ```java
 * private static final int gap = 2;
 * private static final int minxRad = 30;
 * private static final double UNFOLDHEIGHT = 2 + 3 * Math.sin(.3 * Math.PI) + Math.sin(.1 * Math.PI);
 * private static final double UNFOLDWIDTH  = 4 * Math.cos(.1 * Math.PI) + 2 * Math.cos(.3 * Math.PI);
 * private static int getMegaminxViewWidth(int gap, int minxRad)  { return (int)(UNFOLDWIDTH * 2 * minxRad + 3 * gap); }
 * private static int getMegaminxViewHeight(int gap, int minxRad) { return (int)(UNFOLDHEIGHT * minxRad + 2 * gap); }
 * ```
 */
const GAP = 2;
const MINX_RAD = 30;
const UNFOLD_HEIGHT = 2 + 3 * Math.sin(0.3 * Math.PI) + Math.sin(0.1 * Math.PI);
const UNFOLD_WIDTH = 4 * Math.cos(0.1 * Math.PI) + 2 * Math.cos(0.3 * Math.PI);
const BLACK = '#000000';

export const MEGAMINX_IMAGE_WIDTH = Math.trunc(UNFOLD_WIDTH * 2 * MINX_RAD + 3 * GAP);
export const MEGAMINX_IMAGE_HEIGHT = Math.trunc(UNFOLD_HEIGHT * MINX_RAD + 2 * GAP);

/**
 * Twelve **authored** colours, verbatim — none of them a `java.awt` constant, all
 * twelve chosen by hand for a twelve-face puzzle where six primaries do not go far
 * enough.
 *
 * 🔴 The twelve **keys** are part of the public contract: a consumer overriding one
 * colour needs to know the name, and these names are not guessable from the cube's
 * six. `megaminx.test.ts` asserts the exact key set.
 */
export const MEGAMINX_DEFAULT_SCHEME: ColorScheme = {
  U: '#ffffff',
  BL: '#ffcc00',
  BR: '#0000b3',
  R: '#dd0000',
  F: '#006600',
  L: '#8a1aff',
  D: '#999999',
  DR: '#ffffb3',
  DBR: '#ff99ff',
  B: '#71e600',
  DBL: '#ff8433',
  DL: '#88ddff',
};

/** `private enum Face { U, BL, BR, R, F, L, D, DR, DBR, B, DBL, DL }` — ordinal order. */
export const MEGAMINX_FACE_NAMES: readonly string[] = [
  'U', 'BL', 'BR', 'R', 'F', 'L', 'D', 'DR', 'DBR', 'B', 'DBL', 'DL',
];

/** `Face.oppositeFace()`, verbatim — a dodecahedron's antipodal pairs under TNoodle's names. */
const OPPOSITE_FACE: Readonly<Record<string, string>> = {
  U: 'D', BL: 'DR', BR: 'DL', R: 'DBL', F: 'B', L: 'DBR',
  D: 'U', DR: 'BL', DBR: 'L', B: 'F', DBL: 'R', DL: 'BR',
};

/**
 * Which of the twelve face centres wears each of TNoodle's twelve names.
 *
 * This is the one thing the package's Megaminx model does not already fix.
 * `puzzles/megaminx/geometry.ts` names exactly two faces — `U_FACE` (centre 0) and
 * `L_FACE` (U's lowest-keyed neighbour, "any neighbour would do, since a rotation
 * of the solid carries any adjacent face pair to any other") — because a *solver*
 * needs an axis and an extent, not a colour.
 *
 * A *drawing* needs all twelve, so the naming is completed here, from three facts
 * and nothing else:
 *
 * 1. `U` is `U_FACE` and `L` is `L_FACE`, so the drawing's names agree with what
 *    the notation already means (`U` turns the U layer; `R` holds `L`).
 * 2. Around `U`, TNoodle's own `turn(U)` cycles its five neighbours in the order
 *    `BL → BR → R → F → L`, and their drawn positions put that order **clockwise
 *    seen from outside U**. So walking clockwise from `L` gives `BL BR R F`.
 *    Clockwise about a face is `rotateFifths(face, v, -1)` in this package's sign
 *    convention — the same convention that makes `U` a negative rotation about
 *    `U_FACE` in `puzzles/megaminx/state.ts`.
 * 3. The lower six are then forced: each is the antipode of an upper one, per
 *    `Face.oppositeFace()` above.
 *
 * Any other choice of which neighbour is `L` yields the same physical picture with
 * the colours rotated — which is precisely why step 1 anchors it to the notation
 * rather than to taste.
 */
const FACE_BY_NAME: Readonly<Record<string, Vec3f>> = (() => {
  const byName: Record<string, Vec3f> = { U: U_FACE, L: L_FACE };
  const clockwiseFromL = ['BL', 'BR', 'R', 'F'];
  let current: Vec3f = L_FACE;
  for (const name of clockwiseFromL) {
    current = snapToFaceCentre(rotateFifths(U_FACE, current, -1));
    byName[name] = current;
  }
  for (const name of ['U', 'BL', 'BR', 'R', 'F', 'L']) {
    byName[OPPOSITE_FACE[name]!] = negate(byName[name]!);
  }
  return byName;
})();

const NAME_BY_FACE_KEY: ReadonlyMap<string, string> = new Map(
  Object.entries(FACE_BY_NAME).map(([name, face]) => [positionKey(face), name]),
);

function negate(v: Vec3f): Vec3f {
  return [-v[0], -v[1], -v[2]];
}

/**
 * Rounds a rotated vector back onto the exact face-centre vector it landed on.
 *
 * `rotateFifths` works in floating point (a dodecahedron has no integer lattice —
 * φ is irrational), so the result is the *right* face to within 1e-9 but is not
 * bit-identical to the array entry. Snapping keeps `positionKey` usable as an
 * identity, which is what every lookup here relies on.
 */
function snapToFaceCentre(v: Vec3f): Vec3f {
  let best: Vec3f | undefined;
  let bestDistance = Infinity;
  for (const face of FACE_CENTERS) {
    const d =
      (face[0] - v[0]) ** 2 + (face[1] - v[1]) ** 2 + (face[2] - v[2]) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = face;
    }
  }
  if (!best) throw new Error('draw-megaminx: no face centres to snap to');
  return best;
}

function faceNameOf(face: Vec3f): string {
  const name = NAME_BY_FACE_KEY.get(positionKey(face));
  if (!name) throw new Error(`draw-megaminx: [${face.join(',')}] is not a named face`);
  return name;
}

/**
 * Each face's five neighbours in **slot order**, read straight off TNoodle's
 * `turn()` table.
 *
 * `turn(image, face)` calls `swapOnSide(image, b, f1, s1, …, f5, s5)`, which moves
 * three consecutive stickers `(s + i) % 10` on each of the five faces bordering
 * `face`. Collecting, for every face `F`, which neighbour's turn touches which run
 * of `F`'s ten outer slots gives the table below — so slots `2k, 2k+1, 2k+2` are
 * the run `F` shares with neighbour `k`, and the whole ring runs **clockwise seen
 * from outside `F`** (checked on `U`, whose ring is `BL BR R F L`, and on `F`,
 * whose ring is `L U R DR DL`).
 *
 * That fixes the *rotational phase* of every pentagon's sticker ring, which is the
 * one thing a picture can get plausibly and invisibly wrong.
 */
const NEIGHBOUR_RING: Readonly<Record<string, readonly string[]>> = {
  U: ['BL', 'BR', 'R', 'F', 'L'],
  BL: ['DBL', 'B', 'BR', 'U', 'L'],
  BR: ['BL', 'B', 'DBR', 'R', 'U'],
  R: ['U', 'BR', 'DBR', 'DR', 'F'],
  F: ['L', 'U', 'R', 'DR', 'DL'],
  L: ['DBL', 'BL', 'U', 'F', 'DL'],
  D: ['DR', 'DBR', 'B', 'DBL', 'DL'],
  DR: ['F', 'R', 'DBR', 'D', 'DL'],
  DBR: ['DR', 'R', 'BR', 'B', 'D'],
  B: ['D', 'DBR', 'BR', 'BL', 'DBL'],
  DBL: ['DL', 'D', 'B', 'BL', 'L'],
  DL: ['F', 'DR', 'D', 'DBL', 'L'],
};

/**
 * `pentagon(pointup, minxRad)` — five vertices at `{1.3, 1.7, .1, .5, .9}π`, each
 * shifted by `-.2π` when the pentagon points up. Increasing index runs clockwise on
 * screen (y grows downward), which for an unfolded net is clockwise seen from
 * outside the face — the same direction as {@link NEIGHBOUR_RING}.
 */
function pentagonVertices(cx: number, cy: number, pointUp: boolean): readonly [number, number][] {
  return [1.3, 1.7, 0.1, 0.5, 0.9].map((turns) => {
    const angle = (turns - (pointUp ? 0.2 : 0)) * Math.PI;
    return [cx + MINX_RAD * Math.cos(angle), cy + MINX_RAD * Math.sin(angle)] as [number, number];
  }) as readonly [number, number][];
}

/** `getFaceBoundaries()`'s layout arithmetic, verbatim. */
const LAYOUT = (() => {
  const x = MINX_RAD * Math.sqrt(2 * (1 - Math.cos(0.6 * Math.PI)));
  const a = MINX_RAD * Math.cos(0.1 * Math.PI);
  const b = x * Math.cos(0.1 * Math.PI);
  const c = x * Math.cos(0.3 * Math.PI);
  const d = x * Math.sin(0.1 * Math.PI);
  const e = x * Math.sin(0.3 * Math.PI);
  const leftCenterX = GAP + a + b + d / 2;
  const leftCenterY = GAP + x + MINX_RAD - d;
  const f = Math.cos(0.1 * Math.PI);
  const gg = Math.cos(0.2 * Math.PI);
  const magicShiftNumber = d * 0.6 + MINX_RAD * (f + gg);
  const shift = leftCenterX + magicShiftNumber;
  return { x, a, b, c, d, e, leftCenterX, leftCenterY, shift };
})();

interface FacePlacement {
  readonly cx: number;
  readonly cy: number;
  readonly pointUp: boolean;
}

/**
 * Two half-nets: `U BL BR R F L` around the left centre, `D DR DBR B DBL DL` offset
 * by `magicShiftNumber`.
 *
 * ```java
 * faces.put(Face.U,   getPentagon(leftCenterX  , leftCenterY  , true , minxRad));
 * faces.put(Face.BL,  getPentagon(leftCenterX-c, leftCenterY-e, false, minxRad));
 * faces.put(Face.BR,  getPentagon(leftCenterX+c, leftCenterY-e, false, minxRad));
 * faces.put(Face.R,   getPentagon(leftCenterX+b, leftCenterY+d, false, minxRad));
 * faces.put(Face.F,   getPentagon(leftCenterX  , leftCenterY+x, false, minxRad));
 * faces.put(Face.L,   getPentagon(leftCenterX-b, leftCenterY+d, false, minxRad));
 * faces.put(Face.D,   getPentagon(shift+gap+a+b  , gap+x+minxRad  , false, minxRad));
 * faces.put(Face.DR,  getPentagon(shift+gap+a+b-c, gap+x+e+minxRad, true , minxRad));
 * faces.put(Face.DBR, getPentagon(shift+gap+a    , gap+x-d+minxRad, true , minxRad));
 * faces.put(Face.B,   getPentagon(shift+gap+a+b  , gap+minxRad    , true , minxRad));
 * faces.put(Face.DBL, getPentagon(shift+gap+a+2*b, gap+x-d+minxRad, true , minxRad));
 * faces.put(Face.DL,  getPentagon(shift+gap+a+b+c, gap+x+e+minxRad, true , minxRad));
 * ```
 */
const PLACEMENTS: Readonly<Record<string, FacePlacement>> = (() => {
  const { x, a, b, c, d, e, leftCenterX, leftCenterY, shift } = LAYOUT;
  return {
    U: { cx: leftCenterX, cy: leftCenterY, pointUp: true },
    BL: { cx: leftCenterX - c, cy: leftCenterY - e, pointUp: false },
    BR: { cx: leftCenterX + c, cy: leftCenterY - e, pointUp: false },
    R: { cx: leftCenterX + b, cy: leftCenterY + d, pointUp: false },
    F: { cx: leftCenterX, cy: leftCenterY + x, pointUp: false },
    L: { cx: leftCenterX - b, cy: leftCenterY + d, pointUp: false },
    D: { cx: shift + GAP + a + b, cy: GAP + x + MINX_RAD, pointUp: false },
    DR: { cx: shift + GAP + a + b - c, cy: GAP + x + e + MINX_RAD, pointUp: true },
    DBR: { cx: shift + GAP + a, cy: GAP + x - d + MINX_RAD, pointUp: true },
    B: { cx: shift + GAP + a + b, cy: GAP + MINX_RAD, pointUp: true },
    DBL: { cx: shift + GAP + a + 2 * b, cy: GAP + x - d + MINX_RAD, pointUp: true },
    DL: { cx: shift + GAP + a + b + c, cy: GAP + x + e + MINX_RAD, pointUp: true },
  };
})();

/**
 * `drawMinx`'s per-face display rotation: `0` for `U`, `1` for ordinals 1–5, `2` for
 * ordinals 6–11, applied as `j = (j + 2*rotateCounterClockwise) % 10` so drawn
 * region `i` wears state slot `(i + 2*rcc) % 10`.
 */
function rotateCounterClockwise(faceIndex: number): number {
  if (faceIndex === 0) return 0;
  return faceIndex <= 5 ? 1 : 2;
}

/** `getLineIntersection` / `det`, verbatim. */
function lineIntersection(
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  p4: readonly [number, number],
): [number, number] {
  const det = (a: number, b: number, c: number, d: number): number => a * d - b * c;
  const d12 = det(p1[0], p1[1], p2[0], p2[1]);
  const d34 = det(p3[0], p3[1], p4[0], p4[1]);
  const denominator = det(p1[0] - p2[0], p1[1] - p2[1], p3[0] - p4[0], p3[1] - p4[1]);
  return [
    det(d12, p1[0] - p2[0], d34, p3[0] - p4[0]) / denominator,
    det(d12, p1[1] - p2[1], d34, p3[1] - p4[1]) / denominator,
  ];
}

/**
 * `drawPentagon`'s eleven regions: `ps[2i]` a kite at pentagon vertex `i`,
 * `ps[2i+1]` a strip along the edge `i → i+1`, and `ps[10]` the inner pentagon.
 *
 * ```java
 * xs[i]   = .4*xpoints[(i+1)%5] + .6*xpoints[i];
 * xs[i+5] = .6*xpoints[(i+1)%5] + .4*xpoints[i];
 * intpent[i] = getLineIntersection(xs[i], ys[i], xs[5+(3+i)%5], ys[5+(3+i)%5],
 *                                  xs[(i+1)%5], ys[(i+1)%5], xs[5+(4+i)%5], ys[5+(4+i)%5]);
 * ps[2*i]   : xpoints[i] → xs[i] → intpent[i] → xs[5+(4+i)%5]
 * ps[2*i+1] : xs[i] → xs[i+5] → intpent[(i+1)%5] → intpent[i]
 * ps[10]    : intpent[0..4]
 * ```
 */
function regionPolygons(
  placement: FacePlacement,
): readonly (readonly (readonly [number, number])[])[] {
  const p = pentagonVertices(placement.cx, placement.cy, placement.pointUp);
  const xs: [number, number][] = new Array(10);
  for (let i = 0; i < 5; i += 1) {
    const from = p[i]!;
    const to = p[(i + 1) % 5]!;
    xs[i] = [0.6 * from[0] + 0.4 * to[0], 0.6 * from[1] + 0.4 * to[1]];
    xs[i + 5] = [0.4 * from[0] + 0.6 * to[0], 0.4 * from[1] + 0.6 * to[1]];
  }
  const intpent: [number, number][] = new Array(5);
  for (let i = 0; i < 5; i += 1) {
    intpent[i] = lineIntersection(
      xs[i]!,
      xs[5 + ((3 + i) % 5)]!,
      xs[(i + 1) % 5]!,
      xs[5 + ((4 + i) % 5)]!,
    );
  }

  const polygons: (readonly [number, number])[][] = new Array(11);
  for (let i = 0; i < 5; i += 1) {
    polygons[2 * i] = [p[i]!, xs[i]!, intpent[i]!, xs[5 + ((4 + i) % 5)]!];
    polygons[2 * i + 1] = [xs[i]!, xs[i + 5]!, intpent[(i + 1) % 5]!, intpent[i]!];
  }
  polygons[10] = [...intpent];
  return polygons;
}

/**
 * What each of a face's eleven state slots physically is.
 *
 * Slots `2k, 2k+1, 2k+2` are the run shared with neighbour `k`, so slot `2k+1` is
 * the **edge** on both this face and neighbour `k`, and slot `2k` is the **corner**
 * on this face and on neighbours `k-1` and `k`. Slot 10 is the centre.
 */
type MinxRegion =
  | { readonly kind: 'corner'; readonly index: number }
  | { readonly kind: 'edge'; readonly index: number }
  | { readonly kind: 'centre'; readonly index: number };

function slotRegions(name: string): readonly MinxRegion[] {
  const face = FACE_BY_NAME[name]!;
  const ring = NEIGHBOUR_RING[name]!.map((n) => FACE_BY_NAME[n]!);
  const regions: MinxRegion[] = new Array(11);

  for (let k = 0; k < 5; k += 1) {
    const neighbour = ring[k]!;
    const previous = ring[(k + 4) % 5]!;

    const edgeIndex = EDGE_POSITIONS_MINX.findIndex(
      (edge) => edgeOnFace(face, edge) && edgeOnFace(neighbour, edge),
    );
    if (edgeIndex === -1) {
      throw new Error(`draw-megaminx: ${name} shares no edge with neighbour ${k}`);
    }
    regions[2 * k + 1] = { kind: 'edge', index: edgeIndex };

    const cornerIndex = CORNER_POSITIONS_MINX.findIndex(
      (corner) =>
        cornerOnFace(face, corner) &&
        cornerOnFace(previous, corner) &&
        cornerOnFace(neighbour, corner),
    );
    if (cornerIndex === -1) {
      throw new Error(`draw-megaminx: ${name} has no corner between neighbours ${k - 1} and ${k}`);
    }
    regions[2 * k] = { kind: 'corner', index: cornerIndex };
  }

  const centreIndex = FACE_CENTERS.findIndex((c) => positionKey(c) === positionKey(face));
  regions[10] = { kind: 'centre', index: centreIndex };
  return regions;
}

const SLOT_REGIONS: Readonly<Record<string, readonly MinxRegion[]>> = Object.fromEntries(
  MEGAMINX_FACE_NAMES.map((name) => [name, slotRegions(name)]),
);

/** A corner sticker: orientation `o` at slot `s` puts the piece's sticker `k` on `cycle[s][(k+o)%3]`. */
function cornerStickerFace(state: MegaminxState, slot: number, face: Vec3f): string {
  const slotCycle = cornerFaceCycle(CORNER_POSITIONS_MINX[slot]!);
  const k = slotCycle.findIndex((f) => positionKey(f) === positionKey(face));
  if (k === -1) throw new Error(`draw-megaminx: corner ${slot} has no sticker on that face`);
  const piece = state.cornerPermutation[slot]!;
  const twist = state.cornerOrientation[slot]!;
  const pieceCycle = cornerFaceCycle(CORNER_POSITIONS_MINX[piece]!);
  return faceNameOf(pieceCycle[(k - twist + 3) % 3]!);
}

/** An edge sticker: flip 0 puts the piece's reference sticker on the slot's reference face. */
function edgeStickerFace(state: MegaminxState, slot: number, face: Vec3f): string {
  const slotPosition = EDGE_POSITIONS_MINX[slot]!;
  const onReference =
    positionKey(edgeReferenceFace(slotPosition)) === positionKey(face);
  const piece = state.edgePermutation[slot]!;
  const flipped = state.edgeOrientation[slot]! === 1;

  const piecePosition = EDGE_POSITIONS_MINX[piece]!;
  const pieceReference = edgeReferenceFace(piecePosition);
  const [pf1, pf2] = facesAtEdge(piecePosition);
  const pieceOther =
    positionKey(pieceReference) === positionKey(pf1!) ? pf2! : pf1!;

  return faceNameOf(onReference !== flipped ? pieceReference : pieceOther);
}

export function drawMegaminxScramble(scramble: string, scheme: ColorScheme): ScrambleImage {
  const state = applyMegaminxMoves(SOLVED_MEGAMINX_STATE, parseMegaminxScramble(scramble));
  const shapes: ImageShape[] = [];

  MEGAMINX_FACE_NAMES.forEach((name, faceIndex) => {
    const face = FACE_BY_NAME[name]!;
    const polygons = regionPolygons(PLACEMENTS[name]!);
    const regions = SLOT_REGIONS[name]!;
    const rcc = rotateCounterClockwise(faceIndex);

    for (let drawn = 0; drawn < 11; drawn += 1) {
      const slot = drawn < 10 ? (drawn + 2 * rcc) % 10 : 10;
      const region = regions[slot]!;
      let showing: string;
      switch (region.kind) {
        case 'corner':
          showing = cornerStickerFace(state, region.index, face);
          break;
        case 'edge':
          showing = edgeStickerFace(state, region.index, face);
          break;
        case 'centre':
          showing = faceNameOf(FACE_CENTERS[state.centerPermutation[region.index]!]!);
          break;
      }
      shapes.push({
        kind: 'polygon',
        points: polygons[drawn]!,
        fill: colorFor(scheme, showing),
        stroke: BLACK,
        face: showing,
      });
    }
  });

  return {
    event: 'minx',
    width: MEGAMINX_IMAGE_WIDTH,
    height: MEGAMINX_IMAGE_HEIGHT,
    strokeWidth: 1,
    shapes,
  };
}

export const MEGAMINX_DRAWER: PuzzleDrawer = {
  draw: drawMegaminxScramble,
  defaultScheme: MEGAMINX_DEFAULT_SCHEME,
};

export function registerMegaminxDrawer(): void {
  registerDrawer('minx', MEGAMINX_DRAWER);
}

export { FACE_BY_NAME, NEIGHBOUR_RING, OPPOSITE_FACE };
