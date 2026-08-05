import {
  CORNER_ORIENTATION_STATES,
  EDGE_ORIENTATION_STATES,
  UD_SLICE_STATES,
  cornerOrientationCoord,
  decodeCornerOrientationCoord,
  decodeEdgeOrientationCoord,
  decodeUdSliceCoord,
  edgeOrientationCoord,
  udSliceCoord,
} from './coordinates';
import { allFaceMoves, moveKey, type FaceMove } from './move-tables';
import { applyMove, EDGE_COUNT, SOLVED_STATE, type CubeState } from './state';

/**
 * Per-move transition tables for the three phase-1 coordinates, each
 * `[moveIndex][coordinateValue] -> newCoordinateValue`.
 *
 * These are *derived*, not hand-computed: a coordinate's transition under a
 * move only depends on the corresponding piece of state (orientation
 * transitions never depend on which piece occupies a position — see the
 * doc comment below — and `udSliceCoord` only depends on slice-piece
 * *membership*, not exact identity), so each table entry is built by
 * constructing one concrete `CubeState` matching that coordinate value,
 * running it through the already-invariant-tested `applyMove`, and
 * re-encoding the result. This reuses `state.ts`/`move-tables.ts` as the
 * single source of truth for cube mechanics rather than re-deriving
 * transition rules a second time by hand.
 */

export const ALL_MOVES: readonly FaceMove[] = allFaceMoves();
const MOVE_COUNT = ALL_MOVES.length; // 18

/**
 * Why orientation-coordinate transitions don't depend on permutation:
 * `applyMove` sets `newOrientation[dest] = (oldOrientation[srcPos] +
 * table.twist[srcPos]) % base` — a function of the orientation value
 * *at a position* and the move's fixed per-position delta, never of which
 * piece is sitting there. So a full 8-tuple (or 12-tuple) of
 * position-indexed orientation values transforms identically no matter
 * which permutation it's paired with — which is exactly what makes an
 * orientation coordinate a valid, independent search coordinate at all.
 */
function stateForTwist(coord: number): CubeState {
  return { ...SOLVED_STATE, cornerOrientation: decodeCornerOrientationCoord(coord) };
}

function stateForFlip(coord: number): CubeState {
  return { ...SOLVED_STATE, edgeOrientation: decodeEdgeOrientationCoord(coord) };
}

/** Any concrete edge permutation whose slice-origin pieces (8–11) occupy exactly `positions` — the specific assignment within/outside that set doesn't matter, since `udSliceCoord` only reads set membership. */
function edgePermutationForUdSlice(positions: readonly number[]): number[] {
  const permutation = new Array<number>(EDGE_COUNT).fill(-1);
  const slicePieces = [8, 9, 10, 11];
  positions.forEach((pos, i) => {
    permutation[pos] = slicePieces[i]!;
  });
  const nonSlicePositions = Array.from({ length: EDGE_COUNT }, (_, i) => i).filter(
    (i) => !positions.includes(i),
  );
  const nonSlicePieces = [0, 1, 2, 3, 4, 5, 6, 7];
  nonSlicePositions.forEach((pos, i) => {
    permutation[pos] = nonSlicePieces[i]!;
  });
  return permutation;
}

function stateForUdSlice(coord: number): CubeState {
  const positions = decodeUdSliceCoord(coord);
  return { ...SOLVED_STATE, edgePermutation: edgePermutationForUdSlice(positions) };
}

function buildTable(
  states: number,
  stateForCoord: (coord: number) => CubeState,
  encode: (state: CubeState) => number,
): number[][] {
  const table: number[][] = [];
  for (let m = 0; m < MOVE_COUNT; m += 1) {
    const row = new Array<number>(states);
    const move = ALL_MOVES[m]!;
    for (let coord = 0; coord < states; coord += 1) {
      const next = applyMove(stateForCoord(coord), move);
      row[coord] = encode(next);
    }
    table.push(row);
  }
  return table;
}

let twistTable: number[][] | null = null;
let flipTable: number[][] | null = null;
let udSliceTable: number[][] | null = null;

function getTwistTable(): number[][] {
  return (twistTable ??= buildTable(CORNER_ORIENTATION_STATES, stateForTwist, (s) =>
    cornerOrientationCoord(s.cornerOrientation),
  ));
}

function getFlipTable(): number[][] {
  return (flipTable ??= buildTable(EDGE_ORIENTATION_STATES, stateForFlip, (s) =>
    edgeOrientationCoord(s.edgeOrientation),
  ));
}

function getUdSliceTable(): number[][] {
  return (udSliceTable ??= buildTable(UD_SLICE_STATES, stateForUdSlice, (s) =>
    udSliceCoord(s.edgePermutation),
  ));
}

const moveIndexByKey = new Map<string, number>(ALL_MOVES.map((move, i) => [moveKey(move), i]));

export function moveIndex(move: FaceMove): number {
  const index = moveIndexByKey.get(moveKey(move));
  if (index === undefined) {
    throw new Error(`phase1-tables: no move index for ${moveKey(move)}`);
  }
  return index;
}

export function nextTwist(coord: number, move: FaceMove): number {
  return getTwistTable()[moveIndex(move)]![coord]!;
}

export function nextFlip(coord: number, move: FaceMove): number {
  return getFlipTable()[moveIndex(move)]![coord]!;
}

export function nextUdSlice(coord: number, move: FaceMove): number {
  return getUdSliceTable()[moveIndex(move)]![coord]!;
}

/** Forces all three phase-1 tables to build now rather than lazily on first use — useful for benchmarking table-build time in isolation. */
export function buildPhase1Tables(): void {
  getTwistTable();
  getFlipTable();
  getUdSliceTable();
}
