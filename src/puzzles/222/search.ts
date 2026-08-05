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
  const solution = solve222InExactly(state, solveDistance222(state));
  if (!solution) {
    throw new Error('solve222: no solution found within the exact known distance — unreachable state');
  }
  return solution;
}

/** The exact number of moves needed to solve `state`. */
export function solveDistance222(state: Cube222State): number {
  const start = toCoordinate222(state);
  return distance222(start.cornerPerm, start.cornerOrientation);
}

/**
 * A solution of *exactly* `length` moves, or `null` if none exists.
 * Requesting a fixed length rather than the shortest one is what lets a
 * scramble be padded to a presentable size without changing the state it
 * reaches — see `core/scramble-shape.ts`.
 */
export function solve222InExactly(
  state: Cube222State,
  length: number,
  moveOrder: readonly number[] = DEFAULT_MOVE_ORDER_222,
): FaceMove[] | null {
  const start = toCoordinate222(state);
  if (length === 0) return isSolved222Coordinate(start) ? [] : null;
  const path: FaceMove[] = [];
  return dfs(start, 0, length, path, moveOrder) ? [...path] : null;
}

const DEFAULT_MOVE_ORDER_222: readonly number[] = ALL_MOVES_222.map((_, i) => i);

function dfs(
  coord: Coordinate222,
  g: number,
  bound: number,
  path: FaceMove[],
  moveOrder: readonly number[],
): boolean {
  const h = distance222(coord.cornerPerm, coord.cornerOrientation);
  if (g + h > bound) return false;
  if (g === bound) return h === 0;

  const lastMove = path[path.length - 1];
  for (const m of moveOrder) {
    const move = ALL_MOVES_222[m]!;
    if (lastMove && lastMove.face === move.face) continue;
    const nextCoord: Coordinate222 = {
      cornerPerm: nextCornerPerm222(coord.cornerPerm, move),
      cornerOrientation: nextCornerOrientation222(coord.cornerOrientation, move),
    };
    path.push(move);
    if (dfs(nextCoord, g + 1, bound, path, moveOrder)) return true;
    path.pop();
  }
  return false;
}
