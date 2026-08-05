/**
 * Internal-only geometric derivation of the Pyraminx turn tables — the
 * tetrahedral counterpart of `puzzles/333/geometry.ts`, and derived the same
 * way (rotation matrices applied to a coordinate model) rather than
 * transcribed from a remembered permutation table.
 *
 * ## The coordinate model
 *
 * A regular tetrahedron's four vertices are *exactly* four alternate corners
 * of a cube, so the whole puzzle can live on integer coordinates rather than
 * the irrational ones a "vertex up, base in a horizontal plane" embedding
 * would force. In this embedding the six edge midpoints land precisely on
 * the six cube face centers (`(±1,0,0)`, `(0,±1,0)`, `(0,0,±1)`) and the four
 * face centroids land on the four *other* cube corners — every position this
 * module needs is an exact small integer vector, so destination lookup is
 * exact equality with no floating-point tolerance anywhere.
 *
 * ## The rotation
 *
 * A vertex turn is a ±120° rotation about the axis through that vertex and
 * the centroid. Substituting `cos 120° = -1/2`, `sin 120° = ±√3/2` and
 * `n = A/√3` (where `A` is the vertex's own ±1 coordinate vector, so
 * `|A|² = 3`) into Rodrigues' formula collapses every irrational factor:
 *
 * ```
 *   v' = ( -v + A(A·v) ± (A × v) ) / 2
 * ```
 *
 * `+` is the right-hand-rule (counterclockwise-from-outside) rotation, `−`
 * is clockwise-from-outside — the same sign convention `puzzles/333/`
 * documents for cube faces, where a clockwise face turn is likewise the
 * *negative*-angle rotation about that face's outward axis.
 *
 * ## Why these vertex labels
 *
 * WCA orients a Pyraminx with one vertex up (`U`) and the other three around
 * the base: `L` front-left, `R` front-right, `B` back. Looking straight down
 * at `U` from outside, those three therefore read *clockwise* as B → R → L.
 * `VERTEX_POSITIONS` below is the assignment that reproduces exactly that
 * cycle under the clockwise rotation above, which is what pins the model's
 * chirality to the real puzzle's (any labeling is self-consistent, but a
 * mirrored one would silently produce the mirror image of every scramble).
 * `geometry.test.ts` asserts that cycle directly rather than trusting this
 * comment.
 */

import { PYRAMINX_VERTICES, type PyraminxVertex } from './notation';

export type Vec3 = readonly [number, number, number];

export const VERTEX_POSITIONS: Readonly<Record<PyraminxVertex, Vec3>> = {
  U: [1, 1, 1],
  L: [-1, 1, -1],
  R: [-1, -1, 1],
  B: [1, -1, -1],
};

/** The six edges as vertex pairs, enumerated in `PYRAMINX_VERTICES` order: UL, UR, UB, LR, LB, RB. */
export const EDGE_VERTEX_PAIRS: readonly (readonly [PyraminxVertex, PyraminxVertex])[] = (() => {
  const pairs: (readonly [PyraminxVertex, PyraminxVertex])[] = [];
  for (let i = 0; i < PYRAMINX_VERTICES.length; i += 1) {
    for (let j = i + 1; j < PYRAMINX_VERTICES.length; j += 1) {
      pairs.push([PYRAMINX_VERTICES[i]!, PYRAMINX_VERTICES[j]!] as const);
    }
  }
  return pairs;
})();

export const EDGE_COUNT_PYRAMINX = EDGE_VERTEX_PAIRS.length; // 6
export const VERTEX_COUNT_PYRAMINX = PYRAMINX_VERTICES.length; // 4

export const EDGE_NAMES: readonly string[] = EDGE_VERTEX_PAIRS.map(([a, b]) => `${a}${b}`);

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function negate(a: Vec3): Vec3 {
  return [-a[0], -a[1], -a[2]];
}

