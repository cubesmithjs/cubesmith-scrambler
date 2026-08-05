import type { FaceMove } from '../../notation/move';
import {
  CORNER_ORIENTATION_222_STATES,
  CORNER_PERM_222_STATES,
  cornerOrientation222Coord,
  cornerPerm222Coord,
  decodeCornerOrientation222Coord,
  decodeCornerPerm222Coord,
} from './coordinates';
import { allMoves222, applyMove222, SOLVED_222_STATE } from './state';

/** Per-move coordinate transition tables, derived the same way as `puzzles/333/phase1-tables.ts`: build one concrete state per coordinate value, run it through the already-tested `applyMove222`, re-encode. */

export const ALL_MOVES_222: readonly FaceMove[] = allMoves222();
const MOVE_COUNT_222 = ALL_MOVES_222.length; // 9

function buildTable(
  states: number,
  stateForCoord: (coord: number) => { cornerPermutation: readonly number[]; cornerOrientation: readonly number[] },
  encode: (state: { cornerPermutation: readonly number[]; cornerOrientation: readonly number[] }) => number,
): number[][] {
  const table: number[][] = [];
  for (let m = 0; m < MOVE_COUNT_222; m += 1) {
    const row = new Array<number>(states);
    const move = ALL_MOVES_222[m]!;
    for (let coord = 0; coord < states; coord += 1) {
      row[coord] = encode(applyMove222(stateForCoord(coord), move));
    }
    table.push(row);
  }
  return table;
}

let cornerPermTable: number[][] | null = null;
let cornerOrientationTable: number[][] | null = null;

function getCornerPermTable(): number[][] {
  return (cornerPermTable ??= buildTable(
    CORNER_PERM_222_STATES,
    (coord) => ({ ...SOLVED_222_STATE, cornerPermutation: decodeCornerPerm222Coord(coord) }),
    (s) => cornerPerm222Coord(s.cornerPermutation),
  ));
}

function getCornerOrientationTable(): number[][] {
  return (cornerOrientationTable ??= buildTable(
    CORNER_ORIENTATION_222_STATES,
    (coord) => ({ ...SOLVED_222_STATE, cornerOrientation: decodeCornerOrientation222Coord(coord) }),
    (s) => cornerOrientation222Coord(s.cornerOrientation),
  ));
}

const moveIndexByKey = new Map<string, number>(
  ALL_MOVES_222.map((move, i) => [`${move.face}${move.amount}`, i]),
);

function moveIndex(move: FaceMove): number {
  const index = moveIndexByKey.get(`${move.face}${move.amount}`);
  if (index === undefined) {
    throw new Error(`tables-222: no move index for ${move.face}${move.amount}`);
  }
  return index;
}

export function nextCornerPerm222(coord: number, move: FaceMove): number {
  return getCornerPermTable()[moveIndex(move)]![coord]!;
}

export function nextCornerOrientation222(coord: number, move: FaceMove): number {
  return getCornerOrientationTable()[moveIndex(move)]![coord]!;
}

/** Forces both tables to build now — for benchmarking table-build time in isolation. */
export function buildTables222(): void {
  getCornerPermTable();
  getCornerOrientationTable();
}
