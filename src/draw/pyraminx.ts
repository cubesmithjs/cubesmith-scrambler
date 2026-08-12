import { parsePyraminxScramble, PYRAMINX_VERTICES, type PyraminxVertex } from '../puzzles/pyraminx/notation';
import {
  EDGE_POSITIONS,
  EDGE_VERTEX_PAIRS,
  VERTEX_POSITIONS,
  rotate120,
} from '../puzzles/pyraminx/geometry';
import {
  applyPyraminxMoves,
  SOLVED_PYRAMINX_STATE,
  vertexIndex,
  type PyraminxState,
} from '../puzzles/pyraminx/state';
import { vecEquals, vecLess, vecNegate, type Vec3 } from '../utils/vec3';
import { colorFor } from './color';
import { registerDrawer, type PuzzleDrawer } from './registry';
import type { ColorScheme, ImageShape, ScrambleImage } from './types';

/**
 * Pyraminx, from `PyraminxPuzzle.java`.
 *
 * ```java
 * private static final int pieceSize = 30;
 * private static final int gap = 5;
 * private static int getPyraminxViewWidth(int gap, int pieceSize)  { return (2 * 3 * pieceSize + 4 * gap); }
 * private static int getPyraminxViewHeight(int gap, int pieceSize) { return (int)(2 * 1.5 * Math.sqrt(3) * pieceSize + 3 * gap); }
 * ```
 */
const PIECE_SIZE = 30;
const GAP = 5;
/** `int rad = (int)(Math.sqrt(3) * pieceSize)` — a Java **int** cast, so 51, not 51.96. */
const RAD = Math.trunc(Math.sqrt(3) * PIECE_SIZE);
const BLACK = '#000000';

/**
 * Four faces, four authored colours:
 *
 * ```java
 * defaultColorScheme.put("F", new Color(0x00FF00));
 * defaultColorScheme.put("D", new Color(0xFFFF00));
 * defaultColorScheme.put("L", new Color(0xFF0000));
 * defaultColorScheme.put("R", new Color(0x0000FF));
 * ```
 */
export const PYRAMINX_DEFAULT_SCHEME: ColorScheme = {
  F: '#00ff00',
  D: '#ffff00',
  L: '#ff0000',
  R: '#0000ff',
};

export const PYRAMINX_IMAGE_WIDTH = 2 * 3 * PIECE_SIZE + 4 * GAP;
export const PYRAMINX_IMAGE_HEIGHT = Math.trunc(2 * 1.5 * Math.sqrt(3) * PIECE_SIZE + 3 * GAP);

/**
 * A face is named by the **vertex it does not contain** — the tetrahedron's four
 * faces are its four vertices' opposites, and that is already how
 * `puzzles/pyraminx/geometry.ts` models a face normal (`vecNegate` of a vertex
 * position).
 *
 * With WCA's holding — one vertex up (`U`), `L` front-left, `R` front-right, `B`
 * back — the face you look at is bounded by U, L and R, so it is the one opposite
 * `B`: TNoodle's `F`. The other three follow, and the two "handed" ones are the
 * ones worth stating: the face opposite `R` is on the **left**, so it is `L`.
 */
const FACE_NAME_BY_OPPOSITE_VERTEX: Readonly<Record<PyraminxVertex, string>> = {
  B: 'F',
  U: 'D',
  R: 'L',
  L: 'R',
};

/**
 * TNoodle's four triangles, in `image[4]` order, each carrying its centre, whether
 * it points up, and which puzzle vertex sits at each of the three corners
 * `triangle()` produces.
 *
 * ```java
 * drawTriangle(g, 2*gap+3*pieceSize,   gap+Math.sqrt(3)*pieceSize,       true,  image[0], …);
 * drawTriangle(g, 2*gap+3*pieceSize,   2*gap+2*Math.sqrt(3)*pieceSize,   false, image[1], …);
 * drawTriangle(g, gap+1.5*pieceSize,   gap+Math.sqrt(3)/2*pieceSize,     false, image[2], …);
 * drawTriangle(g, 3*gap+4.5*pieceSize, gap+Math.sqrt(3)/2*pieceSize,     false, image[3], …);
 * ```
 *
 * and `scheme[i] = colorScheme.get("FDLR".charAt(i))`, so the four faces are
 * `F D L R` in that order.
 *
 * 🔴 The `corners` rows are **derived, not guessed**: TNoodle's `triangle()` puts a
 * point-up triangle's vertices at 270°, 30° and 150° (top, bottom-right,
 * bottom-left) and a point-down one's at 210°, 330° and 90° (top-left, top-right,
 * bottom). Computing all four triangles' vertex coordinates shows exactly which
 * corners coincide across the fold, one `gap` apart — the centre triangle's top
 * corner meets face 2's second corner and face 3's first, and so on. That is what
 * fixes each row, and `pyraminx.test.ts` re-derives the tip cycles from TNoodle's
 * own `turnTip` tables to check it.
 */
