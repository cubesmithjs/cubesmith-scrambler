/**
 * Internal-only geometric derivation of the Face Turning Octahedron's turns.
 *
 * ## The frame
 *
 * The octahedron is `|x| + |y| + |z| ≤ 1`: six vertices on the axes, eight
 * faces whose outward normals are the eight body diagonals `(±1, ±1, ±1)`.
 * A face turn rotates the slab nearest that face by 120° about its normal,
 * which is exactly the rotation `utils/vec3.ts`'s `rotate120` performs — so,
 * as for the Pyraminx and the Skewb, nothing here leaves the integer lattice
 * and piece lookup is plain equality.
 *
 * The names are pinned to normals by the puzzle's adjacencies rather than by a
 * picture, because adjacency is what a scramble means:
 *
 * | Face | Normal | | Face | Normal |
 * |---|---|---|---|---|
 * | `U` | `( 1,  1,  1)` | | `D`  | `(-1, -1, -1)` |
 * | `F` | `(-1, -1,  1)` | | `B`  | `( 1,  1, -1)` |
 * | `R` | `( 1, -1,  1)` | | `BL` | `(-1,  1, -1)` |
 * | `L` | `(-1,  1,  1)` | | `BR` | `( 1, -1, -1)` |
 *
 * Two faces share an edge exactly when their normals differ in one sign, a
 * vertex alone when they differ in two, and nothing when they are opposite.
 * The table reproduces every relation the established FTO notation states:
 * `U`, `F`, `R`, `L` meet at the vertex `(0, 0, 1)` and `B`, `D`, `BR`, `BL`
 * at `(0, 0, -1)`; `U`–`R` and `F`–`D` share edges; `U`–`F` and `BR`–`BL`
 * share only a vertex; and mirroring `x` swaps `U` with `L` and `F` with `R`.
 * `geometry.test.ts` checks each of those, and checks the one thing adjacency
 * cannot fix — handedness — by confirming that, with `U` up and `F` in front,
 * `R` is on the viewer's right.
 *
 * ## The cut
 *
 * Positions are scaled so that every sticker's centroid is an integer vector
 * (the octahedron becomes `|x| + |y| + |z| ≤ 9`, and a face's nine stickers are
 * the nine small triangles of a 3×3 subdivision). The FTO's cut for the face
 * with normal `m` is the plane `p·m = 3`, one third of the way in, and a turn
 * moves every sticker with `p·m > 3`. With `v` a vertex and `n` a face normal:
 *
 * - a **corner** sticker is `n + 6v` — four per vertex, one on each face there;
 * - an **edge** sticker is `n + 3(u + w)` for the edge between vertices `u`, `w`;
 * - a **centre** sticker is `2n + 3v` — the small inverted triangle on face `n`
 *   that points at its vertex `v`.
 *
 * At the piece level that test simplifies to: a turn moves the three corners at
 * its face's vertices, the three edges of its face, its own three centres, and
 * on each of the three faces sharing an edge with it the two centres pointing
 * at the vertices of that shared edge — 3 + 3 + 9 pieces, 27 stickers.
 *
 * ## Why every turn preserves so much
 *
 * Every rotation here is a 120° turn about a body diagonal, and those generate
 * only the twelve rotations of a tetrahedron. Each such rotation keeps the sign
 * product of a normal, so it never carries a sticker from a face of one
 * "parity" (`+`: `U F BR BL`, `−`: `R L B D`) to a face of the other. Three
 * facts follow, and `state.test.ts` checks each against the derived tables:
 *
 * - the **centres** fall into two orbits of twelve, one per parity, that no
 *   sequence of turns ever mixes;
 * - an **edge** has no orientation: no tetrahedral rotation fixes an edge's
 *   midpoint, so where an edge is says how it lies;
 * - a **corner** has two orientations, not four: the only tetrahedral rotation
 *   fixing a vertex is the half turn about it, so its two `+` stickers can swap
 *   but never land on a `−` face.
 */

import { rotate120, vecAdd, vecDot, vecEquals, vecLess, type Vec3 } from '../../utils/vec3';
import { FTO_FACES, type FtoFace } from './notation';

export const FACE_NORMALS: Readonly<Record<FtoFace, Vec3>> = {
  U: [1, 1, 1],
  F: [-1, -1, 1],
  R: [1, -1, 1],
  L: [-1, 1, 1],
  B: [1, 1, -1],
  D: [-1, -1, -1],
  BR: [1, -1, -1],
  BL: [-1, 1, -1],
};

