import { SLICE, type Square1Move } from './notation';
import {
  PERMUTATION_COUNT,
  SOLVED_ALIGNMENT_INDEX,
  toPhase2Coordinate,
  type Phase2Coordinate,
} from './phase2-coordinates';
import {
  PHASE2_BACKWARD_RADIUS,
  phase2BackwardLookup,
  phase2BackwardTable,
  phase2CornerPruning,
  phase2EdgePruning,
  phase2MoveTables,
} from './phase2-tables';
import type { Square1State } from './state';

/**
 * Phase 2: from square layers to solved, without ever leaving square layers.
 *
 * ## Shape of the search
 *
 * Iterative deepening A\*, over the four-number coordinate rather than over
 * piece arrays — every node is three table lookups and some integer arithmetic.
 *
 * The move sequence **alternates**: two turns in a row would compose into one
 * turn (cheaper, so never optimal) and two slices in a row cancel. So a
 * solution is always `turn? (slice turn?)*`, and the search expands *groups*:
 * a turn followed by a slice (cost 2), or a bare slice when the alignment
 * already allows one (cost 1), plus an optional single closing turn (cost 1).
 *
 * That collapses the branching factor. All 143 turns are legal moves, but only
 * those landing on a **complementary** alignment can be followed by a slice —
 * `x` and `y` each pinned mod 3, so 4 x 4 amounts for each of the two
 * complementary targets: **32 groups per node**, not 143.
 *
 * ## Heuristic
 *
 * `max(corner table, edge table)`, both exact distances over a projection that
 * forgets the other permutation (see `phase2-tables.ts` for why dropping one
 * coordinate keeps the estimate admissible). Each table has radius 15, so it
 * guides the search over essentially the whole depth phase 2 ever needs.
 *
 * IDA\* with an admissible heuristic returns an **optimal** phase-2 solution,
 * which is what makes the two-phase total honest: the only sub-optimality in
 * the final answer comes from the phase boundary, not from either search.
 */

export interface Phase2Options {
  /** Give up beyond this many moves. Used to prune when a better total is already known. */
  readonly maxLength?: number;
  /** Give up after this many expanded nodes, so a pathological state cannot hang a caller. */
  readonly nodeBudget?: number;
}

interface Phase2Plan {
  /** Turn indices that leave the alignment able to slice, per alignment. */
  readonly enabling: readonly (readonly number[])[];
  /** Turn indices that land on the solved alignment, per alignment. */
  readonly closing: readonly (readonly number[])[];
}

let plan: Phase2Plan | undefined;

function phase2Plan(): Phase2Plan {
  if (plan) return plan;
  const { turns, turnAlignment, sliceAlignment } = phase2MoveTables();
  const enabling: number[][] = [];
  const closing: number[][] = [];

  for (let alignment = 0; alignment < sliceAlignment.length; alignment += 1) {
    const canSlice: number[] = [];
    const canClose: number[] = [];
    for (let turn = 0; turn < turns.length; turn += 1) {
      const landed = turnAlignment[alignment * turns.length + turn]!;
      if (sliceAlignment[landed]! >= 0) canSlice.push(turn);
      if (landed === SOLVED_ALIGNMENT_INDEX) canClose.push(turn);
    }
    enabling.push(canSlice);
    closing.push(canClose);
  }

  plan = { enabling, closing };
  return plan;
}

export class Phase2BudgetExceededError extends Error {
  constructor(nodes: number) {
    super(`@cubesmith/scrambler: Square-1 phase 2 gave up after ${nodes} nodes`);
    this.name = 'Phase2BudgetExceededError';
  }
}

/**
 * An optimal phase-2 solution, or `undefined` when none exists within
 * `maxLength`. Throws only if the node budget runs out, which is a bug signal
 * rather than a normal outcome.
 */
