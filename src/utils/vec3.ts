/**
 * Integer 3-vectors and the one rotation the corner-turning puzzles need.
 *
 * Both the Pyraminx and the Skewb turn about a *body diagonal* by 120°, and
 * both put every piece position on the integer lattice: a regular
 * tetrahedron's four vertices are four alternate corners of a cube, and a
 * Skewb is a cube outright. That combination is what lets this module stay
 * exact — no floating point, no epsilon, and piece lookup by plain equality.
 *
 * (The face-turning puzzles under `puzzles/333/` do their own 90° rotations
 * about coordinate axes. Those are a different, simpler family — three
 * signed coordinate swaps — and are kept there rather than generalised into
 * a single "rotation" abstraction that would fit neither case well.)
 */

export type Vec3 = readonly [number, number, number];

export function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vecNegate(a: Vec3): Vec3 {
  return [-a[0], -a[1], -a[2]];
}

export function vecHalve(a: Vec3): Vec3 {
  return [a[0] / 2, a[1] / 2, a[2] / 2];
}

export function vecDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vecCross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function vecEquals(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** A total order on vectors. Used only to pick a reference sticker deterministically, never for geometry. */
export function vecLess(a: Vec3, b: Vec3): boolean {
  if (a[0] !== b[0]) return a[0] < b[0];
  if (a[1] !== b[1]) return a[1] < b[1];
  return a[2] < b[2];
}

export function vecKey(a: Vec3): string {
  return a.join(',');
}

/**
 * Rotates `v` by 120° about the axis through the origin and `axis`, where
 * `axis` has all components ±1 (a cube body diagonal, so `|axis|² = 3`).
 *
 * Substituting `cos 120° = -1/2`, `sin 120° = ±√3/2` and `n = axis/√3` into
 * Rodrigues' rotation formula makes every irrational factor cancel:
 *
 * ```
 *   v' = ( -v + axis(axis·v) ± (axis × v) ) / 2
 * ```
 *
 * `sign = 1` is the right-hand-rule rotation (counterclockwise viewed from
 * outside the axis end); `sign = -1` is clockwise viewed from outside, which
 * is what a plain letter means in both Pyraminx and Skewb notation. That
 * matches the convention `puzzles/333/geometry.ts` documents for cube faces,
 * where a clockwise face turn is likewise the *negative*-angle rotation
 * about that face's outward axis.
 *
 * Throws if the result leaves the integer lattice, which can only happen if
 * `axis` isn't a body diagonal — a cheap guard against silently producing
 * half-integer positions that would then fail to match any piece.
 */
export function rotate120(axis: Vec3, v: Vec3, sign: 1 | -1): Vec3 {
  const d = vecDot(axis, v);
  const c = vecCross(axis, v);
  const out: Vec3 = [
    (-v[0] + axis[0] * d + sign * c[0]) / 2,
    (-v[1] + axis[1] * d + sign * c[1]) / 2,
    (-v[2] + axis[2] * d + sign * c[2]) / 2,
  ];
  if (!out.every(Number.isInteger)) {
    throw new Error(
      `vec3: rotating [${v.join(',')}] about [${axis.join(',')}] left the integer lattice`,
    );
  }
  return out;
}
