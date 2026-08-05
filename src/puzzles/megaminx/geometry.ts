/**
 * Internal-only geometric derivation of the Megaminx move tables.
 *
 * ## The model
 *
 * A regular dodecahedron, built from the standard coordinates: 20 vertices at
 * `(±1,±1,±1)` together with the cyclic permutations of `(0, ±1/φ, ±φ)`, and
 * 12 face centers at the cyclic permutations of `(0, ±φ, ±1)`. Corners sit at
 * the vertices, edges at the 30 vertex-pair midpoints, and centers at the
 * face centers — every position is *computed* from those two families, never
 * listed.
 *
 * Which cyclic family the face centers use is not a free choice, and picking
 * the wrong one is the obvious way to get this silently wrong: with
 * `(0, ±1, ±φ)` the five vertices nearest a "face center" are not coplanar
 * and the object isn't a dodecahedron's face at all. `geometry.test.ts`
 * checks the defining property directly — each face has exactly five
 * vertices, all at the same distance from its center.
 *
 * ## Floating point, and why it's safe here
 *
 * This is the one puzzle here that can't live on an integer lattice: `φ` and
 * the sine of 72° are irrational, and 72° rotations of the dodecahedron are
 * not expressible over the integers the way the cube-family and tetrahedral
 * 90°/120° rotations are (see `utils/vec3.ts`). So positions are floats and
 * lookup is nearest-match within a tolerance.
 *
 * That is sound because the structure being recovered is *discrete and well
 * separated*: the closest two distinct piece positions of the same type are
 * about 1.05 apart, while a rotation introduces error on the order of 1e-15.
 * `geometry.test.ts` measures that separation and asserts the margin rather
 * than trusting it — the tolerance is nine orders of magnitude clear.
 *
 * ## Which faces are U and L
 *
 * Pochmann notation needs exactly two named faces: `U` (turned by `U`, held
 * by `D`) and `L` (held by `R`). Both `U` and `D` act about the U axis, `R`
 * about the L axis.
 *
 * `L` is a *neighbour* of `U`, and that is the only constraint. Every
 * adjacent face pair of a dodecahedron is carried to every other by a
 * rotation of the solid, so all choices give the same puzzle up to
 * relabelling — there is no mirror-image trap here of the kind the Pyraminx
 * and Skewb labellings had to be pinned down to avoid.
 */

export type Vec3f = readonly [number, number, number];

const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = PHI - 1; // 1/φ = φ − 1

/** Distinct positions of the same kind are ~1.05 apart at the closest; rotation error is ~1e-15. */
const TOLERANCE = 1e-6;

