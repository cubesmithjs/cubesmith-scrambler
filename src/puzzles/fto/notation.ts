/**
 * Face Turning Octahedron notation — **provisional** until the WCA publishes
 * the FTO regulations (a draft is expected in the January 2027 cycle; see
 * `cubesmith-scrambler-plans/plans/fto_event_plan/00-official-baseline.md` §3).
 *
 * Eight faces, each named by one or two letters, in the convention the
 * community already scrambles with and that cubing.js's random-state FTO
 * scrambler prints:
 *
 * - `U F R L` — the four faces around one vertex;
 * - `B D BR BL` — the four around the opposite vertex. `B` is opposite `F`,
 *   `D` opposite `U`, `BR` opposite `L` and `BL` opposite `R`.
 *
 * A plain letter is a clockwise 120° turn seen looking straight at that face; a
 * primed letter is anticlockwise. 🔴 **There is no `2`.** A face turn has order
 * 3, so a double turn *is* the prime turn, and the official programs write the
 * inverse rather than a `2` for every puzzle shaped like this (Pyraminx,
 * Skewb). Accepting `R2` here would make two spellings of one move.
 *
 * Tokens are separated by whitespace, like Megaminx, Skewb and Square-1 — and
 * unlike cube notation, which this cannot be: `BR` is one face, not `B` then `R`.
 */

import {
  ScrambleSyntaxError,
  type ScrambleSyntaxErrorDetail,
} from '../../core/scramble-errors';
import { tokenizeWords } from '../../notation/tokenize-words';

export type FtoFace = 'U' | 'F' | 'R' | 'L' | 'B' | 'D' | 'BR' | 'BL';

/**
 * Order fixes the move indexing used by every coordinate table. The first four
 * are the faces around the vertex opposite the `D B BR BL` corner, which is the
 * corner the solver builds its first block around (see `solve.ts`).
 */
export const FTO_FACES: readonly FtoFace[] = ['U', 'F', 'R', 'L', 'B', 'D', 'BR', 'BL'];

/** 1 = clockwise 120° seen looking at the face; 2 = anticlockwise, printed `'`. */
export type FtoAmount = 1 | 2;

export const FTO_AMOUNTS: readonly FtoAmount[] = [1, 2];

export interface FtoMove {
  readonly face: FtoFace;
  readonly amount: FtoAmount;
}

export function ftoMoveToString(move: FtoMove): string {
  return move.amount === 2 ? `${move.face}'` : move.face;
}

export function ftoMovesToString(moves: readonly FtoMove[]): string {
  return moves.map(ftoMoveToString).join(' ');
}

const MOVE_PATTERN = /^(BR|BL|U|F|R|L|B|D)(')?$/;

export function parseFtoMove(token: string): FtoMove {
  const match = MOVE_PATTERN.exec(token);
  if (!match) {
    throw new Error(`fto-notation: "${token}" is not a valid FTO move token`);
  }
  return { face: match[1] as FtoFace, amount: match[2] === "'" ? 2 : 1 };
}

/**
 * Parses a whole FTO scramble, reporting **where** and **why** it failed.
 *
 * Empty input is an empty scramble, agreeing with `parseAlgorithm('')` and the
 * other bespoke parsers.
 *
 * @throws {ScrambleSyntaxError} on the first token that is not an FTO move.
 */
export function parseFtoScramble(text: string): FtoMove[] {
  return tokenizeWords(text).map(({ text: token, offset }) => {
    try {
      return parseFtoMove(token);
    } catch {
      throw new ScrambleSyntaxError(
        'fto',
        text,
        offset,
        `"${token}" is not a valid FTO move token`,
        describeFtoFailure(token),
      );
    }
  });
}

/**
 * Which half of the token was wrong: the face, or what follows it.
 *
 * A token that *starts* with a face name followed by something other than a
 * letter — `R2`, `U'2`, `BR''` — names a real face with a bad amount. One whose
 * letters run on past a face name — `BX`, `UR`, `FF` — names no face at all,
 * because faces are written with capitals and there is no such face. The longest
 * face name is tried first, so `BR2` is a bad amount on `BR`, not on `B`.
 * Case-sensitive like Skewb: there is no lowercase FTO face in a scramble.
 */
function describeFtoFailure(token: string): ScrambleSyntaxErrorDetail {
  const face = /^(BR|BL|U|F|R|L|B|D)/.exec(token)?.[1];
  if (face !== undefined && !/^[A-Za-z]/.test(token.slice(face.length))) {
    return { reason: 'fto-bad-amount', length: token.length, token };
  }
  return { reason: 'fto-not-a-face', length: token.length, token, char: token.charAt(0) };
}

export function inverseFtoMove(move: FtoMove): FtoMove {
  return { face: move.face, amount: (3 - move.amount) as FtoAmount };
}

export function inverseFtoMoves(moves: readonly FtoMove[]): FtoMove[] {
  return [...moves].reverse().map(inverseFtoMove);
}

/** All sixteen turns, in `FTO_FACES` order, clockwise before prime. */
export function allMovesFto(): readonly FtoMove[] {
  const moves: FtoMove[] = [];
  for (const face of FTO_FACES) {
    for (const amount of FTO_AMOUNTS) moves.push({ face, amount });
  }
  return moves;
}
