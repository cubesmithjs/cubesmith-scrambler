import {
  PYRAMINX_VERTICES,
  type PyraminxAmount,
  type PyraminxMove,
  type PyraminxVertex,
} from './notation';
import {
  deriveTurnTable,
  EDGE_COUNT_PYRAMINX,
  VERTEX_COUNT_PYRAMINX,
  type PyraminxTurnTable,
} from './geometry';

/**
 * A Pyraminx state, piece-level.
 *
 * Four kinds of piece, but only two of them are combinatorially
 * interesting:
 *
 * - **edges** (6) — permuted and flipped; the only pieces that move.
 * - **axial pieces** (4) — the pieces directly under each tip. Their
 *   *position* is fixed by the puzzle's mechanism, so all that varies is a
 *   twist in `Z3`. They're what gives a Pyraminx an absolute reference
 *   frame at all.
 * - **tips** (4) — twist in `Z3`, and nothing else on the puzzle can ever
 *   observe them. Modelled here anyway (rather than dropped as "trivial")
 *   so the end-to-end round trip in `solve.test.ts` covers a *complete*
 *   physical state, and so the fact that an uppercase turn carries its tip
 *   along is represented rather than assumed.
 *
 * Every array is indexed by *slot*: `edgePermutation[i]` is which piece is
 * currently at edge slot `i`, `edgeOrientation[i]` is that piece's flip
 * there. Same convention as `puzzles/333/state.ts`.
 */
export interface PyraminxState {
  readonly edgePermutation: readonly number[];
  readonly edgeOrientation: readonly number[];
  readonly axialOrientation: readonly number[];
  readonly tipOrientation: readonly number[];
}

export const SOLVED_PYRAMINX_STATE: PyraminxState = {
  edgePermutation: [0, 1, 2, 3, 4, 5],
  edgeOrientation: [0, 0, 0, 0, 0, 0],
  axialOrientation: [0, 0, 0, 0],
  tipOrientation: [0, 0, 0, 0],
};

export function vertexIndex(vertex: PyraminxVertex): number {
  const index = PYRAMINX_VERTICES.indexOf(vertex);
  if (index === -1) throw new Error(`pyraminx-state: unknown vertex "${vertex}"`);
  return index;
}

/** Composes a clockwise turn table with itself `times` times (1 or 2) — the counterclockwise turn is just the clockwise one twice, since the turn has order 3. */
function composeSelf(base: PyraminxTurnTable, times: PyraminxAmount): PyraminxTurnTable {
  let destination = Array.from({ length: EDGE_COUNT_PYRAMINX }, (_, i) => i);
  let flip = new Array<number>(EDGE_COUNT_PYRAMINX).fill(0);

  for (let t = 0; t < times; t += 1) {
    const nextDestination = new Array<number>(EDGE_COUNT_PYRAMINX);
    const nextFlip = new Array<number>(EDGE_COUNT_PYRAMINX);
    for (let i = 0; i < EDGE_COUNT_PYRAMINX; i += 1) {
      const mid = destination[i]!;
      nextDestination[i] = base.edgeDestination[mid]!;
      nextFlip[i] = (flip[i]! + base.edgeFlip[mid]!) % 2;
    }
    destination = nextDestination;
    flip = nextFlip;
  }

  return {
    vertex: base.vertex,
    edgeDestination: destination,
    edgeFlip: flip,
    axialTwist: base.axialTwist.map((t) => (t * times) % 3),
  };
}

function buildTurnTables(): ReadonlyMap<string, PyraminxTurnTable> {
  const tables = new Map<string, PyraminxTurnTable>();
  for (const vertex of PYRAMINX_VERTICES) {
    const base = deriveTurnTable(vertex);
    for (const amount of [1, 2] as const) {
      tables.set(`${vertex}${amount}`, composeSelf(base, amount));
    }
  }
  return tables;
}

export const TURN_TABLES_PYRAMINX: ReadonlyMap<string, PyraminxTurnTable> = buildTurnTables();

export function getTurnTable(vertex: PyraminxVertex, amount: PyraminxAmount): PyraminxTurnTable {
  const table = TURN_TABLES_PYRAMINX.get(`${vertex}${amount}`);
  if (!table) throw new Error(`pyraminx-state: no turn table for ${vertex}${amount}`);
  return table;
}

export function applyPyraminxMove(state: PyraminxState, move: PyraminxMove): PyraminxState {
  const v = vertexIndex(move.vertex);

  // A tip turn touches exactly one number on the whole puzzle.
  if (move.tip) {
    const tipOrientation = [...state.tipOrientation];
    tipOrientation[v] = (tipOrientation[v]! + move.amount) % 3;
    return { ...state, tipOrientation };
  }

  const table = getTurnTable(move.vertex, move.amount);
  const edgePermutation = new Array<number>(EDGE_COUNT_PYRAMINX);
  const edgeOrientation = new Array<number>(EDGE_COUNT_PYRAMINX);
  for (let i = 0; i < EDGE_COUNT_PYRAMINX; i += 1) {
    const dest = table.edgeDestination[i]!;
    edgePermutation[dest] = state.edgePermutation[i]!;
    edgeOrientation[dest] = (state.edgeOrientation[i]! + table.edgeFlip[i]!) % 2;
  }

  const axialOrientation = state.axialOrientation.map(
    (o, i) => (o + table.axialTwist[i]!) % 3,
  );
  // The uppercase turn is a *two-layer* turn: the tip rides along with the
  // axial piece it sits on, so it accumulates the same twist.
  const tipOrientation = state.tipOrientation.map((o, i) => (o + table.axialTwist[i]!) % 3);

  return { edgePermutation, edgeOrientation, axialOrientation, tipOrientation };
}

export function applyPyraminxMoves(
  state: PyraminxState,
  moves: readonly PyraminxMove[],
): PyraminxState {
  return moves.reduce(applyPyraminxMove, state);
}

function allZero(values: readonly number[]): boolean {
  return values.every((v) => v === 0);
}

export function isSolvedPyraminx(state: PyraminxState): boolean {
  for (let i = 0; i < EDGE_COUNT_PYRAMINX; i += 1) {
    if (state.edgePermutation[i] !== i) return false;
  }
  return (
    allZero(state.edgeOrientation) &&
    allZero(state.axialOrientation) &&
    allZero(state.tipOrientation)
  );
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function pyraminxStatesEqual(a: PyraminxState, b: PyraminxState): boolean {
  return (
    arraysEqual(a.edgePermutation, b.edgePermutation) &&
    arraysEqual(a.edgeOrientation, b.edgeOrientation) &&
    arraysEqual(a.axialOrientation, b.axialOrientation) &&
    arraysEqual(a.tipOrientation, b.tipOrientation)
  );
}

export { EDGE_COUNT_PYRAMINX, VERTEX_COUNT_PYRAMINX };
