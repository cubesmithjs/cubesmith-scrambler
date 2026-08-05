import {
  isSolvedPyraminxCoordinate,
  toPyraminxCoordinate,
  type PyraminxCoordinate,
} from './coordinates';
import { distancePyraminx, UNVISITED_DISTANCE_PYRAMINX } from './pruning';
import type { PyraminxMove } from './notation';
import type { PyraminxState } from './state';
import {
  ALL_LAYER_MOVES_PYRAMINX,
  nextAxialPyraminx,
  nextEdgeOrientationPyraminx,
  nextEdgePermPyraminx,
} from './tables';

const DEFAULT_MOVE_ORDER: readonly number[] = ALL_LAYER_MOVES_PYRAMINX.map((_, i) => i);

/**
 * An optimal layer-turn solution for `state`, ignoring tips (they're
 * independent — see `solve.ts`).
 *
 * `moveOrder` reorders which move each search node tries first. It exists
 * because with a *perfect* heuristic the search never backtracks at the root:
 * the first move that keeps `g + h` within the bound is the one returned, so
 * a fixed try-order makes the solution's opening move — and therefore the
 * scramble's *closing* move, after inversion — visibly biased toward whatever
 * move happens to be first in the list. That is a real, reported defect class
 * in scramble generators (thewca/tnoodle#69, "Pyraminx scrambles all start
 * with U L"), not a hypothetical one. The state distribution is uniform
 * either way; passing a shuffled order removes the cosmetic artifact too.
 */
export function solvePyraminxLayers(
  state: PyraminxState,
  moveOrder: readonly number[] = DEFAULT_MOVE_ORDER,
): PyraminxMove[] {
  const start = toPyraminxCoordinate(state);
  const bound = distancePyraminx(start);
  if (bound === UNVISITED_DISTANCE_PYRAMINX) {
    throw new Error('solvePyraminxLayers: state is not reachable on a real Pyraminx');
  }
  if (isSolvedPyraminxCoordinate(start)) return [];

  const path: PyraminxMove[] = [];
  if (!dfs(start, 0, bound, path, moveOrder)) {
    throw new Error('solvePyraminxLayers: no solution within the exact known distance');
  }
  return [...path];
}

function dfs(
  coord: PyraminxCoordinate,
  g: number,
  bound: number,
  path: PyraminxMove[],
  moveOrder: readonly number[],
): boolean {
  const h = distancePyraminx(coord);
  if (g + h > bound) return false;
  if (isSolvedPyraminxCoordinate(coord)) return true;

  const lastMove = path[path.length - 1];
  for (const m of moveOrder) {
    const move = ALL_LAYER_MOVES_PYRAMINX[m]!;
    // Two turns of the same vertex in a row are always expressible as one.
    if (lastMove && lastMove.vertex === move.vertex) continue;
    const next: PyraminxCoordinate = {
      edgePerm: nextEdgePermPyraminx(coord.edgePerm, m),
      edgeOrientation: nextEdgeOrientationPyraminx(coord.edgeOrientation, m),
      axial: nextAxialPyraminx(coord.axial, m),
    };
    path.push(move);
    if (dfs(next, g + 1, bound, path, moveOrder)) return true;
    path.pop();
  }
  return false;
}
