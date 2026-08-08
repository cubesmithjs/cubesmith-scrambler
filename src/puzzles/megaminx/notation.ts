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

import {
  ScrambleSyntaxError,
  type ScrambleSyntaxErrorDetail,
} from '../../core/scramble-errors';
import { tokenizeWords } from '../../notation/tokenize-words';

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

/**
 * Parses a whole Megaminx scramble, reporting **where** and **why** it failed.
 *
 * A wrapper around `parseMegaminxMove` rather than a replacement for it: the
 * per-token function is on the generation path (`solve.ts` renders and the
 * tests re-read), and retrofitting a different error type into it would ripple
 * into generation for no gain. This adds the two things a form field needs and
 * a per-token parser structurally cannot have — an offset and a code.
 *
 * A whitespace splitter is enough here. Megaminx scrambles are space-separated
 * tokens with no brackets, no nesting and no multi-word constructs.
 *
 * Empty input is an empty scramble, agreeing with `parseAlgorithm('')`.
 *
 * @throws {ScrambleSyntaxError} on the first token that is not a Megaminx move.
 */
export function parseMegaminxScramble(text: string): MegaminxMove[] {
  return tokenizeWords(text).map(({ text: token, offset }) => {
    try {
      return parseMegaminxMove(token);
    } catch {
      throw new ScrambleSyntaxError(
        'megaminx',
        text,
        offset,
        `"${token}" is not a valid Megaminx move token`,
        describeMegaminxFailure(token),
      );
    }
  });
}

/**
 * Which of `parseMegaminxMove`'s two arms rejected the token.
 *
 * The single message above covers both, and they are genuinely different
 * mistakes: `X++` names a move that does not exist, while `R+++` names one that
 * does and spells its direction wrong. Only the leading letter is re-tested —
 * the grammar itself stays in `parseMegaminxMove`, and the letter set comes
 * from `MEGAMINX_MOVE_KINDS` rather than a second literal.
 */
function describeMegaminxFailure(token: string): ScrambleSyntaxErrorDetail {
  const first = token.charAt(0);
  if ((MEGAMINX_MOVE_KINDS as readonly string[]).includes(first)) {
    return { reason: 'megaminx-bad-direction', length: token.length, token };
  }
  return { reason: 'megaminx-not-a-move', length: token.length, token, char: first };
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