interface PyraminxFace {
  readonly name: string;
  /** The vertex this face is opposite, i.e. `vecNegate` of it is the outward normal. */
  readonly opposite: PyraminxVertex;
  readonly cx: number;
  readonly cy: number;
  readonly pointUp: boolean;
  /** Puzzle vertex at triangle corner 0, 1, 2. */
  readonly corners: readonly [PyraminxVertex, PyraminxVertex, PyraminxVertex];
}

const PYRAMINX_FACES: readonly PyraminxFace[] = [
  {
    name: 'F',
    opposite: 'B',
    cx: 2 * GAP + 3 * PIECE_SIZE,
    cy: GAP + Math.sqrt(3) * PIECE_SIZE,
    pointUp: true,
    corners: ['U', 'R', 'L'],
  },
  {
    name: 'D',
    opposite: 'U',
    cx: 2 * GAP + 3 * PIECE_SIZE,
    cy: 2 * GAP + 2 * Math.sqrt(3) * PIECE_SIZE,
    pointUp: false,
    corners: ['L', 'R', 'B'],
  },
  {
    name: 'L',
    opposite: 'R',
    cx: GAP + 1.5 * PIECE_SIZE,
    cy: GAP + (Math.sqrt(3) / 2) * PIECE_SIZE,
    pointUp: false,
    corners: ['B', 'U', 'L'],
  },
  {
    name: 'R',
    opposite: 'L',
    cx: 3 * GAP + 4.5 * PIECE_SIZE,
    cy: GAP + (Math.sqrt(3) / 2) * PIECE_SIZE,
    pointUp: false,
    corners: ['U', 'B', 'R'],
  },
];

/**
 * `triangle(pointup, pieceSize)` — three vertices at `{7/6, 11/6, 1/2}π`, each
 * shifted by `1/3π` when the triangle points up.
 */
function triangleCorners(face: PyraminxFace): readonly [number, number][] {
  const base = [7 / 6, 11 / 6, 1 / 2];
  return base.map((turns) => {
    const angle = (turns + (face.pointUp ? 1 / 3 : 0)) * Math.PI;
    return [face.cx + RAD * Math.cos(angle), face.cy + RAD * Math.sin(angle)] as [number, number];
  }) as readonly [number, number][];
}

