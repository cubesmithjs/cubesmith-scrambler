import type { FaceMove } from './move-tables';
import { moveKey } from './move-tables';
import {
  PERMUTATION_4_STATES,
  PERMUTATION_8_STATES,
  cornerPermCoord,
  decodeCornerPermCoord,
  decodeEdge8PermCoord,
  decodeUdSliceOrderCoord,
  edge8PermCoord,
  udSliceOrderCoord,
} from './phase2-coordinates';
import { applyMove, SOLVED_STATE, type CubeState } from './state';

/**
 * The 10 moves that preserve G1 (see `coordinates.ts`'s `isInG1`, and the
 * empirical check in `coordinates.test.ts`): any amount of U or D (neither
 * ever twists/flips/touches a slice edge), plus only the *half* turns of
 * F/B/L/R (a quarter turn of those leaves G1 — only 180° doesn't
 * twist/flip). Quarter turns of F/B/L/R are deliberately absent.
 */
export const PHASE2_MOVES: readonly FaceMove[] = [
  { face: 'U', amount: 1 },
  { face: 'U', amount: 2 },
  { face: 'U', amount: 3 },
  { face: 'D', amount: 1 },
  { face: 'D', amount: 2 },
  { face: 'D', amount: 3 },
  { face: 'L', amount: 2 },
  { face: 'R', amount: 2 },
  { face: 'F', amount: 2 },
  { face: 'B', amount: 2 },
];

const PHASE2_MOVE_COUNT = PHASE2_MOVES.length; // 10

function stateForCornerPerm(coord: number): CubeState {
  return { ...SOLVED_STATE, cornerPermutation: decodeCornerPermCoord(coord) as number[] };
}

function stateForEdge8Perm(coord: number): CubeState {
  const edge8 = decodeEdge8PermCoord(coord);
  return { ...SOLVED_STATE, edgePermutation: [...edge8, 8, 9, 10, 11] };
}

function stateForUdSliceOrder(coord: number): CubeState {
  const slice = decodeUdSliceOrderCoord(coord);
  return { ...SOLVED_STATE, edgePermutation: [0, 1, 2, 3, 4, 5, 6, 7, ...slice] };
}

function buildTable(
  states: number,
  stateForCoord: (coord: number) => CubeState,
  encode: (state: CubeState) => number,
): number[][] {
  const table: number[][] = [];
  for (let m = 0; m < PHASE2_MOVE_COUNT; m += 1) {
    const row = new Array<number>(states);
    const move = PHASE2_MOVES[m]!;
    for (let coord = 0; coord < states; coord += 1) {
      row[coord] = encode(applyMove(stateForCoord(coord), move));
    }
    table.push(row);
  }
  return table;
}

let cornerPermTable: number[][] | null = null;
let edge8PermTable: number[][] | null = null;
let udSliceOrderTable: number[][] | null = null;

function getCornerPermTable(): number[][] {
  return (cornerPermTable ??= buildTable(PERMUTATION_8_STATES, stateForCornerPerm, (s) =>
    cornerPermCoord(s.cornerPermutation),
  ));
}

function getEdge8PermTable(): number[][] {
  return (edge8PermTable ??= buildTable(PERMUTATION_8_STATES, stateForEdge8Perm, (s) =>
    edge8PermCoord(s.edgePermutation),
  ));
}

function getUdSliceOrderTable(): number[][] {
  return (udSliceOrderTable ??= buildTable(PERMUTATION_4_STATES, stateForUdSliceOrder, (s) =>
    udSliceOrderCoord(s.edgePermutation),
  ));
}

const phase2MoveIndexByKey = new Map<string, number>(
  PHASE2_MOVES.map((move, i) => [moveKey(move), i]),
);

export function phase2MoveIndex(move: FaceMove): number {
  const index = phase2MoveIndexByKey.get(moveKey(move));
  if (index === undefined) {
    throw new Error(`phase2-tables: ${moveKey(move)} is not a phase-2 (G1-preserving) move`);
  }
  return index;
}

export function nextCornerPerm(coord: number, move: FaceMove): number {
  return getCornerPermTable()[phase2MoveIndex(move)]![coord]!;
}

export function nextEdge8Perm(coord: number, move: FaceMove): number {
  return getEdge8PermTable()[phase2MoveIndex(move)]![coord]!;
}

export function nextUdSliceOrder(coord: number, move: FaceMove): number {
  return getUdSliceOrderTable()[phase2MoveIndex(move)]![coord]!;
}

/** Forces all three phase-2 tables to build now — for benchmarking table-build time in isolation. */
export function buildPhase2Tables(): void {
  getCornerPermTable();
  getEdge8PermTable();
  getUdSliceOrderTable();
}
