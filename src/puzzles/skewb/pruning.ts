import {
  centerStatesSkewb,
  MOVE_COUNT_SKEWB,
  nextCenterCoordSkewb,
  nextCornerCoordSkewb,
  packSkewbCoordinate,
  skewbCoordinateStates,
  SOLVED_SKEWB_COORDINATE_INDEX,
  type SkewbCoordinate,
} from './coordinates';

/**
 * One exact distance-to-solved table over the whole 3,149,280-state space —
 * a 3.1 MB `Uint8Array`, so no phase decomposition and no approximation.
 * Same shape as `puzzles/222/pruning.ts` and `puzzles/pyraminx/pruning.ts`,
 * and with the same consequence: IDA* in `search.ts` finds an optimal
 * solution on its first iteration.
 *
 * Unlike those two, every entry here should be reachable — the coordinate
 * space was *built* from the reachable set rather than from a closed-form
 * encoding (see `coordinates.ts`). That makes full coverage a real
 * assertion rather than a tautology: it is what proves the corner and
 * center projections are genuinely independent, since their sizes were
 * discovered separately and only their product being fully reached rules
 * out a constraint linking the two.
 */

const UNVISITED = 255;

function buildPruningTable(): Uint8Array {
  const centerCount = centerStatesSkewb();
  const table = new Uint8Array(skewbCoordinateStates()).fill(UNVISITED);
  table[SOLVED_SKEWB_COORDINATE_INDEX] = 0;

  let frontier: number[] = [SOLVED_SKEWB_COORDINATE_INDEX];
  let depth = 0;

  while (frontier.length > 0) {
    const nextFrontier: number[] = [];
    for (const index of frontier) {
      const centerCoord = index % centerCount;
      const cornerCoord = (index - centerCoord) / centerCount;
      for (let m = 0; m < MOVE_COUNT_SKEWB; m += 1) {
        const nextIndex =
          nextCornerCoordSkewb(cornerCoord, m) * centerCount + nextCenterCoordSkewb(centerCoord, m);
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

export function distanceSkewb(coordinate: SkewbCoordinate): number {
  return getPruningTable()[packSkewbCoordinate(coordinate)]!;
}

export function distanceSkewbByIndex(index: number): number {
  return getPruningTable()[index]!;
}

/** Forces the pruning table to build now — for benchmarking and for the coverage tests. */
export function buildPruningTableSkewb(): Uint8Array {
  return getPruningTable();
}

export { UNVISITED as UNVISITED_DISTANCE_SKEWB };
