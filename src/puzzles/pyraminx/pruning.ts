import {
  AXIAL_PYRAMINX_STATES,
  EDGE_ORIENTATION_PYRAMINX_STATES,
  packPyraminxCoordinate,
  PYRAMINX_COORDINATE_STATES,
  SOLVED_PYRAMINX_COORDINATE,
  type PyraminxCoordinate,
} from './coordinates';
import {
  ALL_LAYER_MOVES_PYRAMINX,
  nextAxialPyraminx,
  nextEdgeOrientationPyraminx,
  nextEdgePermPyraminx,
} from './tables';

/**
 * One exact distance-to-solved table over the whole encodable coordinate
 * space — the same "small enough for a single table" shape as
 * `puzzles/222/pruning.ts`, not 333's two-phase decomposition, because 3.7M
 * entries is a 3.7 MB `Uint8Array` and a sub-second BFS.
 *
 * Because the table holds *exact* distances (not a lower-bound projection),
 * IDA* in `search.ts` finds an optimal solution on its first iteration.
 *
 * The BFS also doubles as the reachability oracle: it starts from solved and
 * only ever follows real moves, so whatever it fails to reach is genuinely
 * unreachable. `UNVISITED` therefore isn't a gap to work around — it's the
 * proof that only a quarter of the encodable space is a real Pyraminx state.
 */

const UNVISITED = 255;

function buildPruningTable(): Uint8Array {
  const table = new Uint8Array(PYRAMINX_COORDINATE_STATES).fill(UNVISITED);
  const start = packPyraminxCoordinate(SOLVED_PYRAMINX_COORDINATE);
  table[start] = 0;

  let frontier: number[] = [start];
  let depth = 0;

  while (frontier.length > 0) {
    const nextFrontier: number[] = [];
    for (const index of frontier) {
      const axial = index % AXIAL_PYRAMINX_STATES;
      const rest = (index - axial) / AXIAL_PYRAMINX_STATES;
      const orientation = rest % EDGE_ORIENTATION_PYRAMINX_STATES;
      const perm = (rest - orientation) / EDGE_ORIENTATION_PYRAMINX_STATES;

      for (let m = 0; m < ALL_LAYER_MOVES_PYRAMINX.length; m += 1) {
        const nextIndex =
          (nextEdgePermPyraminx(perm, m) * EDGE_ORIENTATION_PYRAMINX_STATES +
            nextEdgeOrientationPyraminx(orientation, m)) *
            AXIAL_PYRAMINX_STATES +
          nextAxialPyraminx(axial, m);
        if (table[nextIndex] === UNVISITED) {
          table[nextIndex] = depth + 1;
          nextFrontier.push(nextIndex);
        }
      }
    }
    frontier = nextFrontier;
    depth += 1;
  }

  return table;
}

let pruningTable: Uint8Array | null = null;

function getPruningTable(): Uint8Array {
  return (pruningTable ??= buildPruningTable());
}

/** Exact number of layer turns needed to solve this coordinate, or `UNVISITED_DISTANCE_PYRAMINX` if it isn't a reachable state. */
export function distancePyraminx(coordinate: PyraminxCoordinate): number {
  return getPruningTable()[packPyraminxCoordinate(coordinate)]!;
}

export function distancePyraminxByIndex(index: number): number {
  return getPruningTable()[index]!;
}

/** Forces the pruning table to build now — for benchmarking and for the reachability tests. */
export function buildPruningTablePyraminx(): Uint8Array {
  return getPruningTable();
}

export { UNVISITED as UNVISITED_DISTANCE_PYRAMINX };