function dot(a: Vec3f, b: Vec3f): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3f, b: Vec3f): Vec3f {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function scale(a: Vec3f, k: number): Vec3f {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function add(a: Vec3f, b: Vec3f): Vec3f {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function length(a: Vec3f): number {
  return Math.sqrt(dot(a, a));
}

function normalize(a: Vec3f): Vec3f {
  return scale(a, 1 / length(a));
}

export function distance(a: Vec3f, b: Vec3f): number {
  return length([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
}

/** A deterministic key, rounded well inside `TOLERANCE`, for ordering positions reproducibly. */
export function positionKey(a: Vec3f): string {
  return a.map((v) => (Math.abs(v) < TOLERANCE ? 0 : v).toFixed(9)).join(',');
}

/**
 * All sign variations of `pattern` and of its two cyclic rotations,
 * de-duplicated — the standard way these coordinate families are written, and
 * generated rather than typed out.
 */
function signedCyclicFamily(pattern: Vec3f): Vec3f[] {
  const out: Vec3f[] = [];
  const seen = new Set<string>();
  for (let rotation = 0; rotation < 3; rotation += 1) {
    const p: Vec3f = [
      pattern[rotation % 3]!,
      pattern[(rotation + 1) % 3]!,
      pattern[(rotation + 2) % 3]!,
    ];
    for (const sx of [1, -1]) {
      for (const sy of [1, -1]) {
        for (const sz of [1, -1]) {
          const v: Vec3f = [p[0] * sx, p[1] * sy, p[2] * sz];
          const key = positionKey(v);
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(v);
        }
      }
    }
  }
  return out;
}

function sortByKey(positions: readonly Vec3f[]): Vec3f[] {
  return [...positions].sort((a, b) => (positionKey(a) < positionKey(b) ? -1 : 1));
}

/** The 12 face centers. Sorted so the indexing is reproducible across runs. */
export const FACE_CENTERS: readonly Vec3f[] = sortByKey(signedCyclicFamily([0, PHI, 1]));

/** The 20 corners. */
export const CORNER_POSITIONS_MINX: readonly Vec3f[] = sortByKey([
  ...signedCyclicFamily([1, 1, 1]),
  ...signedCyclicFamily([0, INV_PHI, PHI]),
]);

const EDGE_LENGTH = 2 * INV_PHI;

/** The 30 edges, as the midpoints of the vertex pairs one edge-length apart. */
export const EDGE_POSITIONS_MINX: readonly Vec3f[] = (() => {
  const midpoints: Vec3f[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < CORNER_POSITIONS_MINX.length; i += 1) {
    for (let j = i + 1; j < CORNER_POSITIONS_MINX.length; j += 1) {
      const a = CORNER_POSITIONS_MINX[i]!;
      const b = CORNER_POSITIONS_MINX[j]!;
      if (Math.abs(distance(a, b) - EDGE_LENGTH) > TOLERANCE) continue;
      const mid = scale(add(a, b), 0.5);
      const key = positionKey(mid);
      if (seen.has(key)) continue;
      seen.add(key);
      midpoints.push(mid);
    }
  }
  return sortByKey(midpoints);
})();

export const FACE_COUNT_MINX = FACE_CENTERS.length; // 12
export const CORNER_COUNT_MINX = CORNER_POSITIONS_MINX.length; // 20
export const EDGE_COUNT_MINX = EDGE_POSITIONS_MINX.length; // 30

/**
 * Rotates `v` by `fifths` fifths of a turn about `axis`, right-hand rule —
 * so a *negative* `fifths` is clockwise seen from outside the axis, matching
 * the convention `puzzles/333/geometry.ts` and `utils/vec3.ts` both use.
 */
export function rotateFifths(axis: Vec3f, v: Vec3f, fifths: number): Vec3f {
  const n = normalize(axis);
  const angle = (fifths * 2 * Math.PI) / 5;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(
    add(scale(v, c), scale(cross(n, v), s)),
    scale(n, dot(n, v) * (1 - c)),
  );
}

function indexOfPosition(positions: readonly Vec3f[], target: Vec3f): number {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < positions.length; i += 1) {
    const d = distance(positions[i]!, target);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  if (bestDistance > TOLERANCE) {
    throw new Error(
      `megaminx-geometry: [${target.join(',')}] is ${bestDistance} from the nearest position — not a lattice point`,
    );
  }
  return best;
}

/**
 * Whether `position` lies on `face`'s layer. A face's layer is its center,
 * its five corners and its five edges — exactly the pieces at the maximum
 * projection onto the face normal for their own kind, which is why this is a
 * comparison against that maximum rather than a hand-set threshold.
 */
function maxProjection(positions: readonly Vec3f[], face: Vec3f): number {
  return Math.max(...positions.map((p) => dot(p, face)));
}

const MAX_PROJECTION_CACHE = new Map<string, { corners: number; edges: number; centers: number }>();

function projections(face: Vec3f): { corners: number; edges: number; centers: number } {
  const key = positionKey(face);
  let cached = MAX_PROJECTION_CACHE.get(key);
  if (!cached) {
    cached = {
      corners: maxProjection(CORNER_POSITIONS_MINX, face),
      edges: maxProjection(EDGE_POSITIONS_MINX, face),
      centers: maxProjection(FACE_CENTERS, face),
    };
    MAX_PROJECTION_CACHE.set(key, cached);
  }
  return cached;
}

export function cornerOnFace(face: Vec3f, position: Vec3f): boolean {
  return Math.abs(dot(position, face) - projections(face).corners) < TOLERANCE;
}

export function edgeOnFace(face: Vec3f, position: Vec3f): boolean {
  return Math.abs(dot(position, face) - projections(face).edges) < TOLERANCE;
}

export function centerOnFace(face: Vec3f, position: Vec3f): boolean {
  return Math.abs(dot(position, face) - projections(face).centers) < TOLERANCE;
}

/** The faces a corner's three stickers sit on / an edge's two sit on. */
export function facesAtCorner(position: Vec3f): Vec3f[] {
  return FACE_CENTERS.filter((face) => cornerOnFace(face, position));
}

export function facesAtEdge(position: Vec3f): Vec3f[] {
  return FACE_CENTERS.filter((face) => edgeOnFace(face, position));
}

/**
 * The three faces at a corner, in the cyclic order that *defines* orientation
 * there: index 0 is the lowest-keyed of them, and 1 and 2 follow it under a
 * third of a turn about the corner's own axis.
 *
 * Deriving the cycle from a rotation rather than writing an order per corner
 * is what makes it automatically consistent with each corner's chirality —
 * the same reasoning as `puzzles/skewb/geometry.ts`.
 */
export function cornerFaceCycle(position: Vec3f): readonly [Vec3f, Vec3f, Vec3f] {
  const faces = facesAtCorner(position);
  if (faces.length !== 3) {
    throw new Error(`megaminx-geometry: corner [${position.join(',')}] touches ${faces.length} faces, expected 3`);
  }
  const first = sortByKey(faces)[0]!;
  // A third of a turn about a dodecahedron vertex is a symmetry of the solid,
  // so it permutes the three faces meeting there cyclically. 5/3 fifths = 120°.
  const second = rotateFifths(position, first, 5 / 3);
  const third = rotateFifths(position, second, 5 / 3);
  return [first, second, third];
}

/** The reference face of an edge — orientation 0 means the piece's reference sticker is here. */
export function edgeReferenceFace(position: Vec3f): Vec3f {
  const faces = facesAtEdge(position);
  if (faces.length !== 2) {
    throw new Error(`megaminx-geometry: edge [${position.join(',')}] touches ${faces.length} faces, expected 2`);
  }
  return sortByKey(faces)[0]!;
}

export interface MegaminxMoveTable {
  readonly cornerDestination: readonly number[];
  readonly cornerTwist: readonly number[];
  readonly edgeDestination: readonly number[];
  readonly edgeFlip: readonly number[];
  readonly centerDestination: readonly number[];
}

const CORNER_CYCLES = CORNER_POSITIONS_MINX.map(cornerFaceCycle);
const EDGE_REFERENCES = EDGE_POSITIONS_MINX.map(edgeReferenceFace);

/**
 * Derives a move table.
 *
 * `axis` is the face the rotation is about. `fifths` is how far, right-hand
 * rule. `moving` decides which pieces go along: for a `U` turn it's the
 * pieces *on* the U layer; for `R`/`D` — which hold a face and turn the bulk
 * — it's the pieces *not* on the held layer. That inversion is the only
 * structural difference between the two kinds of move here, so it's a
 * parameter rather than two code paths.
 */
export function deriveMoveTableMinx(
  axis: Vec3f,
  fifths: number,
  moving: 'on-layer' | 'off-layer',
): MegaminxMoveTable {
  const wants = (onLayer: boolean) => (moving === 'on-layer' ? onLayer : !onLayer);

  const cornerDestination: number[] = [];
  const cornerTwist: number[] = [];
  for (let i = 0; i < CORNER_COUNT_MINX; i += 1) {
    const from = CORNER_POSITIONS_MINX[i]!;
    if (!wants(cornerOnFace(axis, from))) {
      cornerDestination[i] = i;
      cornerTwist[i] = 0;
      continue;
    }
    const to = rotateFifths(axis, from, fifths);
    const destination = indexOfPosition(CORNER_POSITIONS_MINX, to);
    cornerDestination[i] = destination;

    const carried = rotateFifths(axis, CORNER_CYCLES[i]![0], fifths);
    const cycle = CORNER_CYCLES[destination]!;
    const twist = cycle.findIndex((face) => distance(face, carried) < TOLERANCE);
    if (twist === -1) {
      throw new Error(`megaminx-geometry: corner ${i} lost track of its reference sticker`);
    }
    cornerTwist[i] = twist;
  }

  const edgeDestination: number[] = [];
  const edgeFlip: number[] = [];
  for (let i = 0; i < EDGE_COUNT_MINX; i += 1) {
    const from = EDGE_POSITIONS_MINX[i]!;
    if (!wants(edgeOnFace(axis, from))) {
      edgeDestination[i] = i;
      edgeFlip[i] = 0;
      continue;
    }
    const to = rotateFifths(axis, from, fifths);
    const destination = indexOfPosition(EDGE_POSITIONS_MINX, to);
    edgeDestination[i] = destination;
    const carried = rotateFifths(axis, EDGE_REFERENCES[i]!, fifths);
    edgeFlip[i] = distance(carried, EDGE_REFERENCES[destination]!) < TOLERANCE ? 0 : 1;
  }

  const centerDestination: number[] = [];
  for (let i = 0; i < FACE_COUNT_MINX; i += 1) {
    const from = FACE_CENTERS[i]!;
    centerDestination[i] = wants(centerOnFace(axis, from))
      ? indexOfPosition(FACE_CENTERS, rotateFifths(axis, from, fifths))
      : i;
  }

  return { cornerDestination, cornerTwist, edgeDestination, edgeFlip, centerDestination };
}

/**
 * The `U` face, and the `L` face `R` holds. `L` is chosen as `U`'s
 * lowest-keyed neighbour; any neighbour would do, since a rotation of the
 * solid carries any adjacent face pair to any other (see the module note).
 */
export const U_FACE: Vec3f = FACE_CENTERS[0]!;

export const L_FACE: Vec3f = (() => {
  const neighbours = FACE_CENTERS.filter(
    (face) => positionKey(face) !== positionKey(U_FACE) && sharesAnEdgeWith(U_FACE, face),
  );
  return sortByKey(neighbours)[0]!;
})();

/** Two faces are neighbours exactly when some edge piece lies on both. */
function sharesAnEdgeWith(a: Vec3f, b: Vec3f): boolean {
  return EDGE_POSITIONS_MINX.some((edge) => edgeOnFace(a, edge) && edgeOnFace(b, edge));
}

export { sharesAnEdgeWith, TOLERANCE };
