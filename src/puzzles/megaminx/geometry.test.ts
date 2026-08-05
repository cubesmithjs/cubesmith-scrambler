import { describe, expect, it } from 'vitest';
import {
  CORNER_COUNT_MINX,
  CORNER_POSITIONS_MINX,
  cornerFaceCycle,
  cornerOnFace,
  deriveMoveTableMinx,
  distance,
  EDGE_COUNT_MINX,
  EDGE_POSITIONS_MINX,
  edgeOnFace,
  edgeReferenceFace,
  FACE_CENTERS,
  FACE_COUNT_MINX,
  facesAtCorner,
  facesAtEdge,
  L_FACE,
  positionKey,
  rotateFifths,
  sharesAnEdgeWith,
  TOLERANCE,
  U_FACE,
  type Vec3f,
} from './geometry';

describe('the dodecahedron is built, not listed', () => {
  it('has 12 faces, 20 corners and 30 edges', () => {
    expect(FACE_COUNT_MINX).toBe(12);
    expect(CORNER_COUNT_MINX).toBe(20);
    expect(EDGE_COUNT_MINX).toBe(30);
  });

  it('satisfies Euler’s formula', () => {
    expect(CORNER_COUNT_MINX - EDGE_COUNT_MINX + FACE_COUNT_MINX).toBe(2);
  });

  it('every position is distinct', () => {
    for (const positions of [FACE_CENTERS, CORNER_POSITIONS_MINX, EDGE_POSITIONS_MINX]) {
      expect(new Set(positions.map(positionKey)).size).toBe(positions.length);
    }
  });

  it('all corners are equidistant from the centre, and so are all faces, and all edges', () => {
    for (const positions of [FACE_CENTERS, CORNER_POSITIONS_MINX, EDGE_POSITIONS_MINX]) {
      const radii = positions.map((p) => Math.hypot(...p));
      expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(TOLERANCE);
    }
  });

  /**
   * The property that pins down which cyclic coordinate family the face
   * centers come from. With the wrong one, a "face" has a single nearest
   * vertex rather than five coplanar ones — and everything downstream would
   * be quietly modelling something that isn't a dodecahedron.
   */
  it('every face has exactly five corners and five edges, all at one distance from it', () => {
    for (const face of FACE_CENTERS) {
      const corners = CORNER_POSITIONS_MINX.filter((p) => cornerOnFace(face, p));
      const edges = EDGE_POSITIONS_MINX.filter((p) => edgeOnFace(face, p));
      expect(corners).toHaveLength(5);
      expect(edges).toHaveLength(5);

      const cornerDistances = corners.map((p) => distance(p, face));
      expect(Math.max(...cornerDistances) - Math.min(...cornerDistances)).toBeLessThan(TOLERANCE);
    }
  });

  it('every corner is on 3 faces and every edge on 2', () => {
    for (const p of CORNER_POSITIONS_MINX) expect(facesAtCorner(p)).toHaveLength(3);
    for (const p of EDGE_POSITIONS_MINX) expect(facesAtEdge(p)).toHaveLength(2);
  });

  it('every face has exactly five neighbours', () => {
    for (const face of FACE_CENTERS) {
      const neighbours = FACE_CENTERS.filter(
        (other) => positionKey(other) !== positionKey(face) && sharesAnEdgeWith(face, other),
      );
      expect(neighbours).toHaveLength(5);
    }
  });
});

/**
 * The tolerance argument the module makes, measured rather than asserted:
 * nearest-match lookup is only sound if distinct positions are far apart
 * compared to floating-point error.
 */
describe('the float tolerance has an enormous margin', () => {
  const closest = (positions: readonly Vec3f[]): number => {
    let min = Infinity;
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        min = Math.min(min, distance(positions[i]!, positions[j]!));
      }
    }
    return min;
  };

  it('the closest two distinct positions of a kind are at least 1 apart, against a 1e-6 tolerance', () => {
    // Measured: faces 2, corners 2/φ ≈ 1.236, edges exactly 1. The tightest
    // of those is still six orders of magnitude above the tolerance.
    expect(closest(FACE_CENTERS)).toBeCloseTo(2, 9);
    expect(closest(CORNER_POSITIONS_MINX)).toBeCloseTo(2 * (Math.sqrt(5) - 1) / 2, 9);
    expect(closest(EDGE_POSITIONS_MINX)).toBeCloseTo(1, 9);
    expect(TOLERANCE).toBeLessThan(1e-5);
  });

  it('a full turn returns every position to within 1e-12 — six orders inside the tolerance', () => {
    let worst = 0;
    for (const axis of FACE_CENTERS) {
      for (const p of [...CORNER_POSITIONS_MINX, ...EDGE_POSITIONS_MINX, ...FACE_CENTERS]) {
        let q: Vec3f = p;
        for (let i = 0; i < 5; i += 1) q = rotateFifths(axis, q, 1);
        worst = Math.max(worst, distance(q, p));
      }
    }
    expect(worst).toBeLessThan(1e-12);
  });
});

