import type { FaceMove } from './move-tables';
import { isSolvedPhase2, toPhase2Coordinate, type Phase2Coordinate } from './phase2-coordinates';
import { phase2Heuristic } from './phase2-pruning';
import { PHASE2_MOVES, nextCornerPerm, nextEdge8Perm, nextUdSliceOrder } from './phase2-tables';
import type { CubeState } from './state';

/**
 * IDA* over the restricted 10-move G1-preserving set, exactly analogous to
 * `phase1Search` — same algorithm, different coordinates/heuristic/move
 * set. `state` must already be in G1 (the caller — `solve.ts` — is
 * responsible for running `phase1Search` first).
 */
export function phase2Search(state: CubeState): FaceMove[] {
  const start = toPhase2Coordinate(state);
  if (isSolvedPhase2(start)) return [];

  let bound = phase2Heuristic(start.cornerPerm, start.edge8Perm, start.udSliceOrder);
  const path: FaceMove[] = [];

  for (;;) {
    const result = dfs(start, 0, bound, path);
    if (result.found) return [...path];
    if (result.nextBound === Infinity) {
      throw new Error('phase2Search: no path to solved found — the input state may not be in G1');
    }
    bound = result.nextBound;
  }
}

type DfsResult = { found: true } | { found: false; nextBound: number };

function dfs(coord: Phase2Coordinate, g: number, bound: number, path: FaceMove[]): DfsResult {
  const h = phase2Heuristic(coord.cornerPerm, coord.edge8Perm, coord.udSliceOrder);
  const f = g + h;
  if (f > bound) return { found: false, nextBound: f };
  if (isSolvedPhase2(coord)) return { found: true };

  let minExceeding = Infinity;
  const lastMove = path[path.length - 1];

  for (const move of PHASE2_MOVES) {
    if (lastMove && lastMove.face === move.face) continue;

    const nextCoord: Phase2Coordinate = {
      cornerPerm: nextCornerPerm(coord.cornerPerm, move),
      edge8Perm: nextEdge8Perm(coord.edge8Perm, move),
      udSliceOrder: nextUdSliceOrder(coord.udSliceOrder, move),
    };
    path.push(move);
    const result = dfs(nextCoord, g + 1, bound, path);
    if (result.found) return result;
    if (result.nextBound < minExceeding) minExceeding = result.nextBound;
    path.pop();
  }

  return { found: false, nextBound: minExceeding };
}
