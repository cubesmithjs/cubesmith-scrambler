import {
  CORNER_ORIENTATION_STATES,
  EDGE_ORIENTATION_STATES,
  SOLVED_UD_SLICE_COORD,
  UD_SLICE_STATES,
} from './coordinates';
import { ALL_MOVES, nextFlip, nextTwist, nextUdSlice } from './phase1-tables';

/**
 * Two 2D distance-to-solved tables — `dist(twist, udSlice)` and
 * `dist(flip, udSlice)` — used together as the phase-1 IDA* heuristic:
 * `max(twistUdSliceDistance[twist][udSlice], flipUdSliceDistance[flip][udSlice])`
 * is an admissible lower bound on the true number of moves needed to reach
 * G1, since each individual table is itself an exact lower bound (you can't
 * fix a mismatched `(twist, udSlice)` pair in fewer moves than its own
 * table says, regardless of what the edge flip looks like, and vice
 * versa). This is the standard two-phase pruning-table design; the full
 * 3-coordinate space (~2.2 billion states) is never built.
 *
 * Built via BFS *from* the solved coordinate pair, outward, using the
 * forward move-transition tables — not BFS *to* solved from every state.
 * These give the same answer because the move set is closed under
 * inversion (every move's inverse is also one of the 18 moves), so the
 * transition graph is symmetric: a `depth`-move path from solved to X is
 * exactly as long as the shortest path from X to solved. Starting the
 * search at the (tiny, single-state) solved corner and growing outward
 * visits every reachable pair exactly once, breadth-first — the standard,
 * efficient way to fill a table like this.
 */

const UNVISITED = 255;

function buildPruningTable(
  dimA: number,
  dimB: number,
  next: (a: number, b: number, move: (typeof ALL_MOVES)[number]) => readonly [number, number],
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
      for (const move of ALL_MOVES) {
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

let twistUdSliceTable: Uint8Array | null = null;
let flipUdSliceTable: Uint8Array | null = null;

function getTwistUdSliceTable(): Uint8Array {
  return (twistUdSliceTable ??= buildPruningTable(
    CORNER_ORIENTATION_STATES,
    UD_SLICE_STATES,
    (twist, udSlice, move) => [nextTwist(twist, move), nextUdSlice(udSlice, move)],
    0,
    SOLVED_UD_SLICE_COORD,
  ));
}

function getFlipUdSliceTable(): Uint8Array {
  return (flipUdSliceTable ??= buildPruningTable(
    EDGE_ORIENTATION_STATES,
    UD_SLICE_STATES,
    (flip, udSlice, move) => [nextFlip(flip, move), nextUdSlice(udSlice, move)],
    0,
    SOLVED_UD_SLICE_COORD,
  ));
}

export function twistUdSliceDistance(twist: number, udSlice: number): number {
  return getTwistUdSliceTable()[twist * UD_SLICE_STATES + udSlice]!;
}

export function flipUdSliceDistance(flip: number, udSlice: number): number {
  return getFlipUdSliceTable()[flip * UD_SLICE_STATES + udSlice]!;
}

/** The admissible phase-1 IDA* heuristic: a true lower bound on moves remaining to reach G1. */
export function phase1Heuristic(twist: number, flip: number, udSlice: number): number {
  return Math.max(twistUdSliceDistance(twist, udSlice), flipUdSliceDistance(flip, udSlice));
}

/** Forces both pruning tables to build now — for benchmarking table-build time in isolation from search time. */
export function buildPhase1PruningTables(): void {
  getTwistUdSliceTable();
  getFlipUdSliceTable();
}

export { UNVISITED as UNVISITED_DISTANCE };
