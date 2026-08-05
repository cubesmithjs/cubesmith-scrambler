/**
 * Pyraminx notation, deliberately *not* built on `notation/move.ts`'s
 * `FaceMove`. A cube face turn has order 4 — amounts 1/2/3, where `2` is a
 * half turn — while a Pyraminx vertex turn has order 3, so there are only
 * two amounts and `2` means *counterclockwise* (printed `'`). Reusing
 * `Amount` would admit a meaningless `U2` at the type level and render
 * every counterclockwise turn wrong.
 *
 * The two case conventions are the real notation, verified against the WCA
 * Regulations' scramble format and the Speedsolving wiki: an **uppercase**
 * letter is the two-layer turn about that vertex (tip + axial piece + the
 * three edges touching it), a **lowercase** letter is the single-layer turn
 * of just that tip.
 */

export type PyraminxVertex = 'U' | 'L' | 'R' | 'B';

/**
 * Order matters: it fixes the edge-piece indexing derived in `geometry.ts`
 * and the order tip moves are emitted in at the end of a scramble.
 */
export const PYRAMINX_VERTICES: readonly PyraminxVertex[] = ['U', 'L', 'R', 'B'];

/** 1 = clockwise 120° seen from outside that vertex; 2 = counterclockwise, printed `'`. */
export type PyraminxAmount = 1 | 2;

export const PYRAMINX_AMOUNTS: readonly PyraminxAmount[] = [1, 2];

export interface PyraminxMove {
  readonly vertex: PyraminxVertex;
  readonly amount: PyraminxAmount;
  /** `true` = the lowercase single-layer tip turn (`u`), which touches nothing but that tip. */
  readonly tip: boolean;
}

export function pyraminxMoveToString(move: PyraminxMove): string {
  const letter = move.tip ? move.vertex.toLowerCase() : move.vertex;
  return move.amount === 2 ? `${letter}'` : letter;
}

export function pyraminxMovesToString(moves: readonly PyraminxMove[]): string {
  return moves.map(pyraminxMoveToString).join(' ');
}

export function parsePyraminxMove(token: string): PyraminxMove {
  const match = /^([ULRBulrb])(')?$/.exec(token);
  if (!match) {
    throw new Error(`pyraminx-notation: "${token}" is not a valid Pyraminx move token`);
  }
  const letter = match[1]!;
  const tip = letter === letter.toLowerCase();
  return {
    vertex: letter.toUpperCase() as PyraminxVertex,
    amount: match[2] === "'" ? 2 : 1,
    tip,
  };
}

/** `U` ↔ `U'`. With only two amounts on an order-3 turn, `3 - amount` is the whole story. */
export function inversePyraminxMove(move: PyraminxMove): PyraminxMove {
  return { ...move, amount: (3 - move.amount) as PyraminxAmount };
}

export function inversePyraminxMoves(moves: readonly PyraminxMove[]): PyraminxMove[] {
  return [...moves].reverse().map(inversePyraminxMove);
}

/** All eight two-layer turns — the only moves the solver searches over (tips are independent, see `solve.ts`). */
export function allLayerMovesPyraminx(): readonly PyraminxMove[] {
  const moves: PyraminxMove[] = [];
  for (const vertex of PYRAMINX_VERTICES) {
    for (const amount of PYRAMINX_AMOUNTS) moves.push({ vertex, amount, tip: false });
  }
  return moves;
}
