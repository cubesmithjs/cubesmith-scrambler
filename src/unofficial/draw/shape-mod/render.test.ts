import { describe, expect, it } from 'vitest';
import { parseScrambleToken } from '../../../puzzles/nxn/notation';
import { createRandomSource } from '../../../random/random-source';
import { randomInt } from '../../../utils/random-int';
import { halfSpace, intersectHalfSpaces, polytopeVolume } from './geometry';
import { drawShapeModState, paintOrder, shapeModModel, viewsFor } from './render';
import { SHAPE_MOD_SOLIDS, type ShapeModSolid } from './solids';

const SOLIDS = Object.entries(SHAPE_MOD_SOLIDS) as [string, ShapeModSolid][];

const PLAIN_CUBE: ShapeModSolid = {
  faces: (['R', 'L', 'U', 'D', 'F', 'B'] as const).map((key, i) => {
    const n = [0, 0, 0] as [number, number, number];
    n[Math.floor(i / 2)] = i % 2 === 0 ? 1 : -1;
    return halfSpace(n, 1.5, { kind: 'outer', key });
  }),
  defaultScheme: { R: '#ff0000', L: '#ff8000', U: '#ffffff', D: '#ffff00', F: '#00ff00', B: '#0000ff', body: '#000000' },
  frameTurn: 0,
  shading: 0,
};

const moves = (text: string) => text.split(' ').filter(Boolean).map((t) => parseScrambleToken(t, 3));
const inverse = (text: string) =>
  text
    .split(' ')
    .filter(Boolean)
    .reverse()
    .map((t) => (t.endsWith("'") ? t.slice(0, -1) : t.endsWith('2') ? t : `${t}'`))
    .join(' ');

function randomScramble(seed: string, length = 25): string {
  const random = createRandomSource(seed);
  const faces = ['R', 'L', 'U', 'D', 'F', 'B'];
  const out: string[] = [];
  for (let i = 0; i < length; i += 1) out.push(faces[randomInt(random, 6)]! + ['', "'", '2'][randomInt(random, 3)]!);
  return out.join(' ');
}

