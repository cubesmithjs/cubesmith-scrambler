import type { FaceMove } from '../../notation/move';
import { deriveBaseMoveTable } from '../333/geometry';

/**
 * A 2x2x2 (Pocket Cube) is literally "just the 8 corners of a 3x3x3" — same
 * 8 positions, same physical rotation mechanics. Rather than re-deriving
 * corner geometry a second time, this reuses `puzzles/333/geometry.ts`'s
 * already invariant-tested `deriveBaseMoveTable` directly, taking only its
 * corner fields (2x2x2 has no edges).
 *
 * WCA/TNoodle 2x2x2 scrambles use only the R, U, F faces — the other three
 * are redundant without fixed centers to define an absolute orientation
 * (a D turn is equivalent to some whole-cube rotation followed by a U
 * turn). Restricting to U/R/F has a useful side effect: the corner
 * opposite that "corner" (DBL, index 6 in `CORNER_POSITIONS`) is never on
 * any U, R, or F layer, so it — and its orientation — never changes under
 * this move set. That's exactly the standard "fix one corner as a
 * reference frame" convention, and it falls out automatically here rather
 * than needing special-casing.
 */

export const CORNER_COUNT_222 = 8;

export interface Cube222State {
  readonly cornerPermutation: readonly number[];
  readonly cornerOrientation: readonly number[];
}

export const SOLVED_222_STATE: Cube222State = {
  cornerPermutation: [0, 1, 2, 3, 4, 5, 6, 7],
  cornerOrientation: [0, 0, 0, 0, 0, 0, 0, 0],
};

export interface Move222Table {
  readonly cornerDestination: readonly number[];
  readonly cornerTwist: readonly number[];
}

const BASE_FACES = ['U', 'R', 'F'] as const;

function composeSelf(base: Move222Table, times: 1 | 2 | 3): Move222Table {
  let destination = Array.from({ length: CORNER_COUNT_222 }, (_, i) => i);
  let twist = new Array<number>(CORNER_COUNT_222).fill(0);

  for (let t = 0; t < times; t += 1) {
    const nextDestination = new Array<number>(CORNER_COUNT_222);
    const nextTwist = new Array<number>(CORNER_COUNT_222);
    for (let i = 0; i < CORNER_COUNT_222; i += 1) {
      const mid = destination[i]!;
      nextDestination[i] = base.cornerDestination[mid]!;
      nextTwist[i] = (twist[i]! + base.cornerTwist[mid]!) % 3;
    }
    destination = nextDestination;
    twist = nextTwist;
  }

  return { cornerDestination: destination, cornerTwist: twist };
}

function buildMoveTables222(): ReadonlyMap<string, Move222Table> {
  const tables = new Map<string, Move222Table>();
  for (const face of BASE_FACES) {
    const base = deriveBaseMoveTable(face);
    for (const amount of [1, 2, 3] as const) {
      tables.set(`${face}${amount}`, composeSelf(base, amount));
    }
  }
  return tables;
}

export const MOVE_TABLES_222: ReadonlyMap<string, Move222Table> = buildMoveTables222();

export function allMoves222(): readonly FaceMove[] {
  const moves: FaceMove[] = [];
  for (const face of BASE_FACES) {
    for (const amount of [1, 2, 3] as const) moves.push({ face, amount });
  }
  return moves;
}

function getMoveTable222(move: FaceMove): Move222Table {
  const table = MOVE_TABLES_222.get(`${move.face}${move.amount}`);
  if (!table) {
    throw new Error(`state-222: ${move.face}${move.amount} is not a valid 2x2x2 move (only U/R/F)`);
  }
  return table;
}

export function applyMove222(state: Cube222State, move: FaceMove): Cube222State {
  const table = getMoveTable222(move);
  const cornerPermutation = new Array<number>(CORNER_COUNT_222);
  const cornerOrientation = new Array<number>(CORNER_COUNT_222);
  for (let i = 0; i < CORNER_COUNT_222; i += 1) {
    const dest = table.cornerDestination[i]!;
    cornerPermutation[dest] = state.cornerPermutation[i]!;
    cornerOrientation[dest] = (state.cornerOrientation[i]! + table.cornerTwist[i]!) % 3;
  }
  return { cornerPermutation, cornerOrientation };
}

export function applyMoves222(state: Cube222State, moves: readonly FaceMove[]): Cube222State {
  return moves.reduce(applyMove222, state);
}

export function isSolved222(state: Cube222State): boolean {
  for (let i = 0; i < CORNER_COUNT_222; i += 1) {
    if (state.cornerPermutation[i] !== i || state.cornerOrientation[i] !== 0) return false;
  }
  return true;
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function statesEqual222(a: Cube222State, b: Cube222State): boolean {
  return (
    arraysEqual(a.cornerPermutation, b.cornerPermutation) &&
    arraysEqual(a.cornerOrientation, b.cornerOrientation)
  );
}
