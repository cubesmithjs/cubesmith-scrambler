import { describe, expect, it } from 'vitest';
import { PYRAMINX_VERTICES, type PyraminxVertex } from './notation';
import {
  deriveTurnTable,
  EDGE_NAMES,
  EDGE_POSITIONS,
  EDGE_VERTEX_PAIRS,
  rotate120,
  VERTEX_POSITIONS,
  type Vec3,
} from './geometry';

describe('the cube-corner embedding of the tetrahedron', () => {
  it('places all four vertices on distinct alternate cube corners', () => {
    const seen = new Set(PYRAMINX_VERTICES.map((v) => VERTEX_POSITIONS[v].join(',')));
    expect(seen.size).toBe(4);
    for (const v of PYRAMINX_VERTICES) {
      expect(VERTEX_POSITIONS[v].every((c) => c === 1 || c === -1)).toBe(true);
    }
  });

  it('is regular: all six vertex-pair distances are equal', () => {
    const squaredDistances = EDGE_VERTEX_PAIRS.map(([a, b]) => {
      const p = VERTEX_POSITIONS[a];
      const q = VERTEX_POSITIONS[b];
      return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
    });
    expect(new Set(squaredDistances).size).toBe(1);
  });

  it('puts the six edge midpoints exactly on the six cube face centers', () => {
    const expected = new Set(
      ['1,0,0', '-1,0,0', '0,1,0', '0,-1,0', '0,0,1', '0,0,-1'],
    );
    const actual = new Set(EDGE_POSITIONS.map((p) => p.join(',')));
    expect(actual).toEqual(expected);
  });

  it('names the six edges in PYRAMINX_VERTICES pair order', () => {
    expect(EDGE_NAMES).toEqual(['UL', 'UR', 'UB', 'LR', 'LB', 'RB']);
  });
});

describe('rotate120', () => {
  it('has order 3 on every vertex position, for both signs', () => {
    for (const axisName of PYRAMINX_VERTICES) {
      const axis = VERTEX_POSITIONS[axisName];
      for (const sign of [1, -1] as const) {
        for (const v of PYRAMINX_VERTICES) {
          let p: Vec3 = VERTEX_POSITIONS[v];
          for (let i = 0; i < 3; i += 1) p = rotate120(axis, p, sign);
          expect(p).toEqual(VERTEX_POSITIONS[v]);
        }
      }
    }
  });

  it('fixes its own axis and permutes the other three vertices', () => {
    for (const axisName of PYRAMINX_VERTICES) {
      const axis = VERTEX_POSITIONS[axisName];
      expect(rotate120(axis, axis, -1)).toEqual(axis);
      const moved = PYRAMINX_VERTICES.filter((v) => v !== axisName).map((v) =>
        rotate120(axis, VERTEX_POSITIONS[v], -1).join(','),
      );
      expect(new Set(moved).size).toBe(3);
      expect(moved).not.toContain(axis.join(','));
    }
  });

  it('the two signs are inverses of each other', () => {
    for (const axisName of PYRAMINX_VERTICES) {
      const axis = VERTEX_POSITIONS[axisName];
      for (const p of EDGE_POSITIONS) {
        expect(rotate120(axis, rotate120(axis, p, -1), 1)).toEqual(p);
      }
    }
  });
});

/**
 * The chirality check the module doc comment promises: WCA holds a Pyraminx
 * with `U` up and `L`/`R`/`B` front-left/front-right/back, so looking down
 * at `U` from outside, a clockwise turn sends B → R → L → B. A mirrored
 * labeling would satisfy every other test in this file and still produce the
 * mirror image of every scramble, so this is asserted directly.
 */
describe('the labeling matches the real puzzle rather than its mirror image', () => {
  it('a clockwise U turn cycles B → R → L → B', () => {
    const axis = VERTEX_POSITIONS.U;
    const at = (v: PyraminxVertex) => rotate120(axis, VERTEX_POSITIONS[v], -1).join(',');
    expect(at('B')).toBe(VERTEX_POSITIONS.R.join(','));
    expect(at('R')).toBe(VERTEX_POSITIONS.L.join(','));
    expect(at('L')).toBe(VERTEX_POSITIONS.B.join(','));
  });
});

describe('deriveTurnTable', () => {
  it('moves exactly the three edges touching its vertex', () => {
    for (const vertex of PYRAMINX_VERTICES) {
      const table = deriveTurnTable(vertex);
      const moved = table.edgeDestination
        .map((dest, i) => (dest === i ? null : i))
        .filter((i): i is number => i !== null);
      expect(moved).toHaveLength(3);
      for (const i of moved) {
        expect(EDGE_VERTEX_PAIRS[i]!).toContain(vertex);
      }
    }
  });

  it('flips exactly two of its three moved edges — which is what forces the turn to have order 3', () => {
    for (const vertex of PYRAMINX_VERTICES) {
      const table = deriveTurnTable(vertex);
      const flips = table.edgeFlip.reduce((a, b) => a + b, 0);
      expect(flips).toBe(2);
      expect(flips % 2).toBe(0);
    }
  });

  it('twists only its own axial piece, by exactly one', () => {
    for (const vertex of PYRAMINX_VERTICES) {
      const table = deriveTurnTable(vertex);
      expect(table.axialTwist.reduce((a, b) => a + b, 0)).toBe(1);
      expect(table.axialTwist[PYRAMINX_VERTICES.indexOf(vertex)]).toBe(1);
    }
  });

  it('every edge destination is a permutation of the six slots', () => {
    for (const vertex of PYRAMINX_VERTICES) {
      expect(new Set(deriveTurnTable(vertex).edgeDestination).size).toBe(6);
    }
  });
});
