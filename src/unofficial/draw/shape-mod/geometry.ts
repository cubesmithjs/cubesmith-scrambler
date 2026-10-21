/**
 * A small exact-enough geometry kernel for convex polytopes: half-spaces,
 * clipping, area, volume. Plain numbers only, no dependency.
 *
 * Everything the shape-mod engine draws is convex, and that is the property the
 * whole design leans on. A piece is the intersection of its mechanism cell
 * (bounded by up to six cut planes) with the puzzle's convex outer solid, and an
 * intersection of half-spaces is always convex. So one operation, "clip a convex
 * polytope by a half-space", builds every piece of every shape mod. No general
 * boolean or CSG code is needed, nor any library that would provide it.
 *
 * Written for this package from the design in
 * `cubesmith-scrambler-plans/plans/unofficial_events_plan/01-drawing-design.md`
 * §4. Clipping a polygon by a plane is the Sutherland–Hodgman step (Sutherland &
 * Hodgman, "Reentrant Polygon Clipping", CACM 1974), applied per face, plus one
 * cap polygon for the new face the plane creates.
 */

export type V3 = readonly [number, number, number];

/** What a face of a piece is: part of the puzzle's outer surface, or a face on a mechanism cut. */
export type FaceTag =
  | { readonly kind: 'outer'; readonly key: string }
  | { readonly kind: 'cut' }
  | { readonly kind: 'bound' };

/** The half-space `normal · x ≤ offset`, with a unit `normal`. */
export interface HalfSpace {
  readonly normal: V3;
  readonly offset: number;
  readonly tag: FaceTag;
}

/** A planar convex polygon, counter-clockwise when seen from outside (from the side `normal` points to). */
export interface Polygon3 {
  readonly points: readonly V3[];
  readonly normal: V3;
  readonly tag: FaceTag;
}

export type Polytope = readonly Polygon3[];

/** Distance below which a point counts as on a plane. Coordinates here are a few units across. */
const EPS = 1e-9;
/** Looser tolerance for merging the vertices a clip creates, which carry rounding from two planes. */
const MERGE = 1e-7;

export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: V3): number => Math.sqrt(dot(a, a));
export function normalize(a: V3): V3 {
  const l = length(a);
  if (l === 0) throw new Error('shape-mod geometry: cannot normalize a zero vector');
  return scale(a, 1 / l);
}

/** `normal · x ≤ offset` with the normal made unit length, so offsets are distances. */
export function halfSpace(normal: V3, offset: number, tag: FaceTag): HalfSpace {
  const l = length(normal);
  return { normal: scale(normal, 1 / l), offset: offset / l, tag };
}

function newell(points: readonly V3[]): V3 {
  let n: V3 = [0, 0, 0];
  for (let i = 0; i < points.length; i += 1) {
    n = add(n, cross(points[i]!, points[(i + 1) % points.length]!));
  }
  return n;
}

/** Twice the signed area vector, by Newell's method: robust for any planar polygon. */
export function polygonArea(polygon: Polygon3): number {
  return length(newell(polygon.points)) / 2;
}

/**
 * Orders coplanar points counter-clockwise around their centroid, as seen from
 * the side `normal` points to. The points must be the vertices of a convex
 * polygon, which is always true of a cap created by clipping a convex polytope.
 */
function orderAround(points: readonly V3[], normal: V3): V3[] {
  const centroid = scale(points.reduce(add, [0, 0, 0] as V3), 1 / points.length);
  const helper: V3 = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(helper, normal));
  const w = cross(normal, u);
  return [...points].sort((a, b) => {
    const da = sub(a, centroid);
    const db = sub(b, centroid);
    return Math.atan2(dot(da, w), dot(da, u)) - Math.atan2(dot(db, w), dot(db, u));
  });
}

function dedupe(points: readonly V3[]): V3[] {
  const kept: V3[] = [];
  for (const p of points) {
    if (!kept.some((q) => length(sub(p, q)) < MERGE)) kept.push(p);
  }
  return kept;
}