describe('rotateFifths', () => {
  it('has order 5 about every face axis', () => {
    for (const axis of FACE_CENTERS) {
      for (const p of CORNER_POSITIONS_MINX) {
        let q: Vec3f = p;
        for (let i = 0; i < 5; i += 1) q = rotateFifths(axis, q, 1);
        expect(distance(q, p)).toBeLessThan(TOLERANCE);
      }
    }
  });

  it('fixes its own axis and permutes each kind of position among itself', () => {
    for (const axis of FACE_CENTERS) {
      expect(distance(rotateFifths(axis, axis, 1), axis)).toBeLessThan(TOLERANCE);
      for (const positions of [FACE_CENTERS, CORNER_POSITIONS_MINX, EDGE_POSITIONS_MINX]) {
        const images = positions.map((p) => positionKey(rotateFifths(axis, p, 1)));
        expect(new Set(images).size).toBe(positions.length);
      }
    }
  });

  it('opposite amounts undo each other', () => {
    for (const axis of FACE_CENTERS) {
      for (const p of EDGE_POSITIONS_MINX) {
        expect(distance(rotateFifths(axis, rotateFifths(axis, p, 2), -2), p)).toBeLessThan(
          TOLERANCE,
        );
      }
    }
  });

  it('a third of a turn about a corner is a symmetry, which is what defines the corner cycle', () => {
    for (const p of CORNER_POSITIONS_MINX) {
      const cycle = cornerFaceCycle(p);
      expect(new Set(cycle.map(positionKey)).size).toBe(3);
      // The cycle must be the three faces at that corner, in some order.
      const at = new Set(facesAtCorner(p).map(positionKey));
      for (const face of cycle) expect(at.has(positionKey(face))).toBe(true);
      // And a third turn must close it.
      expect(distance(rotateFifths(p, cycle[2], 5 / 3), cycle[0])).toBeLessThan(TOLERANCE);
    }
  });

  it('an edge’s reference face is one of its own two', () => {
    for (const p of EDGE_POSITIONS_MINX) {
      const reference = edgeReferenceFace(p);
      expect(facesAtEdge(p).map(positionKey)).toContain(positionKey(reference));
    }
  });
});

describe('U and L', () => {
  it('are adjacent — the only constraint Pochmann notation puts on them', () => {
    expect(positionKey(U_FACE)).not.toBe(positionKey(L_FACE));
    expect(sharesAnEdgeWith(U_FACE, L_FACE)).toBe(true);
  });
});

describe('deriveMoveTableMinx', () => {
  it('an on-layer turn moves the face’s 5 corners, 5 edges and 1 center, and nothing else', () => {
    const table = deriveMoveTableMinx(U_FACE, -1, 'on-layer');
    expect(table.cornerDestination.filter((d, i) => d !== i)).toHaveLength(5);
    expect(table.edgeDestination.filter((d, i) => d !== i)).toHaveLength(5);
    // The face's own center is on its axis, so it stays put even though it is
    // "on the layer" — that's why the count here is 0, not 1.
    expect(table.centerDestination.filter((d, i) => d !== i)).toHaveLength(0);
  });

  it('an off-layer turn moves everything the held layer does not contain', () => {
    const table = deriveMoveTableMinx(U_FACE, 2, 'off-layer');
    expect(table.cornerDestination.filter((d, i) => d !== i)).toHaveLength(
      CORNER_COUNT_MINX - 5,
    );
    expect(table.edgeDestination.filter((d, i) => d !== i)).toHaveLength(EDGE_COUNT_MINX - 5);
    // Ten of the twelve centers change place. Two don't: the held face's own,
    // and the *opposite* face's — which is off the held layer and so does
    // turn, but sits on the rotation axis and therefore spins in place.
    expect(table.centerDestination.filter((d, i) => d !== i)).toHaveLength(FACE_COUNT_MINX - 2);
  });

  it('every destination array is a permutation', () => {
    for (const spec of [
      [U_FACE, -1, 'on-layer'],
      [U_FACE, 2, 'off-layer'],
      [L_FACE, 2, 'off-layer'],
    ] as const) {
      const table = deriveMoveTableMinx(spec[0], spec[1], spec[2]);
      expect(new Set(table.cornerDestination).size).toBe(CORNER_COUNT_MINX);
      expect(new Set(table.edgeDestination).size).toBe(EDGE_COUNT_MINX);
      expect(new Set(table.centerDestination).size).toBe(FACE_COUNT_MINX);
    }
  });

  it('twists and flips are in range', () => {
    const table = deriveMoveTableMinx(L_FACE, 2, 'off-layer');
    expect(table.cornerTwist.every((t) => t >= 0 && t <= 2)).toBe(true);
    expect(table.edgeFlip.every((f) => f === 0 || f === 1)).toBe(true);
  });
});
