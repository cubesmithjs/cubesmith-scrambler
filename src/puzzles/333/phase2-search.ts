import type { FaceMove } from './move-tables';
import { isSolvedPhase2, toPhase2Coordinate, type Phase2Coordinate } from './phase2-coordinates';
import { phase2Heuristic } from './phase2-pruning';
import { PHASE2_MOVES, nextCornerPerm, nextEdge8Perm, nextUdSliceOrder } from './phase2-tables';
import {
  isForbiddenFirstMove,
  isForbiddenLastMove,
  NO_END_RESTRICTIONS,
  type EndAxisRestrictions,
} from './search-restrictions';
import type { CubeState } from './state';
import { isRedundantAfter } from './redundancy';

/**
 * IDA* over the restricted 10-move G1-preserving set, exactly analogous to
 * `phase1Search` — same algorithm, different coordinates/heuristic/move
 * set. `state` must already be in G1 (the caller — `solve.ts` — is
 * responsible for running `phase1Search` first).
 *
 * `restrictions` works the same way it does in `phase1Search`, and matters
 * more here: the last move of a two-phase solution is almost always a phase-2
 * move. Of the ten moves available, an axis restriction rules out at most
 * four (`U`/`U2`/`U'`/`D`… for `'UD'`, or the two half turns for `'RL'` and
 * `'FB'`), so a conforming solution always exists.
 *
 * `context` is the moves already made before phase 2 starts: phase 1's
 * solution. The search treats it as history, so its first moves can never
 * merge back into phase 1's last ones (`R2 | R'`, or `R2 L2 | R'` through the
 * opposite face). See `redundancy.ts`. Ruling out a few opening moves never
 * leaves the search without an answer; at worst the solution is one move
 * longer.
 */
export function phase2Search(
  state: CubeState,
  restrictions: EndAxisRestrictions = NO_END_RESTRICTIONS,
  context: readonly FaceMove[] = [],
): FaceMove[] {
  const start = toPhase2Coordinate(state);
  if (isSolvedPhase2(start)) return [];

  let bound = phase2Heuristic(start.cornerPerm, start.edge8Perm, start.udSliceOrder);
  const path: FaceMove[] = [];

  for (;;) {
    const result = dfs(start, 0, bound, path, restrictions, context);
    if (result.found) return [...path];
    if (result.nextBound === Infinity) {
      throw new Error('phase2Search: no path to solved found — the input state may not be in G1');
    }
    bound = result.nextBound;
  }
}

type DfsResult = { found: true } | { found: false; nextBound: number };

function dfs(
  coord: Phase2Coordinate,
  g: number,
  bound: number,
  path: FaceMove[],
  restrictions: EndAxisRestrictions,
  context: readonly FaceMove[],
): DfsResult {
  const h = phase2Heuristic(coord.cornerPerm, coord.edge8Perm, coord.udSliceOrder);
  const f = g + h;
  if (f > bound) return { found: false, nextBound: f };

  let minExceeding = Infinity;
  const lastMove = path[path.length - 1];

  if (isSolvedPhase2(coord) && !isForbiddenLastMove(lastMove, restrictions)) return { found: true };

  for (const move of PHASE2_MOVES) {
    if (isRedundantAfter(path, context, move)) continue;
    if (g === 0 && isForbiddenFirstMove(move, restrictions)) continue;

    const nextCoord: Phase2Coordinate = {
      cornerPerm: nextCornerPerm(coord.cornerPerm, move),
      edge8Perm: nextEdge8Perm(coord.edge8Perm, move),
      udSliceOrder: nextUdSliceOrder(coord.udSliceOrder, move),
    };
    path.push(move);
    const result = dfs(nextCoord, g + 1, bound, path, restrictions, context);
    if (result.found) return result;
    if (result.nextBound < minExceeding) minExceeding = result.nextBound;
    path.pop();
  }

  return { found: false, nextBound: minExceeding };
}
