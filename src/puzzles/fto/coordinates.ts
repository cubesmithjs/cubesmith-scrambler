import { allMovesFto, FTO_FACES, type FtoFace, type FtoMove } from './notation';
import { CENTRE_ORBIT_SIZE, CORNER_COUNT_FTO, EDGE_COUNT_FTO, type FtoTurnTable } from './geometry';
import { centreColour, getFtoTurnTable, type FtoState } from './state';

/**
 * FTO coordinates: **projections** of the state, each discovered by
 * breadth-first search rather than ranked in closed form.
 *
 * The approach is the Skewb's (`puzzles/skewb/coordinates.ts`) for the same
 * reason: what a solver phase needs to see is rarely a whole permutation — it is
 * "where are *these* four edges", or "which colour is on each centre slot, if
 * only two colours count". Closed-form ranks for those exist, but each is a
 * separate piece of arithmetic to get wrong, whereas a BFS over the projection
 * under the phase's own moves is one function, and the size it lands on is then
 * a fact to check (`coordinates.test.ts`) rather than an assumption to trust.
 *
 * A projection's values are plain arrays — slot contents, or piece positions —
 * and its transitions are a dense `Int32Array`, so the search and the table
 * builders never touch anything but integers.
 */

export const ALL_MOVES_FTO: readonly FtoMove[] = allMovesFto();
export const MOVE_COUNT_FTO = ALL_MOVES_FTO.length; // 16

/** Move index of `face` turned `amount` — `FTO_FACES` order, clockwise before prime. */
export function moveIndexFto(face: FtoFace, amount: 1 | 2): number {
  return FTO_FACES.indexOf(face) * 2 + amount - 1;
}

/** The face index (`0..7`) a move index turns. */
export function faceOfMove(move: number): number {
  return move >> 1;
}

const TURN_TABLES: readonly FtoTurnTable[] = ALL_MOVES_FTO.map((m) =>
  getFtoTurnTable(m.face, m.amount),
);

/** `OPPOSITE_FACE[f]` — the face index sharing no piece with face `f`. Their turns commute. */
export const OPPOSITE_FACE: readonly number[] = (() => {
  const pairs: [FtoFace, FtoFace][] = [
    ['U', 'D'],
    ['F', 'B'],
    ['R', 'BL'],
    ['L', 'BR'],
  ];
  const opposite = new Array<number>(FTO_FACES.length);
  for (const [a, b] of pairs) {
    opposite[FTO_FACES.indexOf(a)] = FTO_FACES.indexOf(b);
    opposite[FTO_FACES.indexOf(b)] = FTO_FACES.indexOf(a);
  }
  return opposite;
})();

/**
 * Whether `next` may follow `previous` in a search. Two turns of one face always
 * merge into one (or none), and two opposite faces commute, so only one of their
 * two orders is worth trying — the one with the lower face index first.
 */
export function mayFollow(previous: number, next: number): boolean {
  if (previous < 0) return true;
  const a = faceOfMove(previous);
  const b = faceOfMove(next);
  if (a === b) return false;
  return !(OPPOSITE_FACE[a] === b && b < a);
}

export interface Projection {
  /** Number of distinct values reachable under the projection's moves. */
  readonly size: number;
  /** The move indices this projection was closed under, in the order `transition` uses. */
  readonly moves: readonly number[];
  /** `transition[k * size + i]` = the value reached from `i` by `moves[k]`. */
  readonly transition: Int32Array;
  /** Dense index of a value, or `-1` if the projection's moves cannot reach it. */
  indexOf(value: readonly number[]): number;
  /** The value at a dense index. */
  valueAt(index: number): readonly number[];
}

/**
 * BFS closure of one projection, starting from the solved state's value, under
 * `moves`. `apply(value, table)` must return the value after that turn.
 */