export function phase2Search(
  state: Square1State | Phase2Coordinate,
  options: Phase2Options = {},
): Square1Move[] | undefined {
  const coordinate =
    'slots' in state ? toPhase2Coordinate(state as Square1State) : (state as Phase2Coordinate);

  const tables = phase2MoveTables();
  const { turns, turnAlignment, turnCornerMap, turnEdgeMap } = tables;
  const { sliceAlignment, sliceCornerMap, sliceEdgeMap, permMove } = tables;
  const cornerPruning = phase2CornerPruning();
  const edgePruning = phase2EdgePruning();
  const { enabling } = phase2Plan();
  const turnCount = turns.length;

  const maxLength = options.maxLength ?? 40;
  const nodeBudget = options.nodeBudget ?? 40_000_000;
  let nodes = 0;

  const heuristic = (alignment: number, middle: number, corners: number, edges: number): number =>
    Math.max(
      cornerPruning[(alignment * 2 + middle) * PERMUTATION_COUNT + corners]!,
      edgePruning[(alignment * 2 + middle) * PERMUTATION_COUNT + edges]!,
    );

  const path: Square1Move[] = [];
  const backward = phase2BackwardTable();

  /**
   * Walks the backward table down to solved, appending the moves. Every step
   * must find a neighbour exactly one closer, because the table holds exact
   * breadth-first distances.
   */
  const finishFromTable = (
    alignment: number,
    middle: number,
    corners: number,
    edges: number,
    remaining: number,
  ): void => {
    let at = { alignment, middle, corners, edges };
    for (let left = remaining; left > 0; left -= 1) {
      const sliced = sliceAlignment[at.alignment]!;
      if (sliced >= 0) {
        const next = {
          alignment: sliced,
          middle: 1 - at.middle,
          corners: permMove[sliceCornerMap[at.alignment]! * PERMUTATION_COUNT + at.corners]!,
          edges: permMove[sliceEdgeMap[at.alignment]! * PERMUTATION_COUNT + at.edges]!,
        };
        if (
          phase2BackwardLookup(backward, next.alignment, next.middle, next.corners, next.edges) ===
          left - 1
        ) {
          path.push(SLICE);
          at = next;
          continue;
        }
      }

      let stepped = false;
      for (let turn = 0; turn < turnCount; turn += 1) {
        const index = at.alignment * turnCount + turn;
        const next = {
          alignment: turnAlignment[index]!,
          middle: at.middle,
          corners: permMove[turnCornerMap[index]! * PERMUTATION_COUNT + at.corners]!,
          edges: permMove[turnEdgeMap[index]! * PERMUTATION_COUNT + at.edges]!,
        };
        if (
          phase2BackwardLookup(backward, next.alignment, next.middle, next.corners, next.edges) !==
          left - 1
        ) {
          continue;
        }
        path.push(turns[turn]!);
        at = next;
        stepped = true;
        break;
      }
      if (!stepped) {
        throw new Error('@cubesmith/scrambler: Square-1 backward table has no descending move');
      }
    }
  };

  const search = (
    alignment: number,
    middle: number,
    corners: number,
    edges: number,
    cost: number,
    bound: number,
  ): boolean => {
    nodes += 1;
    if (nodes > nodeBudget) throw new Phase2BudgetExceededError(nodes);

    const estimate = heuristic(alignment, middle, corners, edges);
    if (cost + estimate > bound) return false;

    if (estimate === 0) return true;

    /*
     * Meet in the middle — but only ask the table when the state could possibly
     * be in it. The estimate is a lower bound on the true distance, so
     * `estimate > radius` proves the state is out of range and the hash lookup
     * would be wasted. Since the estimate is 11-13 near the root and only falls
     * near the end, that gate skips the lookup at the overwhelming majority of
     * nodes — and a `Map.get` is an order of magnitude dearer than the typed
     * array reads the rest of a node costs.
     */
    if (estimate <= PHASE2_BACKWARD_RADIUS) {
      const stored = phase2BackwardLookup(backward, alignment, middle, corners, edges);
      if (stored >= 0) {
        if (cost + stored > bound) return false;
        finishFromTable(alignment, middle, corners, edges, stored);
        return true;
      }
      // Absent from the table means further away than its radius, so this node
      // needs at least one more move than the table can supply.
      if (cost + PHASE2_BACKWARD_RADIUS >= bound) return false;
    }

    // A bare slice, when this alignment already allows one.
    if (sliceAlignment[alignment]! >= 0 && cost + 1 <= bound) {
      path.push(SLICE);
      if (
        search(
          sliceAlignment[alignment]!,
          1 - middle,
          permMove[sliceCornerMap[alignment]! * PERMUTATION_COUNT + corners]!,
          permMove[sliceEdgeMap[alignment]! * PERMUTATION_COUNT + edges]!,
          cost + 1,
          bound,
        )
      ) {
        return true;
      }
      path.pop();
    }

    if (cost + 2 > bound) return false;

    for (const turn of enabling[alignment]!) {
      const at = alignment * turnCount + turn;
      const turnedAlignment = turnAlignment[at]!;
      const turnedCorners = permMove[turnCornerMap[at]! * PERMUTATION_COUNT + corners]!;
      const turnedEdges = permMove[turnEdgeMap[at]! * PERMUTATION_COUNT + edges]!;

      path.push(turns[turn]!, SLICE);
      if (
        search(
          sliceAlignment[turnedAlignment]!,
          1 - middle,
          permMove[sliceCornerMap[turnedAlignment]! * PERMUTATION_COUNT + turnedCorners]!,
          permMove[sliceEdgeMap[turnedAlignment]! * PERMUTATION_COUNT + turnedEdges]!,
          cost + 2,
          bound,
        )
      ) {
        return true;
      }
      path.pop();
      path.pop();
    }

    return false;
  };

  const middle = coordinate.middleFlipped ? 1 : 0;
  const start = heuristic(coordinate.alignment, middle, coordinate.corners, coordinate.edges);

  for (let bound = start; bound <= maxLength; bound += 1) {
    path.length = 0;
    if (search(coordinate.alignment, middle, coordinate.corners, coordinate.edges, 0, bound)) {
      return [...path];
    }
  }

  return undefined;
}

/** The heuristic on its own — an admissible lower bound on the phase-2 distance. */
export function phase2LowerBound(state: Square1State | Phase2Coordinate): number {
  const coordinate =
    'slots' in state ? toPhase2Coordinate(state as Square1State) : (state as Phase2Coordinate);
  const middle = coordinate.middleFlipped ? 1 : 0;
  return Math.max(
    phase2CornerPruning()[
      (coordinate.alignment * 2 + middle) * PERMUTATION_COUNT + coordinate.corners
    ]!,
    phase2EdgePruning()[
      (coordinate.alignment * 2 + middle) * PERMUTATION_COUNT + coordinate.edges
    ]!,
  );
}