/** `+1` for `U F BR BL`, `−1` for `R L B D` — the orbit a face's centres belong to. */
export function faceParity(normal: Vec3): 1 | -1 {
  return (normal[0] * normal[1] * normal[2]) as 1 | -1;
}

/**
 * The six vertices. Index 5 is `(0, 0, -1)`, the corner shared by `D B BR BL`
 * and touched by none of `U F R L` — the corner the solver's first phase builds
 * its block around.
 */
export const CORNER_POSITIONS_FTO: readonly Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export const CORNER_COUNT_FTO = CORNER_POSITIONS_FTO.length; // 6

/** Index of `(0, 0, -1)` in {@link CORNER_POSITIONS_FTO}. */
export const BLOCK_CORNER_INDEX = 5;

/** The twelve edges, each written as the sum of its two (adjacent) vertices. */
export const EDGE_POSITIONS_FTO: readonly Vec3[] = (() => {
  const edges: Vec3[] = [];
  for (let i = 0; i < CORNER_COUNT_FTO; i += 1) {
    for (let j = i + 1; j < CORNER_COUNT_FTO; j += 1) {
      const u = CORNER_POSITIONS_FTO[i]!;
      const w = CORNER_POSITIONS_FTO[j]!;
      // Opposite vertices are not joined by an edge.
      if (vecDot(u, w) === 0) edges.push(vecAdd(u, w));
    }
  }
  return edges;
})();

export const EDGE_COUNT_FTO = EDGE_POSITIONS_FTO.length; // 12

/** A centre's place: the face it is on and the vertex it points at. */
export interface CentrePosition {
  readonly face: FtoFace;
  readonly normal: Vec3;
  readonly vertex: Vec3;
  /** `2n + 3v`, the sticker's centroid in the scaled frame. */
  readonly point: Vec3;
}

function centresOfParity(parity: 1 | -1): readonly CentrePosition[] {
  const centres: CentrePosition[] = [];
  for (const face of FTO_FACES) {
    const normal = FACE_NORMALS[face];
    if (faceParity(normal) !== parity) continue;
    for (const vertex of CORNER_POSITIONS_FTO) {
      if (vecDot(vertex, normal) <= 0) continue;
      const point: Vec3 = [
        2 * normal[0] + 3 * vertex[0],
        2 * normal[1] + 3 * vertex[1],
        2 * normal[2] + 3 * vertex[2],
      ];
      centres.push({ face, normal, vertex, point });
    }
  }
  return centres;
}

/** The twelve centres on `U F BR BL` — orbit A. Grouped by face, three per face. */
export const CENTRE_A_POSITIONS: readonly CentrePosition[] = centresOfParity(1);
/** The twelve centres on `R L B D` — orbit B. Grouped by face, three per face. */
export const CENTRE_B_POSITIONS: readonly CentrePosition[] = centresOfParity(-1);

export const CENTRE_ORBIT_SIZE = CENTRE_A_POSITIONS.length; // 12

/**
 * The two `+` faces meeting at a vertex, in a fixed order. A corner's
 * orientation is which of its slot's two it shows its reference sticker on —
 * the sticker that sits on `pair[0]` when the piece is home.
 */
function plusFacePair(vertex: Vec3): readonly [Vec3, Vec3] {
  const faces = FTO_FACES.map((f) => FACE_NORMALS[f]).filter(
    (n) => vecDot(n, vertex) > 0 && faceParity(n) === 1,
  );
  if (faces.length !== 2) {
    throw new Error(`fto-geometry: vertex [${vertex.join(',')}] has ${faces.length} + faces`);
  }
  const [a, b] = faces as [Vec3, Vec3];
  return vecLess(a, b) ? [a, b] : [b, a];
}

export const CORNER_PLUS_FACES: readonly (readonly [Vec3, Vec3])[] =
  CORNER_POSITIONS_FTO.map(plusFacePair);

export interface FtoTurnTable {
  readonly face: FtoFace;
  /** `cornerDestination[i]` = the corner slot the piece at slot `i` moves to. */
  readonly cornerDestination: readonly number[];
  /** `cornerTwist[i]` = the orientation change (mod 2) of the piece leaving slot `i`. */
  readonly cornerTwist: readonly number[];
  readonly edgeDestination: readonly number[];
  readonly centreADestination: readonly number[];
  readonly centreBDestination: readonly number[];
}

