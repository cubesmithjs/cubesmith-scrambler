import {
  PERMUTATION_4_STATES,
  PERMUTATION_8_STATES,
  SOLVED_CORNER_PERM_COORD,
  SOLVED_EDGE8_PERM_COORD,
  SOLVED_UD_SLICE_ORDER_COORD,
} from './phase2-coordinates';
import { PHASE2_MOVES, nextCornerPerm, nextEdge8Perm, nextUdSliceOrder } from './phase2-tables';

/**
 * The phase-2 analogue of `phase1-pruning.ts`: two 2D distance-to-solved
 * tables, combined via `max()` into an admissible IDA* heuristic. Same BFS
 * construction and the same reason it's valid — `PHASE2_MOVES` is closed
 * under inversion (U/D quarter turns pair with their counterclockwise
 * counterpart; the four half-turn-only moves are each self-inverse), so
 * BFS outward from solved gives the true distance-to-solved for every
 * reachable pair.
 */

const UNVISITED = 255;

function buildPruningTable(
  dimA: number,
  dimB: number,
  next: (a: number, b: number, move: (typeof PHASE2_MOVES)[number]) => readonly [number, number],
  targetA: number,
  targetB: number,
): Uint8Array {
  const table = new Uint8Array(dimA * dimB).fill(UNVISITED);
  const startIndex = targetA * dimB + targetB;
  table[startIndex] = 0;

  let frontier: number[] = [startIndex];
  let depth = 0;
  let visited = 1;
  const total = dimA * dimB;

  while (frontier.length > 0 && visited < total) {
    const nextFrontier: number[] = [];
    for (const index of frontier) {
      const a = Math.floor(index / dimB);
      const b = index % dimB;
      for (const move of PHASE2_MOVES) {
        const [na, nb] = next(a, b, move);
        const nIndex = na * dimB + nb;
        if (table[nIndex] === UNVISITED) {
          table[nIndex] = depth + 1;
          nextFrontier.push(nIndex);
          visited += 1;
        }
      }
    }
    frontier = nextFrontier;
    depth += 1;
  }

  return table;
}

let cornerPermUdSliceOrderTable: Uint8Array | null = null;
let edge8PermUdSliceOrderTable: Uint8Array | null = null;

function getCornerPermUdSliceOrderTable(): Uint8Array {
  return (cornerPermUdSliceOrderTable ??= buildPruningTable(
    PERMUTATION_8_STATES,
    PERMUTATION_4_STATES,
    (cornerPerm, udSliceOrder, move) => [
      nextCornerPerm(cornerPerm, move),
      nextUdSliceOrder(udSliceOrder, move),
    ],
    SOLVED_CORNER_PERM_COORD,
    SOLVED_UD_SLICE_ORDER_COORD,
  ));
}

function getEdge8PermUdSliceOrderTable(): Uint8Array {
  return (edge8PermUdSliceOrderTable ??= buildPruningTable(
    PERMUTATION_8_STATES,
    PERMUTATION_4_STATES,
    (edge8Perm, udSliceOrder, move) => [
      nextEdge8Perm(edge8Perm, move),
      nextUdSliceOrder(udSliceOrder, move),
    ],
    SOLVED_EDGE8_PERM_COORD,
    SOLVED_UD_SLICE_ORDER_COORD,
  ));
}

export function cornerPermUdSliceOrderDistance(cornerPerm: number, udSliceOrder: number): number {
  return getCornerPermUdSliceOrderTable()[cornerPerm * PERMUTATION_4_STATES + udSliceOrder]!;
}

export function edge8PermUdSliceOrderDistance(edge8Perm: number, udSliceOrder: number): number {
  return getEdge8PermUdSliceOrderTable()[edge8Perm * PERMUTATION_4_STATES + udSliceOrder]!;
}

/** The admissible phase-2 IDA* heuristic. */
export function phase2Heuristic(cornerPerm: number, edge8Perm: number, udSliceOrder: number): number {
  return Math.max(
    cornerPermUdSliceOrderDistance(cornerPerm, udSliceOrder),
    edge8PermUdSliceOrderDistance(edge8Perm, udSliceOrder),
  );
}

/** Forces both phase-2 pruning tables to build now — for benchmarking table-build time in isolation. */
export function buildPhase2PruningTables(): void {
  getCornerPermUdSliceOrderTable();
  getEdge8PermUdSliceOrderTable();
}

export { UNVISITED as UNVISITED_DISTANCE };
