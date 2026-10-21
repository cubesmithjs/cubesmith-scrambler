import { describe, expect, it } from 'vitest';
import { vecCross, vecDot, vecEquals, vecNegate, type Vec3 } from '../../utils/vec3';
import {
  BLOCK_CORNER_INDEX,
  CENTRE_A_POSITIONS,
  CENTRE_B_POSITIONS,
  CORNER_PLUS_FACES,
  CORNER_POSITIONS_FTO,
  deriveFaceletTurn,
  deriveTurnTableFto,
  EDGE_POSITIONS_FTO,
  FACE_NORMALS,
  FACELETS_FTO,
  faceParity,
} from './geometry';
import { FTO_FACES, type FtoFace } from './notation';

const n = (face: FtoFace): Vec3 => FACE_NORMALS[face];
/** Normals differing in exactly `k` signs: 1 = share an edge, 2 = share a vertex only, 3 = opposite. */
const signDifferences = (a: FtoFace, b: FtoFace): number =>
  [0, 1, 2].filter((i) => n(a)[i] !== n(b)[i]).length;

const verticesOf = (face: FtoFace): Vec3[] =>
  CORNER_POSITIONS_FTO.filter((v) => vecDot(v, n(face)) > 0);

describe('the faces', () => {
  it('are the eight body diagonals, once each', () => {
    const keys = new Set(FTO_FACES.map((f) => n(f).join(',')));
    expect(keys.size).toBe(8);
    for (const f of FTO_FACES) expect(n(f).every((c) => Math.abs(c) === 1)).toBe(true);
  });

  it('meet as the notation says: U F R L at one vertex, B D BR BL at the other', () => {
    for (const f of ['U', 'F', 'R', 'L'] as const) {
      expect(verticesOf(f).some((v) => vecEquals(v, [0, 0, 1])), f).toBe(true);
    }
    for (const f of ['B', 'D', 'BR', 'BL'] as const) {
      expect(verticesOf(f).some((v) => vecEquals(v, [0, 0, -1])), f).toBe(true);
    }
    expect(CORNER_POSITIONS_FTO[BLOCK_CORNER_INDEX]).toEqual([0, 0, -1]);
  });

  it('pairs opposites as U–D, F–B, R–BL, L–BR', () => {
    for (const [a, b] of [['U', 'D'], ['F', 'B'], ['R', 'BL'], ['L', 'BR']] as const) {
      expect(n(a)).toEqual(vecNegate(n(b)));
    }
  });

  it('shares an edge between U–R and F–D, and only a vertex between U–F and BR–BL', () => {
    expect(signDifferences('U', 'R')).toBe(1);
    expect(signDifferences('F', 'D')).toBe(1);
    expect(signDifferences('U', 'F')).toBe(2);
    expect(signDifferences('BR', 'BL')).toBe(2);
  });

  it('swaps U with L and F with R under a mirror in x — the symmetry the notation names', () => {
    const mirror = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
    expect(mirror(n('U'))).toEqual(n('L'));
    expect(mirror(n('F'))).toEqual(n('R'));
  });

  /**
   * The one thing adjacency cannot fix: a mirror image of this whole table
   * satisfies every relation above. Holding the puzzle with `U` up and `F` in
   * front pins it — `R` must be on the viewer's right.
   */
  it('puts R on the right and L on the left, with U up and F in front', () => {
    const up = n('U');
    const f = n('F');
    // F's direction with its vertical component removed: where the viewer stands.
    const scale = vecDot(f, up) / vecDot(up, up);
    const toViewer: Vec3 = [f[0] - scale * up[0], f[1] - scale * up[1], f[2] - scale * up[2]];
    const right = vecCross(up, toViewer);
    expect(vecDot(n('R'), right)).toBeGreaterThan(0);
    expect(vecDot(n('L'), right)).toBeLessThan(0);
  });

  it('splits into two parities, U F BR BL against R L B D', () => {
    expect(FTO_FACES.filter((f) => faceParity(n(f)) === 1)).toEqual(['U', 'F', 'BR', 'BL']);
    expect(FTO_FACES.filter((f) => faceParity(n(f)) === -1)).toEqual(['R', 'L', 'B', 'D']);
  });
});

describe('the pieces', () => {
  it('number 6 corners, 12 edges and two orbits of 12 centres', () => {
    expect(CORNER_POSITIONS_FTO).toHaveLength(6);
    expect(EDGE_POSITIONS_FTO).toHaveLength(12);
    expect(CENTRE_A_POSITIONS).toHaveLength(12);
    expect(CENTRE_B_POSITIONS).toHaveLength(12);
    expect(CENTRE_A_POSITIONS.every((c) => faceParity(c.normal) === 1)).toBe(true);
    expect(CENTRE_B_POSITIONS.every((c) => faceParity(c.normal) === -1)).toBe(true);
  });

  it('gives every corner exactly two + faces to be oriented by', () => {
    CORNER_PLUS_FACES.forEach((pair, i) => {
      for (const face of pair) {
        expect(faceParity(face)).toBe(1);
        expect(vecDot(face, CORNER_POSITIONS_FTO[i]!)).toBeGreaterThan(0);
      }
    });
  });

  it('lays 72 stickers, nine per face, each on the face it names', () => {
    expect(FACELETS_FTO).toHaveLength(72);
    for (const face of FTO_FACES) {
      const mine = FACELETS_FTO.filter((f) => f.face === face);
      expect(mine).toHaveLength(9);
      for (const facelet of mine) expect(vecDot(facelet.point, n(face))).toBe(9);
    }
  });
});

describe('a face turn', () => {
  it.each(FTO_FACES)('%s moves 3 corners, 3 edges, 9 centres and 27 stickers', (face) => {
    const t = deriveTurnTableFto(face);
    const moved = (d: readonly number[]): number => d.filter((x, i) => x !== i).length;
    expect(moved(t.cornerDestination)).toBe(3);
    expect(moved(t.edgeDestination)).toBe(3);
    expect(moved(t.centreADestination) + moved(t.centreBDestination)).toBe(9);
    expect(moved(deriveFaceletTurn(face))).toBe(27);
  });

  /**
   * Clockwise as seen looking at the face: from outside, a plain letter carries
   * each neighbouring face's strip one step clockwise, which is a *negative*
   * rotation about the outward normal.
   */
  it.each(FTO_FACES)('%s turns clockwise seen from outside', (face) => {
    const t = deriveFaceletTurn(face);
    const axis = n(face);
    for (let i = 0; i < FACELETS_FTO.length; i += 1) {
      if (t[i] === i) continue;
      const from = FACELETS_FTO[i]!.point;
      const to = FACELETS_FTO[t[i]!]!.point;
      expect(vecDot(vecCross(from, to), axis)).toBeLessThan(0);
    }
  });
});
