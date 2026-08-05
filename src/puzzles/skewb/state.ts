import type { SkewbAmount, SkewbCorner, SkewbMove } from './notation';
import { SKEWB_CORNERS } from './notation';
import {
  CENTER_COUNT_SKEWB,
  CORNER_COUNT_SKEWB,
  deriveTurnTableSkewb,
  HELD_CORNER_INDEX,
  type SkewbTurnTable,
} from './geometry';

/**
 * A Skewb state, piece-level: 8 corners (permutation + twist in `Z3`) and 6
 * centers (permutation only — a Skewb center is a single square of one
 * color, so it has no orientation to track).
 *
 * Arrays are indexed by *slot*, the same convention as every other puzzle
 * here: `cornerPermutation[i]` is which piece currently sits at corner slot
 * `i`.
 *
 * Slot 0 is the corner Fixed Corner Notation holds still. Nothing in this
 * module special-cases it — it simply never appears on the moving side of
 * any turn, which is exactly what makes the notation's four letters a valid
 * reference frame for a puzzle that has no fixed centers.
 */
export interface SkewbState {
  readonly cornerPermutation: readonly number[];
  readonly cornerOrientation: readonly number[];
  readonly centerPermutation: readonly number[];
}

export const SOLVED_SKEWB_STATE: SkewbState = {
  cornerPermutation: [0, 1, 2, 3, 4, 5, 6, 7],
  cornerOrientation: [0, 0, 0, 0, 0, 0, 0, 0],
  centerPermutation: [0, 1, 2, 3, 4, 5],
};

/** Composes a clockwise turn table with itself — the counterclockwise turn is just the clockwise one twice, since the turn has order 3. */
function composeSelf(base: SkewbTurnTable, times: SkewbAmount): SkewbTurnTable {
  let cornerDestination = Array.from({ length: CORNER_COUNT_SKEWB }, (_, i) => i);
  let cornerTwist = new Array<number>(CORNER_COUNT_SKEWB).fill(0);
  let centerDestination = Array.from({ length: CENTER_COUNT_SKEWB }, (_, i) => i);

  for (let t = 0; t < times; t += 1) {
    const nextCornerDestination = new Array<number>(CORNER_COUNT_SKEWB);
    const nextCornerTwist = new Array<number>(CORNER_COUNT_SKEWB);
    for (let i = 0; i < CORNER_COUNT_SKEWB; i += 1) {
      const mid = cornerDestination[i]!;
      nextCornerDestination[i] = base.cornerDestination[mid]!;
      nextCornerTwist[i] = (cornerTwist[i]! + base.cornerTwist[mid]!) % 3;
    }
    const nextCenterDestination = new Array<number>(CENTER_COUNT_SKEWB);
    for (let i = 0; i < CENTER_COUNT_SKEWB; i += 1) {
      nextCenterDestination[i] = base.centerDestination[centerDestination[i]!]!;
    }
    cornerDestination = nextCornerDestination;
    cornerTwist = nextCornerTwist;
    centerDestination = nextCenterDestination;
  }

  return { corner: base.corner, cornerDestination, cornerTwist, centerDestination };
}

function buildTurnTables(): ReadonlyMap<string, SkewbTurnTable> {
  const tables = new Map<string, SkewbTurnTable>();
  for (const corner of SKEWB_CORNERS) {
    const base = deriveTurnTableSkewb(corner);
    for (const amount of [1, 2] as const) tables.set(`${corner}${amount}`, composeSelf(base, amount));
  }
  return tables;
}

const TURN_TABLES: ReadonlyMap<string, SkewbTurnTable> = buildTurnTables();

export function getSkewbTurnTable(corner: SkewbCorner, amount: SkewbAmount): SkewbTurnTable {
  const table = TURN_TABLES.get(`${corner}${amount}`);
  if (!table) throw new Error(`skewb-state: no turn table for ${corner}${amount}`);
  return table;
}

export function applySkewbMove(state: SkewbState, move: SkewbMove): SkewbState {
  const table = getSkewbTurnTable(move.corner, move.amount);

  const cornerPermutation = new Array<number>(CORNER_COUNT_SKEWB);
  const cornerOrientation = new Array<number>(CORNER_COUNT_SKEWB);
  for (let i = 0; i < CORNER_COUNT_SKEWB; i += 1) {
    const dest = table.cornerDestination[i]!;
    cornerPermutation[dest] = state.cornerPermutation[i]!;
    cornerOrientation[dest] = (state.cornerOrientation[i]! + table.cornerTwist[i]!) % 3;
  }

  const centerPermutation = new Array<number>(CENTER_COUNT_SKEWB);
  for (let i = 0; i < CENTER_COUNT_SKEWB; i += 1) {
    centerPermutation[table.centerDestination[i]!] = state.centerPermutation[i]!;
  }

  return { cornerPermutation, cornerOrientation, centerPermutation };
}

export function applySkewbMoves(state: SkewbState, moves: readonly SkewbMove[]): SkewbState {
  return moves.reduce(applySkewbMove, state);
}

export function isSolvedSkewb(state: SkewbState): boolean {
  for (let i = 0; i < CORNER_COUNT_SKEWB; i += 1) {
    if (state.cornerPermutation[i] !== i || state.cornerOrientation[i] !== 0) return false;
  }
  for (let i = 0; i < CENTER_COUNT_SKEWB; i += 1) {
    if (state.centerPermutation[i] !== i) return false;
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

export function skewbStatesEqual(a: SkewbState, b: SkewbState): boolean {
  return (
    arraysEqual(a.cornerPermutation, b.cornerPermutation) &&
    arraysEqual(a.cornerOrientation, b.cornerOrientation) &&
    arraysEqual(a.centerPermutation, b.centerPermutation)
  );
}

export { CENTER_COUNT_SKEWB, CORNER_COUNT_SKEWB, HELD_CORNER_INDEX };
