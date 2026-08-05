import { describe, expect, it } from 'vitest';
import {
  rotate120,
  vecAdd,
  vecCross,
  vecDot,
  vecEquals,
  vecHalve,
  vecKey,
  vecLess,
  vecNegate,
  type Vec3,
} from './vec3';

const BODY_DIAGONALS: readonly Vec3[] = [
  [1, 1, 1],
  [1, 1, -1],
  [1, -1, 1],
  [1, -1, -1],
  [-1, 1, 1],
  [-1, 1, -1],
  [-1, -1, 1],
  [-1, -1, -1],
];

const CUBE_FACE_CENTERS: readonly Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

describe('vector helpers', () => {
  it('add, negate, halve', () => {
    expect(vecAdd([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
    expect(vecNegate([1, -2, 3])).toEqual([-1, 2, -3]);
    expect(vecHalve([2, -4, 6])).toEqual([1, -2, 3]);
  });

  it('dot and cross obey the identities that matter here', () => {
    expect(vecDot([1, 2, 3], [4, 5, 6])).toBe(32);
    // a x b is perpendicular to both, and anti-commutative.
    const a: Vec3 = [1, -2, 3];
    const b: Vec3 = [4, 5, -6];
    const c = vecCross(a, b);
    expect(vecDot(c, a)).toBe(0);
    expect(vecDot(c, b)).toBe(0);
    expect(vecCross(b, a)).toEqual(vecNegate(c));
  });

  it('equals, key, and the total order', () => {
    expect(vecEquals([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(vecEquals([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(vecKey([1, -2, 3])).toBe('1,-2,3');
    expect(vecLess([0, 0, 0], [1, 0, 0])).toBe(true);
    expect(vecLess([1, 0, 0], [1, 1, 0])).toBe(true);
    expect(vecLess([1, 1, 0], [1, 1, 1])).toBe(true);
    expect(vecLess([1, 1, 1], [1, 1, 1])).toBe(false);
    expect(vecLess([1, 1, 1], [0, 9, 9])).toBe(false);
  });
});

describe('rotate120', () => {
  it('has order 3 about every body diagonal, in both directions', () => {
    for (const axis of BODY_DIAGONALS) {
      for (const sign of [1, -1] as const) {
        for (const v of [...BODY_DIAGONALS, ...CUBE_FACE_CENTERS]) {
          let p: Vec3 = v;
          for (let i = 0; i < 3; i += 1) p = rotate120(axis, p, sign);
          expect(p).toEqual(v);
        }
      }
    }
  });

  it('the two signs are inverses', () => {
    for (const axis of BODY_DIAGONALS) {
      for (const v of CUBE_FACE_CENTERS) {
        expect(rotate120(axis, rotate120(axis, v, 1), -1)).toEqual(v);
      }
    }
  });

  it('fixes its own axis and preserves length', () => {
    for (const axis of BODY_DIAGONALS) {
      expect(rotate120(axis, axis, 1)).toEqual(axis);
      for (const v of [...BODY_DIAGONALS, ...CUBE_FACE_CENTERS]) {
        expect(vecDot(rotate120(axis, v, 1), rotate120(axis, v, 1))).toBe(vecDot(v, v));
      }
    }
  });

  it('permutes the cube face centers and the cube corners among themselves', () => {
    for (const axis of BODY_DIAGONALS) {
      const centers = CUBE_FACE_CENTERS.map((v) => vecKey(rotate120(axis, v, -1)));
      expect(new Set(centers)).toEqual(new Set(CUBE_FACE_CENTERS.map(vecKey)));
      const corners = BODY_DIAGONALS.map((v) => vecKey(rotate120(axis, v, -1)));
      expect(new Set(corners)).toEqual(new Set(BODY_DIAGONALS.map(vecKey)));
    }
  });

  it('+120° about (1,1,1) cycles the coordinate axes x → y → z', () => {
    // The one concrete anchor for the sign convention: the right-hand-rule
    // rotation about the (1,1,1) diagonal is the one that sends x̂ to ŷ.
    expect(rotate120([1, 1, 1], [1, 0, 0], 1)).toEqual([0, 1, 0]);
    expect(rotate120([1, 1, 1], [0, 1, 0], 1)).toEqual([0, 0, 1]);
    expect(rotate120([1, 1, 1], [0, 0, 1], 1)).toEqual([1, 0, 0]);
  });

  it('rejects an axis that is not a body diagonal, rather than silently leaving the lattice', () => {
    expect(() => rotate120([1, 0, 0], [0, 1, 0], 1)).toThrow(/integer lattice/);
    expect(() => rotate120([2, 2, 2], [0, 1, 0], 1)).toThrow(/integer lattice/);
  });
});
