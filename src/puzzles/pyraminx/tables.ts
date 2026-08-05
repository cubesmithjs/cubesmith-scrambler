import { allLayerMovesPyraminx, type PyraminxMove } from './notation';
import {
  AXIAL_PYRAMINX_STATES,
  axialPyraminxCoord,
  decodeAxialPyraminxCoord,
  decodeEdgeOrientationPyraminxCoord,
  decodeEdgePermPyraminxCoord,
  EDGE_ORIENTATION_PYRAMINX_STATES,
  EDGE_PERM_PYRAMINX_STATES,
  edgeOrientationPyraminxCoord,
  edgePermPyraminxCoord,
} from './coordinates';
import { applyPyraminxMove, SOLVED_PYRAMINX_STATE } from './state';

/**
 * Per-move transition tables for each of the three coordinates, built the
 * same way as `puzzles/222/tables.ts`: decode a coordinate into one concrete
 * state, push it through the already-invariant-tested `applyPyraminxMove`,
 * re-encode. Nothing here re-derives the puzzle's mechanics a second time,
 * so there is no second place for them to be wrong.
 *
 * All three coordinates are independently closed under the move set:
 * permutation obviously, orientation because it's stored per-*slot* (a move
 * maps slot `i`'s value to slot `dest(i)` with a fixed flip, regardless of
 * which piece is there), and the axial twists because they're pure counters.
 */

export const ALL_LAYER_MOVES_PYRAMINX: readonly PyraminxMove[] = allLayerMovesPyraminx();
const MOVE_COUNT = ALL_LAYER_MOVES_PYRAMINX.length; // 8

function buildTable(
  states: number,
  stateForCoord: (coord: number) => Parameters<typeof applyPyraminxMove>[0],
  encode: (state: ReturnType<typeof applyPyraminxMove>) => number,
): number[][] {
  const table: number[][] = [];
  for (let m = 0; m < MOVE_COUNT; m += 1) {
    const move = ALL_LAYER_MOVES_PYRAMINX[m]!;
    const row = new Array<number>(states);
    for (let coord = 0; coord < states; coord += 1) {
      row[coord] = encode(applyPyraminxMove(stateForCoord(coord), move));
    }
    table.push(row);
  }
  return table;
}

let edgePermTable: number[][] | null = null;
let edgeOrientationTable: number[][] | null = null;
let axialTable: number[][] | null = null;

function getEdgePermTable(): number[][] {
  return (edgePermTable ??= buildTable(
    EDGE_PERM_PYRAMINX_STATES,
    (coord) => ({ ...SOLVED_PYRAMINX_STATE, edgePermutation: decodeEdgePermPyraminxCoord(coord) }),
    (s) => edgePermPyraminxCoord(s.edgePermutation),
  ));
}

function getEdgeOrientationTable(): number[][] {
  return (edgeOrientationTable ??= buildTable(
    EDGE_ORIENTATION_PYRAMINX_STATES,
    (coord) => ({
      ...SOLVED_PYRAMINX_STATE,
      edgeOrientation: decodeEdgeOrientationPyraminxCoord(coord),
    }),
    (s) => edgeOrientationPyraminxCoord(s.edgeOrientation),
  ));
}

function getAxialTable(): number[][] {
  return (axialTable ??= buildTable(
    AXIAL_PYRAMINX_STATES,
    (coord) => ({ ...SOLVED_PYRAMINX_STATE, axialOrientation: decodeAxialPyraminxCoord(coord) }),
    (s) => axialPyraminxCoord(s.axialOrientation),
  ));
}

const moveIndexByKey = new Map<string, number>(
  ALL_LAYER_MOVES_PYRAMINX.map((move, i) => [`${move.vertex}${move.amount}`, i]),
);

export function layerMoveIndex(move: PyraminxMove): number {
  const index = moveIndexByKey.get(`${move.vertex}${move.amount}`);
  if (index === undefined || move.tip) {
    throw new Error(`pyraminx-tables: ${move.vertex}${move.amount} is not a searchable layer move`);
  }
  return index;
}

export function nextEdgePermPyraminx(coord: number, moveIdx: number): number {
  return getEdgePermTable()[moveIdx]![coord]!;
}

export function nextEdgeOrientationPyraminx(coord: number, moveIdx: number): number {
  return getEdgeOrientationTable()[moveIdx]![coord]!;
}

export function nextAxialPyraminx(coord: number, moveIdx: number): number {
  return getAxialTable()[moveIdx]![coord]!;
}

/** Forces all three tables to build now — for benchmarking table-build time in isolation. */
export function buildTablesPyraminx(): void {
  getEdgePermTable();
  getEdgeOrientationTable();
  getAxialTable();
}