export function buildProjection(
  solved: readonly number[],
  moves: readonly number[],
  apply: (value: readonly number[], table: FtoTurnTable) => readonly number[],
): Projection {
  const values: (readonly number[])[] = [solved];
  const indexByKey = new Map<string, number>([[solved.join(','), 0]]);

  const rows: number[][] = moves.map(() => []);
  for (let i = 0; i < values.length; i += 1) {
    moves.forEach((move, k) => {
      const next = apply(values[i]!, TURN_TABLES[move]!);
      const key = next.join(',');
      let index = indexByKey.get(key);
      if (index === undefined) {
        index = values.length;
        indexByKey.set(key, index);
        values.push(next);
      }
      rows[k]![i] = index;
    });
  }

  const size = values.length;
  const transition = new Int32Array(moves.length * size);
  rows.forEach((row, k) => transition.set(row, k * size));

  return {
    size,
    moves,
    transition,
    indexOf: (value) => indexByKey.get(value.join(',')) ?? -1,
    valueAt: (index) => values[index]!,
  };
}

// ---------------------------------------------------------------------------
// The value kinds. Each has an extractor (state → value) and a mover (value,
// turn → value); a projection is one of these closed under a move set.
// ---------------------------------------------------------------------------

/**
 * Every corner, as `[p0..p5, o0..o5]` — the piece at each slot, then each slot's
 * orientation. Small enough on the subsets that use it (at most 960 values once
 * the first phase has fixed a corner) to keep whole.
 */
export function cornersValue(state: FtoState): number[] {
  return [...state.cornerPermutation, ...state.cornerOrientation];
}

export function moveCornersValue(value: readonly number[], table: FtoTurnTable): number[] {
  const out = new Array<number>(2 * CORNER_COUNT_FTO);
  for (let i = 0; i < CORNER_COUNT_FTO; i += 1) {
    const dest = table.cornerDestination[i]!;
    out[dest] = value[i]!;
    out[CORNER_COUNT_FTO + dest] = value[CORNER_COUNT_FTO + i]! ^ table.cornerTwist[i]!;
  }
  return out;
}

/** Where one corner *piece* is, and how it is turned: `[slot, orientation]`. */
export function cornerPieceValue(state: FtoState, piece: number): number[] {
  const slot = state.cornerPermutation.indexOf(piece);
  return [slot, state.cornerOrientation[slot]!];
}

export function moveCornerPieceValue(value: readonly number[], table: FtoTurnTable): number[] {
  const slot = value[0]!;
  return [table.cornerDestination[slot]!, value[1]! ^ table.cornerTwist[slot]!];
}

/** The slots a chosen set of edge *pieces* occupy, in the order the pieces are listed. */
export function edgePiecesValue(state: FtoState, pieces: readonly number[]): number[] {
  return pieces.map((piece) => state.edgePermutation.indexOf(piece));
}

export function moveEdgePiecesValue(value: readonly number[], table: FtoTurnTable): number[] {
  return value.map((slot) => table.edgeDestination[slot]!);
}

/** The whole edge permutation. */
export function edgesValue(state: FtoState): number[] {
  return [...state.edgePermutation];
}

export function moveEdgesValue(value: readonly number[], table: FtoTurnTable): number[] {
  const out = new Array<number>(EDGE_COUNT_FTO);
  for (let i = 0; i < EDGE_COUNT_FTO; i += 1) out[table.edgeDestination[i]!] = value[i]!;
  return out;
}

/**
 * The colour on each slot of one centre orbit, through a `recolour` map that can
 * merge colours a phase does not care about into one code. With the identity
 * map this is simply "the colours showing".
 */
export function centreColoursValue(
  orbit: readonly number[],
  recolour: readonly number[],
): number[] {
  return orbit.map((label) => recolour[centreColour(label)]!);
}

export function makeMoveCentreValue(orbit: 'A' | 'B') {
  return (value: readonly number[], table: FtoTurnTable): number[] => {
    const dest = orbit === 'A' ? table.centreADestination : table.centreBDestination;
    const out = new Array<number>(CENTRE_ORBIT_SIZE);
    for (let i = 0; i < CENTRE_ORBIT_SIZE; i += 1) out[dest[i]!] = value[i]!;
    return out;
  };
}

export const moveCentreAValue = makeMoveCentreValue('A');
export const moveCentreBValue = makeMoveCentreValue('B');