function halve(a: Vec3): Vec3 {
  return [a[0] / 2, a[1] / 2, a[2] / 2];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vecEquals(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** Total order on vectors, used only to pick each edge slot's reference face deterministically. */
function vecLess(a: Vec3, b: Vec3): boolean {
  if (a[0] !== b[0]) return a[0] < b[0];
  if (a[1] !== b[1]) return a[1] < b[1];
  return a[2] < b[2];
}

/** Edge slot midpoints — always integral in this embedding (see the module note). */
export const EDGE_POSITIONS: readonly Vec3[] = EDGE_VERTEX_PAIRS.map(([a, b]) =>
  halve(add(VERTEX_POSITIONS[a], VERTEX_POSITIONS[b])),
);

/**
 * 120° rotation about the axis through vertex `axis`. `sign = -1` is
 * clockwise viewed from outside that vertex — the direction an uppercase
 * Pyraminx move means.
 */
export function rotate120(axis: Vec3, v: Vec3, sign: 1 | -1): Vec3 {
  const d = dot(axis, v);
  const c = cross(axis, v);
  const out: Vec3 = [
    (-v[0] + axis[0] * d + sign * c[0]) / 2,
    (-v[1] + axis[1] * d + sign * c[1]) / 2,
    (-v[2] + axis[2] * d + sign * c[2]) / 2,
  ];
  if (!out.every(Number.isInteger)) {
    throw new Error(
      `pyraminx-geometry: rotating [${v.join(',')}] about [${axis.join(',')}] left the integer lattice`,
    );
  }
  return out;
}

function edgeIndexAt(position: Vec3): number {
  const index = EDGE_POSITIONS.findIndex((p) => vecEquals(p, position));
  if (index === -1) {
    throw new Error(`pyraminx-geometry: no edge slot at [${position.join(',')}]`);
  }
  return index;
}

/**
 * The outward normals of the two tetrahedron faces an edge slot's two
 * stickers sit on. A face is named by the vertex it does *not* contain, and
 * its outward direction is that vertex negated — so edge `{a,b}` is on the
 * faces opposite the other two vertices.
 */
function faceNormalsOfEdge(index: number): readonly [Vec3, Vec3] {
  const [a, b] = EDGE_VERTEX_PAIRS[index]!;
  const others = PYRAMINX_VERTICES.filter((v) => v !== a && v !== b);
  return [negate(VERTEX_POSITIONS[others[0]!]), negate(VERTEX_POSITIONS[others[1]!])];
}

/**
 * Each edge slot's *reference* face: orientation 0 means the piece sitting
 * there has its reference sticker on this face. Which of the two faces gets
 * picked is arbitrary — any consistent choice yields a faithful model, since
 * it only relabels the two orientation values — so it's resolved by a fixed
 * total order on the normals rather than by an appeal to sticker colors the
 * model doesn't have.
 */
function referenceNormal(index: number): Vec3 {
  const [n1, n2] = faceNormalsOfEdge(index);
  return vecLess(n1, n2) ? n1 : n2;
}

const REFERENCE_NORMALS: readonly Vec3[] = EDGE_POSITIONS.map((_, i) => referenceNormal(i));

export interface PyraminxTurnTable {
  readonly vertex: PyraminxVertex;
  /** `edgeDestination[i]` = slot the piece at edge slot `i` moves to. */
  readonly edgeDestination: readonly number[];
  /** `edgeFlip[i]` = orientation delta (mod 2) applied to the piece starting at edge slot `i`. */
  readonly edgeFlip: readonly number[];
  /** `axialTwist[v]` = orientation delta (mod 3) for the axial piece at vertex index `v`. */
  readonly axialTwist: readonly number[];
}

/**
 * The clockwise two-layer turn about `vertex`.
 *
 * Axial pieces never change position on a Pyraminx — the four of them *are*
 * the puzzle's fixed reference frame, which is why all four turns are
 * meaningful here (contrast 2x2x2, where the absence of a frame is exactly
 * what makes three faces sufficient). So an axial's "orientation" is just a
 * net-clockwise-turn counter, and the only thing a turn does to one is
 * `+1` on its own vertex. That's definitional rather than derived, so
 * there is nothing here to get geometrically backwards.
 */
export function deriveTurnTable(vertex: PyraminxVertex): PyraminxTurnTable {
  const axis = VERTEX_POSITIONS[vertex];
  const edgeDestination: number[] = [];
  const edgeFlip: number[] = [];

  for (let i = 0; i < EDGE_COUNT_PYRAMINX; i += 1) {
    const [a, b] = EDGE_VERTEX_PAIRS[i]!;
    // Only the three edges touching this vertex are on its layer.
    if (a !== vertex && b !== vertex) {
      edgeDestination[i] = i;
      edgeFlip[i] = 0;
      continue;
    }
    const destination = edgeIndexAt(rotate120(axis, EDGE_POSITIONS[i]!, -1));
    edgeDestination[i] = destination;
    const carriedReference = rotate120(axis, REFERENCE_NORMALS[i]!, -1);
    edgeFlip[i] = vecEquals(carriedReference, REFERENCE_NORMALS[destination]!) ? 0 : 1;
  }

  const axialTwist = PYRAMINX_VERTICES.map((v) => (v === vertex ? 1 : 0));

  return { vertex, edgeDestination, edgeFlip, axialTwist };
}
