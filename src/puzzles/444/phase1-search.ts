import { moveAxis, moveLayerSet } from '../nxn/notation';
import { move444Tables } from './state';
import {
  isPhase1Solved,
  permuteCentreMask,
  phase1CoordinateOf,
  phase1LowerBound,
  type Phase1Coordinate,
} from './phase1';
import type { Cube444State } from './state';

/**
 * Phase 1's search: iterative deepening over the two centre masks alone.
 *
 * The full piece state never enters it. A node is two 24-bit integers, a move is
 * six table reads, and the heuristic is two more — which is why a phase whose
 * space is 9.5 billion joint coordinates is searched in milliseconds.
 *
 * Two redundancies are pruned, both of them exact rather than heuristic:
 *
 * - **The same layer set twice in a row** composes into one move, so it can
 *   never be part of a shortest sequence.
 * - **Two moves on the same axis** commute, so only one of the two orderings
 *   need be explored. The rule is to require the layer sets to be in increasing
 *   order within a run on one axis, which keeps exactly one representative of
 *   each commuting class.
 */

export interface Phase1Options {
  /** Give up past this many moves. */
  readonly maxLength?: number;
  /** Called with each solution found; return `true` to stop the search. */
  readonly visit?: (moveIndices: readonly number[]) => boolean;
  /** Stop after this many solutions when no `visit` is given. */
  readonly maxSolutions?: number;
}

interface MoveMeta {
  readonly axis: string;
  readonly layerSet: string;
}

let meta: readonly MoveMeta[] | undefined;

function moveMeta(): readonly MoveMeta[] {
  meta ??= move444Tables().map((table) => ({
    axis: moveAxis(table.move),
    layerSet: moveLayerSet(table.move),
  }));
  return meta;
}

/**
 * Phase-1 solutions, shortest first, as arrays of move indices into
 * `move444Tables()`.
 */
export function phase1Solutions(
  state: Cube444State,
  options: Phase1Options = {},
): number[][] {
  const start = phase1CoordinateOf(state);
  const maxLength = options.maxLength ?? 12;
  const maxSolutions = options.maxSolutions ?? 1;
  const visit = options.visit;
  const info = moveMeta();
  const moveCount = info.length;

  const solutions: number[][] = [];
  const path: number[] = [];
  let stopped = false;

  const search = (
    upDown: number,
    frontBack: number,
    leftRight: number,
    cost: number,
    bound: number,
    previous: number,
  ): void => {
    if (stopped) return;

    const coordinate: Phase1Coordinate = { upDown, frontBack, leftRight };
    const remaining = phase1LowerBound(coordinate);
    if (remaining === 0 && isPhase1Solved(coordinate)) {
      if (cost !== bound) return;
      if (visit) {
        if (visit(path)) stopped = true;
      } else {
        solutions.push([...path]);
        if (solutions.length >= maxSolutions) stopped = true;
      }
      return;
    }
    if (cost + remaining > bound) return;

    for (let move = 0; move < moveCount; move += 1) {
      if (previous >= 0) {
        if (info[move]!.layerSet === info[previous]!.layerSet) continue;
        if (
          info[move]!.axis === info[previous]!.axis &&
          info[move]!.layerSet < info[previous]!.layerSet
        ) {
          continue;
        }
      }
      path.push(move);
      search(
        permuteCentreMask(upDown, move),
        permuteCentreMask(frontBack, move),
        permuteCentreMask(leftRight, move),
        cost + 1,
        bound,
        move,
      );
      path.pop();
      if (stopped) return;
    }
  };

  const optimal = phase1LowerBound(start);
  for (let bound = optimal; bound <= maxLength; bound += 1) {
    search(start.upDown, start.frontBack, start.leftRight, 0, bound, -1);
    if (stopped || solutions.length >= maxSolutions) break;
  }

  return solutions;
}

/** The shortest phase-1 solution. */
export function phase1Search(state: Cube444State): number[] {
  const [solution] = phase1Solutions(state);
  if (!solution) {
    throw new Error('444-phase1: no solution within the length cap — the tables are wrong');
  }
  return solution;
}
