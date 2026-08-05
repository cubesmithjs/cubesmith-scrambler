import {
  CORNER_COUNT_MINX,
  deriveMoveTableMinx,
  EDGE_COUNT_MINX,
  FACE_COUNT_MINX,
  L_FACE,
  U_FACE,
  type MegaminxMoveTable,
} from './geometry';
import type { MegaminxMove } from './notation';

/**
 * A Megaminx state, piece-level: 20 corners (permutation + twist in `Z3`),
 * 30 edges (permutation + flip in `Z2`), and 12 centers (permutation only —
 * a Megaminx center is one pentagon of one color).
 *
 * Centers are modelled, and that is not decoration. Two of the three
 * Pochmann moves hold one face and turn *everything else*, so they carry the
 * other eleven centers with them: a Megaminx scramble genuinely leaves the
 * puzzle in a rotated orientation, and a model without centers could not
 * represent that. It's also what makes "solved" mean solved rather than
 * "solved up to a rotation".
 */
export interface MegaminxState {
  readonly cornerPermutation: readonly number[];
  readonly cornerOrientation: readonly number[];
  readonly edgePermutation: readonly number[];
  readonly edgeOrientation: readonly number[];
  readonly centerPermutation: readonly number[];
}

const identity = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
const zeros = (n: number): number[] => new Array<number>(n).fill(0);

export const SOLVED_MEGAMINX_STATE: MegaminxState = {
  cornerPermutation: identity(CORNER_COUNT_MINX),
  cornerOrientation: zeros(CORNER_COUNT_MINX),
  edgePermutation: identity(EDGE_COUNT_MINX),
  edgeOrientation: zeros(EDGE_COUNT_MINX),
  centerPermutation: identity(FACE_COUNT_MINX),
};

/**
 * The six tokens' move tables.
 *
 * The three axis/extent choices are what the notation means, spelled out
 * once:
 *
 * - `U` turns the pieces **on** the U layer by one fifth.
 * - `D` holds the U layer and turns everything **off** it by two fifths.
 * - `R` holds the L layer and turns everything **off** it by two fifths.
 *
 * Signs follow the package-wide convention that a *negative* right-hand-rule
 * amount is clockwise seen from outside the axis. `U` is clockwise seen from
 * outside U, so it is negative about U; `D++` and `R++` are clockwise seen
 * from the *opposite* side of their held face, so they are positive about it.
 *
 * If that outside-view reading were mirrored, every `++` here would be a
 * `--`. It could not change a single generated scramble: the tokens' signs
 * are drawn uniformly and independently (see `solve.ts`), so swapping the two
 * spellings maps the distribution exactly onto itself.
 */
const MOVE_TABLES: ReadonlyMap<string, MegaminxMoveTable> = (() => {
  const tables = new Map<string, MegaminxMoveTable>();
  tables.set('U1', deriveMoveTableMinx(U_FACE, -1, 'on-layer'));
  tables.set('U2', deriveMoveTableMinx(U_FACE, 1, 'on-layer'));
  tables.set('D1', deriveMoveTableMinx(U_FACE, 2, 'off-layer'));
  tables.set('D2', deriveMoveTableMinx(U_FACE, -2, 'off-layer'));
  tables.set('R1', deriveMoveTableMinx(L_FACE, 2, 'off-layer'));
  tables.set('R2', deriveMoveTableMinx(L_FACE, -2, 'off-layer'));
  return tables;
})();

export function getMegaminxMoveTable(move: MegaminxMove): MegaminxMoveTable {
  const table = MOVE_TABLES.get(`${move.kind}${move.direction}`);
  if (!table) throw new Error(`megaminx-state: no move table for ${move.kind}${move.direction}`);
  return table;
}

export function applyMegaminxMove(state: MegaminxState, move: MegaminxMove): MegaminxState {
  const table = getMegaminxMoveTable(move);

  const cornerPermutation = new Array<number>(CORNER_COUNT_MINX);
  const cornerOrientation = new Array<number>(CORNER_COUNT_MINX);
  for (let i = 0; i < CORNER_COUNT_MINX; i += 1) {
    const dest = table.cornerDestination[i]!;
    cornerPermutation[dest] = state.cornerPermutation[i]!;
    cornerOrientation[dest] = (state.cornerOrientation[i]! + table.cornerTwist[i]!) % 3;
  }

  const edgePermutation = new Array<number>(EDGE_COUNT_MINX);
  const edgeOrientation = new Array<number>(EDGE_COUNT_MINX);
  for (let i = 0; i < EDGE_COUNT_MINX; i += 1) {
    const dest = table.edgeDestination[i]!;
    edgePermutation[dest] = state.edgePermutation[i]!;
    edgeOrientation[dest] = (state.edgeOrientation[i]! + table.edgeFlip[i]!) % 2;
  }

  const centerPermutation = new Array<number>(FACE_COUNT_MINX);
  for (let i = 0; i < FACE_COUNT_MINX; i += 1) {
    centerPermutation[table.centerDestination[i]!] = state.centerPermutation[i]!;
  }

  return {
    cornerPermutation,
    cornerOrientation,
    edgePermutation,
    edgeOrientation,
    centerPermutation,
  };
}

export function applyMegaminxMoves(
  state: MegaminxState,
  moves: readonly MegaminxMove[],
): MegaminxState {
  return moves.reduce(applyMegaminxMove, state);
}

function isIdentity(perm: readonly number[]): boolean {
  return perm.every((v, i) => v === i);
}

export function isSolvedMegaminx(state: MegaminxState): boolean {
  return (
    isIdentity(state.cornerPermutation) &&
    isIdentity(state.edgePermutation) &&
    isIdentity(state.centerPermutation) &&
    state.cornerOrientation.every((o) => o === 0) &&
    state.edgeOrientation.every((o) => o === 0)
  );
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function megaminxStatesEqual(a: MegaminxState, b: MegaminxState): boolean {
  return (
    arraysEqual(a.cornerPermutation, b.cornerPermutation) &&
    arraysEqual(a.cornerOrientation, b.cornerOrientation) &&
    arraysEqual(a.edgePermutation, b.edgePermutation) &&
    arraysEqual(a.edgeOrientation, b.edgeOrientation) &&
    arraysEqual(a.centerPermutation, b.centerPermutation)
  );
}

/** How many pieces are away from home — a coarse "how scrambled is it" measure the tests use. */
export function misplacedPieceCount(state: MegaminxState): number {
  let count = 0;
  for (let i = 0; i < CORNER_COUNT_MINX; i += 1) {
    if (state.cornerPermutation[i] !== i || state.cornerOrientation[i] !== 0) count += 1;
  }
  for (let i = 0; i < EDGE_COUNT_MINX; i += 1) {
    if (state.edgePermutation[i] !== i || state.edgeOrientation[i] !== 0) count += 1;
  }
  return count;
}

export { CORNER_COUNT_MINX, EDGE_COUNT_MINX, FACE_COUNT_MINX };