/** `getLineIntersection`, via `det(a,b,c,d) = a*d - b*c` — TNoodle's own formula. */
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
 * `drawTriangle`'s nine regions, and what each one physically is.
 *
 * The six edge-points are TNoodle's `xs`/`ys`: `xs[i]` sits one third along the
 * edge `i → i+1` (nearer corner `i`) and `xs[i+3]` two thirds along it (nearer
 * corner `i+1`). Then for each corner `i`:
 *
 * ```java
 * ps[3*i]   = corner i, xs[i], xs[3+(2+i)%3]                 // the corner triangle
 * ps[3*i+1] = xs[i], xs[3+(i+2)%3], centre                   // just inside corner i
 * ps[3*i+2] = xs[i], xs[i+3], centre                         // straddling edge i → i+1
 * ```
 *
 * Reading those against the puzzle: `3i` is the **tip** sticker at corner `i`,
 * `3i+1` is the **axial** sticker under that tip, and `3i+2` is the **edge**
 * sticker for the tetrahedron edge joining corner `i` to corner `i+1`.
 *
 * 🔴 That reading is checked, not assumed. TNoodle's `turnTip(0)` is
 * `swap(0,0, 3,0, 2,3)` — face 0 index 0, face 3 index 0, face 2 index 3 — and with
 * the corner table above those three are exactly the three faces' stickers at
 * puzzle vertex `U`, which is what a `u` tip turn cycles. Its `turn(0)` adds
 * `swap(0,1, 3,1, 2,4)` (the three axial stickers at `U`) and two more cycles over
 * the three `U` edges' six stickers. Every index lines up.
 *
 * So there are **36** stickers, not 40: the four tips contribute three stickers
 * each and they live *inside* the nine-per-face count, exactly as
 * `02-tnoodle-drawing-spec.md` §4 says ("Tips are drawn as part of the corner
 * regions"). Task 05's acceptance list arithmetic — `4*9 + 4` — double-counts them.
 */
type PyraminxRegion =
  | { readonly kind: 'tip'; readonly vertex: PyraminxVertex }
  | { readonly kind: 'axial'; readonly vertex: PyraminxVertex }
  | { readonly kind: 'edge'; readonly a: PyraminxVertex; readonly b: PyraminxVertex };

function regionsOf(face: PyraminxFace): readonly PyraminxRegion[] {
  const regions: PyraminxRegion[] = [];
  for (let i = 0; i < 3; i += 1) {
    regions[3 * i] = { kind: 'tip', vertex: face.corners[i]! };
    regions[3 * i + 1] = { kind: 'axial', vertex: face.corners[i]! };
    regions[3 * i + 2] = {
      kind: 'edge',
      a: face.corners[i]!,
      b: face.corners[(i + 1) % 3]!,
    };
  }
  return regions;
}

function regionPolygons(face: PyraminxFace): readonly (readonly [number, number])[][] {
  const corners = triangleCorners(face);
  const edgePoints: [number, number][] = new Array(6);
  for (let i = 0; i < 3; i += 1) {
    const from = corners[i]!;
    const to = corners[(i + 1) % 3]!;
    edgePoints[i] = [(2 / 3) * from[0] + (1 / 3) * to[0], (2 / 3) * from[1] + (1 / 3) * to[1]];
    edgePoints[i + 3] = [(1 / 3) * from[0] + (2 / 3) * to[0], (1 / 3) * from[1] + (2 / 3) * to[1]];
  }
  const centre = lineIntersection(edgePoints[0]!, edgePoints[4]!, edgePoints[2]!, edgePoints[3]!);

  const polygons: (readonly [number, number])[][] = new Array(9);
  for (let i = 0; i < 3; i += 1) {
    polygons[3 * i] = [corners[i]!, edgePoints[i]!, edgePoints[3 + ((2 + i) % 3)]!];
    polygons[3 * i + 1] = [edgePoints[i]!, edgePoints[3 + ((i + 2) % 3)]!, centre];
    polygons[3 * i + 2] = [edgePoints[i]!, edgePoints[i + 3]!, centre];
  }
  return polygons;
}

/** The face name a normal belongs to — a normal is the negation of the vertex it faces away from. */
function faceNameOfNormal(normal: Vec3): string {
  for (const vertex of PYRAMINX_VERTICES) {
    if (vecEquals(normal, vecNegate(VERTEX_POSITIONS[vertex]))) {
      return FACE_NAME_BY_OPPOSITE_VERTEX[vertex];
    }
  }
  throw new Error(`draw-pyraminx: [${normal.join(',')}] is not a face normal`);
}

/**
 * A tip or axial sticker's colour.
 *
 * Both pieces sit on a fixed vertex and only twist, and `axialOrientation` /
 * `tipOrientation` count **net clockwise turns** about that vertex. A clockwise
 * turn is `rotate120(axis, v, -1)` in `puzzles/pyraminx/geometry.ts`'s convention,
 * so after `t` turns the sticker showing on face `n` is the one that started on
 * `rotate120(axis, n, +1)` applied `t` times — the inverse rotation, walked back.
 */
function twistedStickerFace(vertex: PyraminxVertex, twist: number, faceNormal: Vec3): string {
  const axis = VERTEX_POSITIONS[vertex];
  let normal = faceNormal;
  for (let i = 0; i < twist % 3; i += 1) {
    normal = rotate120(axis, normal, 1);
  }
  return faceNameOfNormal(normal);
}

/** The two face normals an edge slot's stickers sit on — the faces opposite the *other* two vertices. */
function edgeFaceNormals(slot: number): readonly [Vec3, Vec3] {
  const [a, b] = EDGE_VERTEX_PAIRS[slot]!;
  const others = PYRAMINX_VERTICES.filter((v) => v !== a && v !== b);
  return [vecNegate(VERTEX_POSITIONS[others[0]!]), vecNegate(VERTEX_POSITIONS[others[1]!])];
}

/**
 * `puzzles/pyraminx/geometry.ts`'s reference-face choice, re-derived: of a slot's
 * two faces, the reference one is the lesser under `vecLess`.
 *
 * Re-derived rather than imported because `referenceNormal` there is private — and
 * that is the right call for it, since it is an internal convention. What matters
 * is that the *rule* is one line and stated in both places; `pyraminx.test.ts`
 * pins the consequence (a solved Pyraminx draws four single-coloured faces), which
 * would fail immediately if the two rules disagreed.
 */
function referenceNormalOf(slot: number): Vec3 {
  const [n1, n2] = edgeFaceNormals(slot);
  return vecLess(n1, n2) ? n1 : n2;
}

function edgeStickerFace(state: PyraminxState, slot: number, faceNormal: Vec3): string {
  const piece = state.edgePermutation[slot]!;
  const flipped = state.edgeOrientation[slot]! === 1;
  const slotReference = referenceNormalOf(slot);
  const onReference = vecEquals(faceNormal, slotReference);

  // Unflipped, the piece's reference sticker sits on the slot's reference face.
  const pieceReference = referenceNormalOf(piece);
  const [pn1, pn2] = edgeFaceNormals(piece);
  const pieceOther = vecEquals(pieceReference, pn1) ? pn2 : pn1;

  const showsPieceReference = onReference !== flipped;
  return faceNameOfNormal(showsPieceReference ? pieceReference : pieceOther);
}

/** The edge slot joining two vertices. */
function edgeSlotOf(a: PyraminxVertex, b: PyraminxVertex): number {
  const slot = EDGE_VERTEX_PAIRS.findIndex(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
  if (slot === -1) throw new Error(`draw-pyraminx: no edge between ${a} and ${b}`);
  return slot;
}

export function drawPyraminxScramble(scramble: string, scheme: ColorScheme): ScrambleImage {
  const state = applyPyraminxMoves(SOLVED_PYRAMINX_STATE, parsePyraminxScramble(scramble));
  const shapes: ImageShape[] = [];

  for (const face of PYRAMINX_FACES) {
    const normal = vecNegate(VERTEX_POSITIONS[face.opposite]);
    const polygons = regionPolygons(face);
    const regions = regionsOf(face);
    for (let i = 0; i < 9; i += 1) {
      const region = regions[i]!;
      let showing: string;
      switch (region.kind) {
        case 'tip':
          showing = twistedStickerFace(
            region.vertex,
            state.tipOrientation[vertexIndex(region.vertex)]!,
            normal,
          );
          break;
        case 'axial':
          showing = twistedStickerFace(
            region.vertex,
            state.axialOrientation[vertexIndex(region.vertex)]!,
            normal,
          );
          break;
        case 'edge':
          showing = edgeStickerFace(state, edgeSlotOf(region.a, region.b), normal);
          break;
      }
      shapes.push({
        kind: 'polygon',
        points: polygons[i]!,
        fill: colorFor(scheme, showing),
        stroke: BLACK,
        face: showing,
      });
    }
  }

  return {
    event: 'pyram',
    width: PYRAMINX_IMAGE_WIDTH,
    height: PYRAMINX_IMAGE_HEIGHT,
    // `svg.setStroke(2, 10, "round")` in `PyraminxPuzzle.drawScramble`.
    strokeWidth: 2,
    shapes,
  };
}

export const PYRAMINX_DRAWER: PuzzleDrawer = {
  draw: drawPyraminxScramble,
  defaultScheme: PYRAMINX_DEFAULT_SCHEME,
};

export function registerPyraminxDrawer(): void {
  registerDrawer('pyram', PYRAMINX_DRAWER);
}

export { PYRAMINX_FACES, EDGE_POSITIONS, regionsOf };
