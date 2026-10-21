import { colorFor } from '../../../draw/color';
import type { ColorScheme, ImageShape } from '../../../draw/types';
import {
  cross,
  dot,
  halfSpace,
  intersectHalfSpaces,
  length,
  normalize,
  polytopeVertices,
  type HalfSpace,
  type Polygon3,
  type V3,
} from './geometry';
import { applyMechanismMoves, applyRotation, solvedMechanism, type Cubie } from './mechanism';
import type { ShapeModSolid } from './solids';
import { shadeColor } from './shade';
import type { WideMove } from '../../../puzzles/nxn/notation';

/**
 * The shape-mod renderer: convex pieces, placed by the mechanism, drawn as two
 * isometric views in an exact back-to-front order.
 *
 * ## Pieces
 *
 * A piece is its mechanism cell ∩ the outer solid. A cell is bounded by the cut
 * planes `x = ±½`, `y = ±½`, `z = ±½`: an outer cell is unbounded outward, and
 * the outer solid closes it. Both are convex, so the piece is convex.
 *
 * ## Drawing order, with no depth sort
 *
 * After any scramble a piece lies entirely inside the cell it now occupies,
 * because a turn is a rotation that maps cells to cells. So the six cut planes
 * separate every piece from every other: they are a binary space partition of
 * the pieces, fixed in advance. For a viewer at infinity in direction `v`,
 * anything on the far side of a plane cannot hide anything on the near side.
 * Ordering cells lexicographically by `(sx·x, sy·y, sz·z)`, with `s = sign(v)`,
 * is exactly the far-first traversal of that partition (split on x, then y,
 * then z). This is the *a priori* BSP order of Fuchs, Kedem & Naylor, "On
 * Visible Surface Generation by A Priori Tree Structures" (SIGGRAPH 1980). It
 * is exact, so there are no depth ties to break. Within one convex piece, the
 * faces turned towards the viewer never overlap, so their order is free.
 * `shape-mod.test.ts` checks the order against a brute-force z-buffer.
 */

/** Drawing units per mechanism unit. A 3x3x3 view is then about as wide as the WCA cube net. */
const SCALE = 20;
const GAP = 4;
const STROKE = '#000000';

interface View {
  readonly toward: V3;
  readonly right: V3;
  readonly up: V3;
  readonly light: V3;
}

function view(toward: V3): View {
  const t = normalize(toward);
  const right = normalize(cross([0, 1, 0], t));
  const up = cross(t, right);
  // A light above and to the left of the viewer, so the three visible faces
  // of a cube get three different shades.
  const light = normalize([
    t[0] + 0.6 * up[0] - 0.4 * right[0],
    t[1] + 0.6 * up[1] - 0.4 * right[1],
    t[2] + 0.6 * up[2] - 0.4 * right[2],
  ]);
  return { toward: t, right, up, light };
}

/**
 * Front-top-right, then back-bottom-left, of the outer solid: every face of a
 * cube appears in exactly one. `frameTurn` turns both about the U–D axis.
 */
export function viewsFor(frameTurn: number): readonly View[] {
  const c = Math.cos(frameTurn);
  const s = Math.sin(frameTurn);
  // A turn about +y by `frameTurn`: x → (c, 0, −s), z → (s, 0, c).
  const turned = (v: V3): V3 => [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
  return [view(turned([1, 1, 1])), view(turned([-1, -1, -1]))];
}

function cellHalfSpaces(cell: V3): HalfSpace[] {
  const spaces: HalfSpace[] = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const unit = [0, 0, 0] as [number, number, number];
    unit[axis] = 1;
    const minus: V3 = [-unit[0], -unit[1], -unit[2]];
    const c = cell[axis]!;
    if (c <= 0) spaces.push(halfSpace(unit, 0.5 * (c === 0 ? 1 : -1), { kind: 'cut' }));
    if (c >= 0) spaces.push(halfSpace(minus, 0.5 * (c === 0 ? 1 : -1), { kind: 'cut' }));
  }
  return spaces;
}

export interface ShapeModModel {
  /** Each cubie's home polytope, keyed by `home.join(',')`. */
  readonly pieces: ReadonlyMap<string, readonly Polygon3[]>;
  /** The core cell ∩ solid, never drawn, kept so the volume check is complete. */
  readonly core: readonly Polygon3[];
  /** The largest distance of any piece vertex from the centre. Rotation-invariant, so it bounds every scramble. */
  readonly radius: number;
}

