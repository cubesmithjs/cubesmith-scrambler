/**
 * Megaminx notation — the WCA's **Pochmann notation**, which is unlike every
 * other notation in this package in one important way: two of its three
 * moves hold a face still and turn *everything else*.
 *
 * - `U` / `U'` — turn only the top layer, one fifth (72°), exactly as a cube
 *   `U` turns one layer.
 * - `R++` / `R--` — hold the **L** face and turn the rest of the puzzle two
 *   fifths (144°).
 * - `D++` / `D--` — hold the **U** face and turn the rest of the puzzle two
 *   fifths.
 *
 * That is the whole move set: six tokens. It exists because a Megaminx has
 * twelve faces and no convenient short names for them, and because two-fifth
 * turns of the bulk are fast to execute — a scrambler's convenience, not a
 * solver's.
 *
 * `src/notation/move.ts` doesn't apply. A cube face turn has order 4 and
 * names one of six faces; these have order 5, name a face to *hold*, and
 * `++`/`--` are two-fifths rather than a single unit.
 */

export type MegaminxMoveKind = 'U' | 'R' | 'D';

/** `1` is one unit in the token's own direction (`U`, `R++`), `2` is the reverse (`U'`, `R--`). */
export type MegaminxDirection = 1 | 2;

export interface MegaminxMove {
  readonly kind: MegaminxMoveKind;
  readonly direction: MegaminxDirection;
}

export const MEGAMINX_MOVE_KINDS: readonly MegaminxMoveKind[] = ['U', 'R', 'D'];

export function megaminxMoveToString(move: MegaminxMove): string {
  if (move.kind === 'U') return move.direction === 1 ? 'U' : "U'";
  return move.direction === 1 ? `${move.kind}++` : `${move.kind}--`;
}

export function megaminxMovesToString(moves: readonly MegaminxMove[]): string {
  return moves.map(megaminxMoveToString).join(' ');
}

export function parseMegaminxMove(token: string): MegaminxMove {
  if (token === 'U') return { kind: 'U', direction: 1 };
  if (token === "U'") return { kind: 'U', direction: 2 };
  const match = /^([RD])(\+\+|--)$/.exec(token);
  if (!match) {
    throw new Error(`megaminx-notation: "${token}" is not a valid Megaminx move token`);
  }
  return {
    kind: match[1] as MegaminxMoveKind,
    direction: match[2] === '++' ? 1 : 2,
  };
}

export function inverseMegaminxMove(move: MegaminxMove): MegaminxMove {
  return { kind: move.kind, direction: (3 - move.direction) as MegaminxDirection };
}

export function inverseMegaminxMoves(moves: readonly MegaminxMove[]): MegaminxMove[] {
  return [...moves].reverse().map(inverseMegaminxMove);
}

/** All six tokens. */
export function allMovesMegaminx(): readonly MegaminxMove[] {
  return MEGAMINX_MOVE_KINDS.flatMap((kind) =>
    ([1, 2] as const).map((direction): MegaminxMove => ({ kind, direction })),
  );
}
