import type { FaceMove } from '../../notation/move';
import { isSolved222Coordinate, toCoordinate222, type Coordinate222 } from './coordinates';
import { distance222 } from './pruning';
import { ALL_MOVES_222, nextCornerOrientation222, nextCornerPerm222 } from './tables';
import type { Cube222State } from './state';

/**
 * IDA*, same algorithm as `puzzles/333/phase1-search.ts`/`phase2-search.ts`
 * — but since `distance222` holds the *exact* distance to solved for every
 * reachable state (the whole group fits in one table; see
 * `pruning.ts`), this is effectively perfect-heuristic search: the very
 * first iteration finds an optimal solution, with none of the wasted
 * re-search across increasing bounds that an approximate heuristic needs.
 */
export function solve222(state: Cube222State): FaceMove[] {
  const start = toCoordinate222(state);
  if (isSolved222Coordinate(start)) return [];

  const bound = distance222(start.cornerPerm, start.cornerOrientation);
  const path: FaceMove[] = [];
  const found = dfs(start, 0, bound, path);
  if (!found) {
    throw new Error('solve222: no solution found within the exact known distance — unreachable state');
  }
  return [...path];
}

function dfs(coord: Coordinate222, g: number, bound: number, path: FaceMove[]): boolean {
  const h = distance222(coord.cornerPerm, coord.cornerOrientation);
  if (g + h > bound) return false;
  if (isSolved222Coordinate(coord)) return true;

  const lastMove = path[path.length - 1];
  for (const move of ALL_MOVES_222) {
    if (lastMove && lastMove.face === move.face) continue;
    const nextCoord: Coordinate222 = {
      cornerPerm: nextCornerPerm222(coord.cornerPerm, move),
      cornerOrientation: nextCornerOrientation222(coord.cornerOrientation, move),
    };
    path.push(move);
    if (dfs(nextCoord, g + 1, bound, path)) return true;
    path.pop();
  }
  return false;
}
