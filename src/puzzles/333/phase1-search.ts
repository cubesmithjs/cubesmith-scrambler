import { isInG1, toPhase1Coordinate, type Phase1Coordinate } from './coordinates';
import { ALL_MOVES, nextFlip, nextTwist, nextUdSlice } from './phase1-tables';
import { phase1Heuristic } from './phase1-pruning';
import {
  isForbiddenFirstMove,
  isForbiddenLastMove,
  NO_END_RESTRICTIONS,
  type EndAxisRestrictions,
} from './search-restrictions';
import type { FaceMove } from './move-tables';
import type { CubeState } from './state';

/**
 * IDA* (iterative-deepening A*): repeatedly DFS with an increasing
 * move-count bound, pruned by `phase1Heuristic` (an admissible lower bound
 * — never overestimates, so no solution shorter than the true optimum is
 * ever skipped). This finds a *shortest* sequence bringing `state` into the
 * phase-1 subgroup G1, terminating as soon as any node's `g + h` exceeds
 * the current bound.
 *
 * Consecutive moves on the same face are pruned during search (turning a
 * face twice in a row is always redundant — it's equivalent to a single
 * turn of some amount, so any solution containing that pattern is not
 * shortest and searching it wastes time) — a standard optimization, not a
 * correctness requirement.
 *
 * `restrictions` can bar the sequence from opening or closing on a given
 * axis. A barred end is not post-filtered: a G1 node reached by a barred
 * final move simply isn't treated as a goal, so the search carries on and
 * returns a (possibly longer) sequence that does obey the restriction. The
 * heuristic stays admissible either way — it lower-bounds the distance to G1,
 * and a restricted route to G1 can only be longer — so IDA* is still correct.
 * See `search-restrictions.ts` for why this belongs inside the search.
 */
export function phase1Search(
  state: CubeState,
  restrictions: EndAxisRestrictions = NO_END_RESTRICTIONS,
): FaceMove[] {
  const start = toPhase1Coordinate(state);
  if (isInG1(start)) return [];

  let bound = phase1Heuristic(start.twist, start.flip, start.udSlice);
  const path: FaceMove[] = [];

  for (;;) {
    const result = dfs(start, 0, bound, path, restrictions);
    if (result.found) return [...path];
    if (result.nextBound === Infinity) {
      throw new Error('phase1Search: no path to G1 found — the input state may not be reachable');
    }
    bound = result.nextBound;
  }
}

type DfsResult = { found: true } | { found: false; nextBound: number };

function dfs(
  coord: Phase1Coordinate,
  g: number,
  bound: number,
  path: FaceMove[],
  restrictions: EndAxisRestrictions,
): DfsResult {
  const h = phase1Heuristic(coord.twist, coord.flip, coord.udSlice);
  const f = g + h;
  if (f > bound) return { found: false, nextBound: f };

  let minExceeding = Infinity;
  const lastMove = path[path.length - 1];

  if (isInG1(coord) && !isForbiddenLastMove(lastMove, restrictions)) return { found: true };

  for (const move of ALL_MOVES) {
    if (lastMove && lastMove.face === move.face) continue;
    if (g === 0 && isForbiddenFirstMove(move, restrictions)) continue;

    const nextCoord: Phase1Coordinate = {
      twist: nextTwist(coord.twist, move),
      flip: nextFlip(coord.flip, move),
      udSlice: nextUdSlice(coord.udSlice, move),
    };
    path.push(move);
    const result = dfs(nextCoord, g + 1, bound, path, restrictions);
    if (result.found) return result;
    if (result.nextBound < minExceeding) minExceeding = result.nextBound;
    path.pop();
  }

  return { found: false, nextBound: minExceeding };
}
