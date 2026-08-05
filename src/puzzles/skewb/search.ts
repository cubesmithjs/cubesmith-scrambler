import {
  ALL_MOVES_SKEWB,
  isSolvedSkewbCoordinate,
  nextCenterCoordSkewb,
  nextCornerCoordSkewb,
  toSkewbCoordinate,
  type SkewbCoordinate,
} from './coordinates';
import type { SkewbMove } from './notation';
import { distanceSkewb, UNVISITED_DISTANCE_SKEWB } from './pruning';
import type { SkewbState } from './state';

const DEFAULT_MOVE_ORDER: readonly number[] = ALL_MOVES_SKEWB.map((_, i) => i);

/** The exact number of turns needed to solve `state`. Throws if it isn't a real Skewb position. */
export function skewbSolveDistance(state: SkewbState): number {
  const distance = distanceSkewb(toSkewbCoordinate(state));
  if (distance === UNVISITED_DISTANCE_SKEWB) {
    throw new Error('skewbSolveDistance: state is not reachable on a real Skewb');
  }
  return distance;
}

/**
 * An optimal solution for `state`. The pruning table holds exact distances,
 * so the initial bound is already the answer's length and the first IDA*
 * iteration is the only one.
 *
 * `moveOrder` exists for the same reason as in `puzzles/pyraminx/search.ts`:
 * with a perfect heuristic the root never backtracks, so a fixed try-order
 * biases the solution's first move and therefore the scramble's last one.
 */
export function solveSkewb(
  state: SkewbState,
  moveOrder: readonly number[] = DEFAULT_MOVE_ORDER,
): SkewbMove[] {
  const solution = solveSkewbInExactly(state, skewbSolveDistance(state), moveOrder);
  if (!solution) {
    throw new Error('solveSkewb: no solution within the exact known distance');
  }
  return solution;
}

/**
 * A solution of *exactly* `length` turns, or `null` if none exists.
 *
 * Asking for a fixed length rather than the shortest one is what lets a
 * scramble be padded to a presentable size without changing the state it
 * reaches (see `core/scramble-shape.ts`). The heuristic still prunes
 * everything unreachable within the budget — `g + h > length` — so the
 * slack is spent only where a detour can actually still get home in time.
 */
export function solveSkewbInExactly(
  state: SkewbState,
  length: number,
  moveOrder: readonly number[] = DEFAULT_MOVE_ORDER,
): SkewbMove[] | null {
  const start = toSkewbCoordinate(state);
  if (distanceSkewb(start) === UNVISITED_DISTANCE_SKEWB) {
    throw new Error('solveSkewbInExactly: state is not reachable on a real Skewb');
  }
  if (length === 0) return isSolvedSkewbCoordinate(start) ? [] : null;

  const path: SkewbMove[] = [];
  return dfs(start, 0, length, path, moveOrder) ? [...path] : null;
}

function dfs(
  coord: SkewbCoordinate,
  g: number,
  bound: number,
  path: SkewbMove[],
  moveOrder: readonly number[],
): boolean {
  const h = distanceSkewb(coord);
  if (g + h > bound) return false;
  if (g === bound) return h === 0;

  const lastMove = path[path.length - 1];
  for (const m of moveOrder) {
    const move = ALL_MOVES_SKEWB[m]!;
    // Two turns about the same corner in a row always collapse into one.
    if (lastMove && lastMove.corner === move.corner) continue;
    const next: SkewbCoordinate = {
      corners: nextCornerCoordSkewb(coord.corners, m),
      centers: nextCenterCoordSkewb(coord.centers, m),
    };
    path.push(move);
    if (dfs(next, g + 1, bound, path, moveOrder)) return true;
    path.pop();
  }
  return false;
}
