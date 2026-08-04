import { getMoveTable, type FaceMove, type MoveTable } from './move-tables';

export const CORNER_COUNT = 8;
export const EDGE_COUNT = 12;

/**
 * A 3x3x3 cube state, cubie-level (corner permutation+orientation, edge
 * permutation+orientation) rather than facelet-level — the representation
 * that makes the coordinate reduction used by the two-phase search (M4/M5)
 * tractable. `cornerPermutation[i]` / `edgePermutation[i]` is the original
 * piece index currently sitting at position `i`; `cornerOrientation[i]` /
 * `edgeOrientation[i]` is that position's current twist/flip.
 */
export interface CubeState {
  readonly cornerPermutation: readonly number[];
  readonly cornerOrientation: readonly number[];
  readonly edgePermutation: readonly number[];
  readonly edgeOrientation: readonly number[];
}

export const SOLVED_STATE: CubeState = {
  cornerPermutation: [0, 1, 2, 3, 4, 5, 6, 7],
  cornerOrientation: [0, 0, 0, 0, 0, 0, 0, 0],
  edgePermutation: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  edgeOrientation: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

function applyTable(state: CubeState, table: MoveTable): CubeState {
  const cornerPermutation = new Array<number>(CORNER_COUNT);
  const cornerOrientation = new Array<number>(CORNER_COUNT);
  const edgePermutation = new Array<number>(EDGE_COUNT);
  const edgeOrientation = new Array<number>(EDGE_COUNT);

  for (let i = 0; i < CORNER_COUNT; i += 1) {
    const dest = table.cornerDestination[i]!;
    cornerPermutation[dest] = state.cornerPermutation[i]!;
    cornerOrientation[dest] = (state.cornerOrientation[i]! + table.cornerTwist[i]!) % 3;
  }
  for (let i = 0; i < EDGE_COUNT; i += 1) {
    const dest = table.edgeDestination[i]!;
    edgePermutation[dest] = state.edgePermutation[i]!;
    edgeOrientation[dest] = (state.edgeOrientation[i]! + table.edgeFlip[i]!) % 2;
  }

  return { cornerPermutation, cornerOrientation, edgePermutation, edgeOrientation };
}

/** Applies a single face move (e.g. `{ face: 'R', amount: 1 }` = `R`) to a state, returning a new state. */
export function applyMove(state: CubeState, move: FaceMove): CubeState {
  return applyTable(state, getMoveTable(move));
}

/** Applies a sequence of face moves in order, left to right. */
export function applyMoves(state: CubeState, moves: readonly FaceMove[]): CubeState {
  return moves.reduce(applyMove, state);
}

export function isSolved(state: CubeState): boolean {
  for (let i = 0; i < CORNER_COUNT; i += 1) {
    if (state.cornerPermutation[i] !== i || state.cornerOrientation[i] !== 0) return false;
  }
  for (let i = 0; i < EDGE_COUNT; i += 1) {
    if (state.edgePermutation[i] !== i || state.edgeOrientation[i] !== 0) return false;
  }
  return true;
}

export function statesEqual(a: CubeState, b: CubeState): boolean {
  return (
    arraysEqual(a.cornerPermutation, b.cornerPermutation) &&
    arraysEqual(a.cornerOrientation, b.cornerOrientation) &&
    arraysEqual(a.edgePermutation, b.edgePermutation) &&
    arraysEqual(a.edgeOrientation, b.edgeOrientation)
  );
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
