import { FTO_FACES, type FtoAmount, type FtoFace, type FtoMove } from './notation';
import {
  CENTRE_ORBIT_SIZE,
  CORNER_COUNT_FTO,
  deriveTurnTableFto,
  EDGE_COUNT_FTO,
  type FtoTurnTable,
} from './geometry';

/**
 * A Face Turning Octahedron state, piece-level:
 *
 * - 6 **corners** — permutation, plus an orientation in `Z2` (see
 *   `geometry.ts` for why two, not four);
 * - 12 **edges** — permutation only; an FTO edge has no orientation;
 * - two orbits of 12 **centres** — orbit A on `U F BR BL`, orbit B on
 *   `R L B D` — each a permutation of *labelled* pieces.
 *
 * Arrays are indexed by *slot*, the convention every puzzle here uses:
 * `edgePermutation[i]` is the piece currently at edge slot `i`.
 *
 * The centres are labelled even though three centres of a colour look alike,
 * because a labelled permutation is what a random draw and a move table both
 * want. What a solver or a picture cares about is the *colour* at each slot,
 * which is the face of the label's home ({@link centreColourA}).
 */
export interface FtoState {
  readonly cornerPermutation: readonly number[];
  readonly cornerOrientation: readonly number[];
  readonly edgePermutation: readonly number[];
  readonly centreA: readonly number[];
  readonly centreB: readonly number[];
}

function identity(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

export const SOLVED_FTO_STATE: FtoState = {
  cornerPermutation: identity(CORNER_COUNT_FTO),
  cornerOrientation: new Array<number>(CORNER_COUNT_FTO).fill(0),
  edgePermutation: identity(EDGE_COUNT_FTO),
  centreA: identity(CENTRE_ORBIT_SIZE),
  centreB: identity(CENTRE_ORBIT_SIZE),
};

/** Applies a turn table to a state. Exported for the table builders, which compose tables rather than moves. */
export function applyFtoTurnTable(state: FtoState, table: FtoTurnTable): FtoState {
  const cornerPermutation = new Array<number>(CORNER_COUNT_FTO);
  const cornerOrientation = new Array<number>(CORNER_COUNT_FTO);
  for (let i = 0; i < CORNER_COUNT_FTO; i += 1) {
    const dest = table.cornerDestination[i]!;
    cornerPermutation[dest] = state.cornerPermutation[i]!;
    cornerOrientation[dest] = state.cornerOrientation[i]! ^ table.cornerTwist[i]!;
  }
  const edgePermutation = new Array<number>(EDGE_COUNT_FTO);
  for (let i = 0; i < EDGE_COUNT_FTO; i += 1) {
    edgePermutation[table.edgeDestination[i]!] = state.edgePermutation[i]!;
  }
  const centreA = new Array<number>(CENTRE_ORBIT_SIZE);
  const centreB = new Array<number>(CENTRE_ORBIT_SIZE);
  for (let i = 0; i < CENTRE_ORBIT_SIZE; i += 1) {
    centreA[table.centreADestination[i]!] = state.centreA[i]!;
    centreB[table.centreBDestination[i]!] = state.centreB[i]!;
  }
  return { cornerPermutation, cornerOrientation, edgePermutation, centreA, centreB };
}

/** The prime turn is the clockwise one applied twice — a face turn has order 3. */
function composeTwice(base: FtoTurnTable): FtoTurnTable {
  const twice = <T extends readonly number[]>(dest: T): number[] => dest.map((d) => dest[d]!);
  return {
    face: base.face,
    cornerDestination: twice(base.cornerDestination),
    cornerTwist: base.cornerDestination.map(
      (d, i) => base.cornerTwist[i]! ^ base.cornerTwist[d]!,
    ),
    edgeDestination: twice(base.edgeDestination),
    centreADestination: twice(base.centreADestination),
    centreBDestination: twice(base.centreBDestination),
  };
}

const TURN_TABLES: ReadonlyMap<string, FtoTurnTable> = (() => {
  const tables = new Map<string, FtoTurnTable>();
  for (const face of FTO_FACES) {
    const base = deriveTurnTableFto(face);
    tables.set(`${face}1`, base);
    tables.set(`${face}2`, composeTwice(base));
  }
  return tables;
})();

export function getFtoTurnTable(face: FtoFace, amount: FtoAmount): FtoTurnTable {
  const table = TURN_TABLES.get(`${face}${amount}`);
  if (!table) throw new Error(`fto-state: no turn table for ${face}${amount}`);
  return table;
}

export function applyFtoMove(state: FtoState, move: FtoMove): FtoState {
  return applyFtoTurnTable(state, getFtoTurnTable(move.face, move.amount));
}

export function applyFtoMoves(state: FtoState, moves: readonly FtoMove[]): FtoState {
  return moves.reduce(applyFtoMove, state);
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** Equal as labelled pieces — stricter than "looks the same", which {@link ftoStatesLookEqual} answers. */
export function ftoStatesEqual(a: FtoState, b: FtoState): boolean {
  return (
    arraysEqual(a.cornerPermutation, b.cornerPermutation) &&
    arraysEqual(a.cornerOrientation, b.cornerOrientation) &&
    arraysEqual(a.edgePermutation, b.edgePermutation) &&
    arraysEqual(a.centreA, b.centreA) &&
    arraysEqual(a.centreB, b.centreB)
  );
}

/**
 * The colour of a centre label: the index of its home face within the orbit
 * (`0..3`). Positions are grouped three per face, so that is `label / 3`.
 */
export function centreColour(label: number): number {
  return Math.floor(label / 3);
}

/** The colours showing in one centre orbit, slot by slot. */
export function centreColours(orbit: readonly number[]): number[] {
  return orbit.map(centreColour);
}

/**
 * Equal as a person looking at the puzzle would judge it: identical corners and
 * edges, and the same colour on every centre slot, whichever of a colour's three
 * centres is the one showing.
 */
export function ftoStatesLookEqual(a: FtoState, b: FtoState): boolean {
  return (
    arraysEqual(a.cornerPermutation, b.cornerPermutation) &&
    arraysEqual(a.cornerOrientation, b.cornerOrientation) &&
    arraysEqual(a.edgePermutation, b.edgePermutation) &&
    arraysEqual(centreColours(a.centreA), centreColours(b.centreA)) &&
    arraysEqual(centreColours(a.centreB), centreColours(b.centreB))
  );
}

/** Solved as the eye sees it — which is the only meaning of "solved" a scramble cares about. */
export function isSolvedFto(state: FtoState): boolean {
  return ftoStatesLookEqual(state, SOLVED_FTO_STATE);
}