/** Even-odd point-in-polygon, in 2D. */
function inside(points: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const dot3 = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

type Shapes = ReturnType<typeof drawShapeModState>['shapes'];

/**
 * The face key of every polygon that is the last paint at its own centroid,
 * that is, every polygon a viewer can actually see some of. Painter's order
 * leaves hidden polygons in the list, so counting shapes would count those.
 */
function visibleFaces(shapes: Shapes): string[] {
  const polygons = shapes.flatMap((s) => (s.kind === 'polygon' ? [s] : []));
  return polygons.flatMap((polygon, index) => {
    const cx = polygon.points.reduce((sum, p) => sum + p[0], 0) / polygon.points.length;
    const cy = polygon.points.reduce((sum, p) => sum + p[1], 0) / polygon.points.length;
    let last = -1;
    polygons.forEach((other, j) => {
      if (inside(other.points, cx, cy)) last = j;
    });
    return last === index ? [polygon.face ?? ''] : [];
  });
}

describe('the shape-mod renderer', () => {
  it.each(SOLIDS)('%s: the pieces and the core exactly fill the outer solid', (_event, solid) => {
    const model = shapeModModel(solid);
    const pieces = [...model.pieces.values()].reduce((sum, p) => sum + polytopeVolume(p), 0);
    const whole = polytopeVolume(intersectHalfSpaces(solid.faces));
    expect(pieces + polytopeVolume(model.core)).toBeCloseTo(whole, 6);
    // The core is hidden inside the puzzle: the outer solid contains the whole core cell.
    expect(polytopeVolume(model.core)).toBeCloseTo(1, 9);
    // Every cubie is a real piece with a visible outer face.
    for (const [home, polytope] of model.pieces) {
      expect(polytope.some((f) => f.tag.kind === 'outer'), home).toBe(true);
    }
  });

  it.each(SOLIDS)('%s: scramble then inverse draws exactly the solved picture', (_event, solid) => {
    const scramble = randomScramble('inverse');
    const solved = drawShapeModState(solid, [], solid.defaultScheme);
    const back = drawShapeModState(solid, moves(`${scramble} ${inverse(scramble)}`), solid.defaultScheme);
    expect(back).toEqual(solved);
    expect(drawShapeModState(solid, moves(scramble), solid.defaultScheme)).not.toEqual(solved);
  });

  it('draws a plain cube as the cube it is: nine visible stickers per face, no visible cut face', () => {
    const image = drawShapeModState(PLAIN_CUBE, [], PLAIN_CUBE.defaultScheme);
    const visible = visibleFaces(image.shapes);
    for (const key of ['U', 'R', 'F', 'D', 'L', 'B']) expect(visible.filter((f) => f === key)).toHaveLength(9);
    expect(visible).not.toContain('body');
  });

  it('shows a cut face the moment a turn exposes one, and only on a shape mod', () => {
    const mirror = SHAPE_MOD_SOLIDS.mirror!;
    expect(visibleFaces(drawShapeModState(mirror, moves('R'), mirror.defaultScheme).shapes)).toContain('body');
    expect(visibleFaces(drawShapeModState(PLAIN_CUBE, moves('R U F'), PLAIN_CUBE.defaultScheme).shapes)).not.toContain(
      'body',
    );
  });

  it('🔴 paints in an exact back-to-front order: at every sampled point the last paint is the nearest polygon', () => {
    // A brute-force z-buffer, in the test only. For each sample point of each
    // view, take every polygon covering it, recover its depth along the view
    // direction from its plane, and require the one painted LAST to be the
    // nearest. A wrong order (a far piece painted after a near one) fails here.
    for (const [event, solid] of SOLIDS) {
      const views = viewsFor(solid.frameTurn);
      for (const seed of ['bsp-1', 'bsp-2', 'bsp-3']) {
        const painted = paintOrder(solid, moves(randomScramble(seed)), solid.defaultScheme);
        const { radius } = shapeModModel(solid);
        for (let index = 0; index < views.length; index += 1) {
          const v = views[index]!;
          const own = painted.filter((p) => p.view === index);
          const flat = own.map((p) => p.points.map((q) => [dot3(q, v.right), dot3(q, v.up)] as const));
          let checked = 0;
          for (let u = -radius; u <= radius; u += radius / 40) {
            for (let w = -radius; w <= radius; w += radius / 40) {
              let last = -1;
              let nearest = -1;
              let nearestDepth = -Infinity;
              own.forEach((polygon, i) => {
                if (!inside(flat[i]!, u, w)) return;
                last = i;
                const offset = dot3(polygon.normal, polygon.points[0]!);
                const depth =
                  (offset - u * dot3(polygon.normal, v.right) - w * dot3(polygon.normal, v.up)) /
                  dot3(polygon.normal, v.toward);
                if (depth > nearestDepth + 1e-6) {
                  nearestDepth = depth;
                  nearest = i;
                }
              });
              if (last === -1) continue;
              checked += 1;
              const lastPolygon = own[last]!;
              const lastDepth =
                (dot3(lastPolygon.normal, lastPolygon.points[0]!) -
                  u * dot3(lastPolygon.normal, v.right) -
                  w * dot3(lastPolygon.normal, v.up)) /
                dot3(lastPolygon.normal, v.toward);
              expect(lastDepth, `${event} ${seed} view ${index} at (${u}, ${w})`).toBeGreaterThan(nearestDepth - 1e-6);
              expect(nearest).toBeGreaterThanOrEqual(0);
            }
          }
          expect(checked).toBeGreaterThan(500);
        }
      }
    }
  });

  it('aims the views at the outer solid: a Fisher Cube shows three faces per view, not two', () => {
    const fisher = SHAPE_MOD_SOLIDS.fisher!;
    const views = viewsFor(fisher.frameTurn);
    for (const view of views) {
      const facing = fisher.faces.filter((f) => f.normal.reduce((s, c, i) => s + c * view.toward[i]!, 0) > 1e-9);
      expect(facing).toHaveLength(3);
    }
  });
});