const models = new Map<ShapeModSolid, ShapeModModel>();

export function shapeModModel(solid: ShapeModSolid): ShapeModModel {
  const cached = models.get(solid);
  if (cached) return cached;
  const pieces = new Map<string, readonly Polygon3[]>();
  let radius = 0;
  for (const cubie of solvedMechanism()) {
    const polytope = intersectHalfSpaces([...cellHalfSpaces(cubie.home), ...solid.faces]);
    pieces.set(cubie.home.join(','), polytope);
    for (const v of polytopeVertices(polytope)) radius = Math.max(radius, length(v));
  }
  const core = intersectHalfSpaces([...cellHalfSpaces([0, 0, 0]), ...solid.faces]);
  const model = { pieces, core, radius };
  models.set(solid, model);
  return model;
}

function backToFront(cubies: readonly Cubie[], toward: V3): Cubie[] {
  const sign = toward.map((c) => Math.sign(c)) as unknown as V3;
  return [...cubies].sort((a, b) => {
    for (let axis = 0; axis < 3; axis += 1) {
      const d = sign[axis]! * a.position[axis]! - sign[axis]! * b.position[axis]!;
      if (d !== 0) return d;
    }
    return 0;
  });
}

function fillFor(polygon: Polygon3, scheme: ColorScheme): { fill: string; face: string } {
  const key = polygon.tag.kind === 'outer' ? polygon.tag.key : 'body';
  return { fill: colorFor(scheme, key), face: key };
}

export interface ShapeModImageBody {
  readonly width: number;
  readonly height: number;
  readonly strokeWidth: number;
  readonly shapes: readonly ImageShape[];
}

/** One polygon as it will be painted: its view, its 3D points after the scramble, and its fill. */
export interface PaintedPolygon {
  readonly view: number;
  readonly points: readonly V3[];
  readonly normal: V3;
  readonly fill: string;
  readonly face: string;
}

/**
 * Every visible polygon of the scrambled puzzle, in paint order, view by view.
 * Kept in 3D so `render.test.ts` can check the order against true depth.
 */
export function paintOrder(
  solid: ShapeModSolid,
  moves: readonly WideMove[],
  scheme: ColorScheme,
): PaintedPolygon[] {
  const model = shapeModModel(solid);
  const cubies = applyMechanismMoves(solvedMechanism(), moves);
  const painted: PaintedPolygon[] = [];
  viewsFor(solid.frameTurn).forEach((v, index) => {
    for (const cubie of backToFront(cubies, v.toward)) {
      for (const polygon of model.pieces.get(cubie.home.join(','))!) {
        const normal = applyRotation(cubie.rotation, polygon.normal);
        if (dot(normal, v.toward) <= 1e-9) continue;
        const { fill, face } = fillFor(polygon, scheme);
        painted.push({
          view: index,
          points: polygon.points.map((p) => applyRotation(cubie.rotation, p)),
          normal,
          fill: shadeColor(fill, 1 - solid.shading * (1 - Math.max(0, dot(normal, v.light)))),
          face,
        });
      }
    }
  });
  return painted;
}

/** Where view `index`'s centre lands in the image, for a puzzle of bounding radius `radius`. */
export function viewCentre(radius: number, index: number): readonly [number, number] {
  const side = 2 * radius * SCALE;
  return [GAP + side / 2 + index * (side + GAP), GAP + side / 2];
}

/** Draws `moves` applied to the solved mechanism, as two isometric views side by side. */
export function drawShapeModState(
  solid: ShapeModSolid,
  moves: readonly WideMove[],
  scheme: ColorScheme,
): ShapeModImageBody {
  const { radius } = shapeModModel(solid);
  const views = viewsFor(solid.frameTurn);
  const side = 2 * radius * SCALE;
  const shapes: ImageShape[] = paintOrder(solid, moves, scheme).map((polygon) => {
    const v = views[polygon.view]!;
    const [cx, cy] = viewCentre(radius, polygon.view);
    return {
      kind: 'polygon',
      points: polygon.points.map((q) => [cx + SCALE * dot(q, v.right), cy - SCALE * dot(q, v.up)] as const),
      fill: polygon.fill,
      stroke: STROKE,
      face: polygon.face,
    };
  });
  return { width: 2 * side + 3 * GAP, height: side + 2 * GAP, strokeWidth: 0.5, shapes };
}

export { SCALE };
