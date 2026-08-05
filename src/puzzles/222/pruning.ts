import {
  CORNER_ORIENTATION_222_STATES,
  CORNER_PERM_222_STATES,
  SOLVED_CORNER_ORIENTATION_222_COORD,
  SOLVED_CORNER_PERM_222_COORD,
} from './coordinates';
import { ALL_MOVES_222, nextCornerOrientation222, nextCornerPerm222 } from './tables';

/**
 * Unlike `puzzles/333/`, 2x2x2's *entire* reachable space (5040 × 729 =
 * 3,674,160) fits in a single pruning table — no two-phase projection
 * needed. This table therefore holds the *exact* distance to solved for
 * every reachable state, not a lower-bound approximation, which makes the
 * IDA* search in `search.ts` effectively optimal on its very first
 * iteration. Same BFS-from-solved construction and the same reason it's
 * valid (the move set is closed under inversion) as `puzzles/333/`'s
 * pruning tables.
 */

const UNVISITED = 255;

function buildPruningTable(): Uint8Array {
  const dimB = CORNER_ORIENTATION_222_STATES;
  const table = new Uint8Array(CORNER_PERM_222_STATES * dimB).fill(UNVISITED);
  const startIndex = SOLVED_CORNER_PERM_222_COORD * dimB + SOLVED_CORNER_ORIENTATION_222_COORD;
  table[startIndex] = 0;

  let frontier: number[] = [startIndex];
  let depth = 0;
  let visited = 1;
  const total = table.length;

  while (frontier.length > 0 && visited < total) {
    const nextFrontier: number[] = [];
    for (const index of frontier) {
      const perm = Math.floor(index / dimB);
      const orientation = index % dimB;
      for (const move of ALL_MOVES_222) {
        const nPerm = nextCornerPerm222(perm, move);
        const nOrientation = nextCornerOrientation222(orientation, move);
        const nIndex = nPerm * dimB + nOrientation;
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

let pruningTable: Uint8Array | null = null;

function getPruningTable(): Uint8Array {
  return (pruningTable ??= buildPruningTable());
}

export function distance222(cornerPerm: number, cornerOrientation: number): number {
  return getPruningTable()[cornerPerm * CORNER_ORIENTATION_222_STATES + cornerOrientation]!;
}

/** Forces the pruning table to build now — for benchmarking table-build time in isolation. */
export function buildPruningTable222(): void {
  getPruningTable();
}

export { UNVISITED as UNVISITED_DISTANCE_222 };