/** One Sutherland–Hodgman pass: the part of `polygon` with `normal · x ≤ offset`. */
function clipPolygon(polygon: Polygon3, plane: HalfSpace): Polygon3 | undefined {
  const out: V3[] = [];
  const { points } = polygon;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const da = dot(plane.normal, a) - plane.offset;
    const db = dot(plane.normal, b) - plane.offset;
    if (da <= EPS) out.push(a);
    if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) {
      const t = da / (da - db);
      out.push(add(a, scale(sub(b, a), t)));
    }
  }
  const merged = dedupe(out);
  return merged.length >= 3 ? { points: merged, normal: polygon.normal, tag: polygon.tag } : undefined;
}

/**
 * The part of a convex polytope inside a half-space, closed by a cap on the
 * plane. An empty array means nothing of the polytope is inside.
 */
export function clipPolytope(polytope: Polytope, plane: HalfSpace): Polygon3[] {
  const kept = polytope
    .map((polygon) => clipPolygon(polygon, plane))
    .filter((polygon): polygon is Polygon3 => polygon !== undefined && polygonArea(polygon) > EPS);
  if (kept.length === 0) return [];

  // A face already lying on the plane needs no cap: the plane cuts nothing off there.
  const coplanar = kept.some(
    (polygon) =>
      dot(polygon.normal, plane.normal) > 1 - EPS &&
      Math.abs(dot(plane.normal, polygon.points[0]!) - plane.offset) < MERGE,
  );
  if (coplanar) return kept;

  const onPlane = dedupe(
    kept.flatMap((polygon) =>
      polygon.points.filter((p) => Math.abs(dot(plane.normal, p) - plane.offset) < MERGE),
    ),
  );
  if (onPlane.length >= 3) {
    const cap: Polygon3 = { points: orderAround(onPlane, plane.normal), normal: plane.normal, tag: plane.tag };
    if (polygonArea(cap) > EPS) kept.push(cap);
  }
  return kept;
}

/** An axis-aligned cube `[-h, h]³`, every face tagged `bound`, wound counter-clockwise from outside. */
function boundingBox(h: number): Polygon3[] {
  const faces: Polygon3[] = [];
  for (let axis = 0; axis < 3; axis += 1) {
    for (const sign of [1, -1] as const) {
      const normal = [0, 0, 0] as [number, number, number];
      normal[axis] = sign;
      const u = (axis + 1) % 3;
      const w = (axis + 2) % 3;
      const corner = (cu: number, cw: number): V3 => {
        const p = [0, 0, 0] as [number, number, number];
        p[axis] = sign * h;
        p[u] = cu * h;
        p[w] = cw * h;
        return p;
      };
      faces.push({
        points: orderAround([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], normal),
        normal,
        tag: { kind: 'bound' },
      });
    }
  }
  return faces;
}

/** How far the starting box reaches. Every solid here fits in a few units. */
const BOUND = 50;

/**
 * The intersection of half-spaces, as a polytope. Throws if the result is
 * unbounded (a face of the starting box survives), because that means a
 * puzzle's outer solid is missing a face, and drawing it would show the box.
 */
export function intersectHalfSpaces(halfSpaces: readonly HalfSpace[]): Polygon3[] {
  let polytope: Polygon3[] = boundingBox(BOUND);
  for (const plane of halfSpaces) {
    polytope = clipPolytope(polytope, plane);
    if (polytope.length === 0) return [];
  }
  if (polytope.some((polygon) => polygon.tag.kind === 'bound')) {
    throw new Error('shape-mod geometry: the half-spaces do not bound a finite solid');
  }
  return polytope;
}

/** Volume by the divergence theorem: the sum of `(normal · p₀) · area / 3` over the faces. */
export function polytopeVolume(polytope: Polytope): number {
  return polytope.reduce(
    (sum, polygon) => sum + (dot(polygon.normal, polygon.points[0]!) * polygonArea(polygon)) / 3,
    0,
  );
}

/** Every vertex of the polytope (with repeats across faces). */
export function polytopeVertices(polytope: Polytope): V3[] {
  return polytope.flatMap((polygon) => [...polygon.points]);
}
