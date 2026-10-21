import { describe, expect, it } from 'vitest';
import {
  clipPolytope,
  dot,
  halfSpace,
  intersectHalfSpaces,
  normalize,
  polygonArea,
  polytopeVertices,
  polytopeVolume,
  type HalfSpace,
} from './geometry';

const cut = { kind: 'cut' } as const;
const outer = (key: string) => ({ kind: 'outer', key }) as const;

function box(h: number): HalfSpace[] {
  return [
    halfSpace([1, 0, 0], h, outer('R')),
    halfSpace([-1, 0, 0], h, outer('L')),
    halfSpace([0, 1, 0], h, outer('U')),
    halfSpace([0, -1, 0], h, outer('D')),
    halfSpace([0, 0, 1], h, outer('F')),
    halfSpace([0, 0, -1], h, outer('B')),
  ];
}

describe('shape-mod geometry kernel', () => {
  it('builds a cube with six square faces and the right volume', () => {
    const cube = intersectHalfSpaces(box(1.5));
    expect(cube).toHaveLength(6);
    expect(polytopeVolume(cube)).toBeCloseTo(27, 9);
    for (const face of cube) {
      expect(face.points).toHaveLength(4);
      expect(polygonArea(face)).toBeCloseTo(9, 9);
    }
  });

  it('winds every face counter-clockwise as seen from outside', () => {
    for (const face of intersectHalfSpaces([...box(1), halfSpace([1, 1, 1], 1.2, cut)])) {
      const [a, b, c] = face.points as unknown as [readonly number[], readonly number[], readonly number[]];
      const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!] as const;
      const ac = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!] as const;
      const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]] as const;
      expect(dot(n, face.normal)).toBeGreaterThan(0);
    }
  });

  it('cuts a corner off with one cap, tagged as the cutting plane', () => {
    const plane = halfSpace([1, 1, 1], 2, cut);
    const solid = intersectHalfSpaces([...box(1), plane]);
    const cap = solid.filter((face) => face.tag.kind === 'cut');
    expect(cap).toHaveLength(1);
    expect(cap[0]!.points).toHaveLength(3);
    // The cut-off corner is a right tetrahedron with legs of 1: volume 1/6.
    expect(polytopeVolume(solid)).toBeCloseTo(8 - 1 / 6, 9);
  });

  it('builds a regular tetrahedron from four half-spaces', () => {
    const a = 2;
    const tetra = intersectHalfSpaces(
      ([[-1, -1, -1], [1, -1, 1], [-1, 1, 1], [1, 1, -1]] as const).map((n) => halfSpace(n, a, outer('T'))),
    );
    expect(tetra).toHaveLength(4);
    // Vertices at alternate corners of [-a, a]³: volume (2a)³ / 3.
    expect(polytopeVolume(tetra)).toBeCloseTo((2 * a) ** 3 / 3, 9);
    for (const v of polytopeVertices(tetra)) expect(Math.abs(Math.abs(v[0]) - a)).toBeLessThan(1e-9);
  });

  it('returns nothing when the half-space misses the solid, and keeps a face already on the plane', () => {
    const cube = intersectHalfSpaces(box(1));
    expect(clipPolytope(cube, halfSpace([1, 0, 0], -2, cut))).toEqual([]);
    const same = clipPolytope(cube, halfSpace([1, 0, 0], 1, cut));
    expect(same).toHaveLength(6);
    expect(same.filter((face) => face.tag.kind === 'cut')).toHaveLength(0);
  });

  it('refuses an unbounded intersection, which would draw the starting box', () => {
    expect(() => intersectHalfSpaces([halfSpace([1, 0, 0], 1, cut)])).toThrow(/finite solid/);
  });

  it('normalises plane offsets with their normals', () => {
    const plane = halfSpace([0, 3, 4], 10, cut);
    expect(plane.offset).toBeCloseTo(2, 12);
    expect(plane.normal).toEqual(normalize([0, 3, 4]));
    expect(() => normalize([0, 0, 0])).toThrow();
  });
});