function indexOfVec(list: readonly Vec3[], target: Vec3, what: string): number {
  const index = list.findIndex((p) => vecEquals(p, target));
  if (index === -1) throw new Error(`fto-geometry: no ${what} at [${target.join(',')}]`);
  return index;
}

/** `rotate120` with the sign that is clockwise seen from outside `normal` — a plain letter. */
function clockwise(normal: Vec3, v: Vec3): Vec3 {
  return rotate120(normal, v, -1);
}

function centreDestinations(
  positions: readonly CentrePosition[],
  normal: Vec3,
): readonly number[] {
  const points = positions.map((c) => c.point);
  return points.map((point, i) =>
    vecDot(point, normal) > 3 ? indexOfVec(points, clockwise(normal, point), 'centre') : i,
  );
}

/** The clockwise turn of `face`, derived from the rotation alone. */
export function deriveTurnTableFto(face: FtoFace): FtoTurnTable {
  const normal = FACE_NORMALS[face];
  const cornerDestination: number[] = [];
  const cornerTwist: number[] = [];

  CORNER_POSITIONS_FTO.forEach((vertex, i) => {
    if (vecDot(vertex, normal) <= 0) {
      cornerDestination[i] = i;
      cornerTwist[i] = 0;
      return;
    }
    const destination = indexOfVec(CORNER_POSITIONS_FTO, clockwise(normal, vertex), 'corner');
    cornerDestination[i] = destination;
    const carried = clockwise(normal, CORNER_PLUS_FACES[i]![0]);
    const twist = CORNER_PLUS_FACES[destination]!.findIndex((n) => vecEquals(n, carried));
    if (twist === -1) {
      throw new Error(`fto-geometry: ${face} carried a + sticker onto a − face`);
    }
    cornerTwist[i] = twist;
  });

  const edgeDestination = EDGE_POSITIONS_FTO.map((edge, i) =>
    vecDot(edge, normal) === 2 ? indexOfVec(EDGE_POSITIONS_FTO, clockwise(normal, edge), 'edge') : i,
  );

  return {
    face,
    cornerDestination,
    cornerTwist,
    edgeDestination,
    centreADestination: centreDestinations(CENTRE_A_POSITIONS, normal),
    centreBDestination: centreDestinations(CENTRE_B_POSITIONS, normal),
  };
}

/**
 * The 72 stickers, as the drawing needs them: the face each is on, and its
 * centroid in the scaled frame. Nine per face, in `FTO_FACES` order, each face's
 * nine as its three corner stickers, three edge stickers and three centres.
 *
 * A second, independent model of the same puzzle. The piece-level tables above
 * are what the solver runs on; this one is what the picture is drawn from, and
 * `state.test.ts` checks that the two agree after every move.
 */
export interface Facelet {
  readonly face: FtoFace;
  readonly point: Vec3;
  readonly kind: 'corner' | 'edge' | 'centre';
}

export const FACELETS_FTO: readonly Facelet[] = (() => {
  const facelets: Facelet[] = [];
  for (const face of FTO_FACES) {
    const n = FACE_NORMALS[face];
    const vertices = CORNER_POSITIONS_FTO.filter((v) => vecDot(v, n) > 0);
    for (const v of vertices) {
      facelets.push({ face, kind: 'corner', point: [n[0] + 6 * v[0], n[1] + 6 * v[1], n[2] + 6 * v[2]] });
    }
    for (let i = 0; i < 3; i += 1) {
      for (let j = i + 1; j < 3; j += 1) {
        const e = vecAdd(vertices[i]!, vertices[j]!);
        facelets.push({ face, kind: 'edge', point: [n[0] + 3 * e[0], n[1] + 3 * e[1], n[2] + 3 * e[2]] });
      }
    }
    for (const v of vertices) {
      facelets.push({ face, kind: 'centre', point: [2 * n[0] + 3 * v[0], 2 * n[1] + 3 * v[1], 2 * n[2] + 3 * v[2]] });
    }
  }
  return facelets;
})();

/** `faceletDestination[i]` = where the sticker at facelet `i` goes under a clockwise turn of `face`. */
export function deriveFaceletTurn(face: FtoFace): readonly number[] {
  const normal = FACE_NORMALS[face];
  const points = FACELETS_FTO.map((f) => f.point);
  return points.map((point, i) =>
    vecDot(point, normal) > 3 ? indexOfVec(points, clockwise(normal, point), 'facelet') : i,
  );
}
