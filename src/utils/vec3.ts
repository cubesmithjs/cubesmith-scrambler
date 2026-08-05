/**
 * Integer 3-vectors and the one rotation the corner-turning puzzles need.
 *
 * Both the Pyraminx and the Skewb turn about a *body diagonal* by 120°, and
 * both put every piece position on the integer lattice: a regular
 * tetrahedron's four vertices are four alternate corners of a cube, and a
 * Skewb is a cube outright. That combination is what lets this module stay
 * exact — no floating point, no epsilon, and piece lookup by plain equality.
 *
 * The face-turning puzzles' 90° rotations live here too, but as a separate
 * function rather than a generalised "rotate by any angle": they are three
 * signed coordinate swaps and share no code with the 120° case, and pretending
 * otherwise would fit neither well.
 */

import type { Face } from '../notation/move';

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
/**
 * A 90° clockwise rotation of `v`, viewed from outside `face` — one quarter
 * turn of that face in the WCA sense.
 *
 * Derived once per axis from the standard right-hand-rule rotation matrices,
 * using the fact that "clockwise viewed from the positive end of an axis
 * looking toward the origin" is always the *negative*-angle rotation in the
 * right-hand convention, and its mirror (the negative end of the axis) is
 * always the positive-angle rotation. Applied uniformly to all six faces
 * rather than re-derived ad hoc per face — the same reasoning
 * `rotate120` documents for body diagonals.
 *
 * This rotates the whole of space. Restricting a turn to the layers it
 * actually moves is the caller's job; see `puzzles/333/geometry.ts` and
 * `puzzles/nxn/geometry.ts`, which gate on different conditions.
 */
export function rotateQuarter(face: Face, [x, y, z]: Vec3): Vec3 {
  switch (face) {
    case 'U':
      return [-z, y, x];
    case 'D':
      return [z, y, -x];
    case 'F':
      return [y, -x, z];
    case 'B':
      return [-y, x, z];
    case 'R':
      return [x, z, -y];
    case 'L':
      return [x, -z, y];
  }
}

/** The axis a face turns about, as an index into a `Vec3`, and which end of it the face is. */
export const FACE_AXIS: Readonly<Record<Face, { readonly index: 0 | 1 | 2; readonly sign: 1 | -1 }>> =
  {
    U: { index: 1, sign: 1 },
    D: { index: 1, sign: -1 },
    F: { index: 2, sign: 1 },
    B: { index: 2, sign: -1 },
    R: { index: 0, sign: 1 },
    L: { index: 0, sign: -1 },
  };

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
