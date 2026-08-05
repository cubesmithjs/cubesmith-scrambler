/**
 * Skewb notation — WCA **Fixed Corner Notation** (FCN).
 *
 * The four letters happen to be the same four the Pyraminx uses, and both
 * puzzles turn about a vertex by ±120°, but they are deliberately *not*
 * sharing a type. A Pyraminx letter names one of the puzzle's four vertices;
 * a Skewb letter names one of eight cube corners, chosen relative to a
 * *held* corner that the notation itself never mentions. Collapsing them
 * would imply a correspondence between `U` on one puzzle and `U` on the
 * other that does not exist.
 *
 * In FCN the scrambler holds one corner still — officially the
 * white-on-top, green-on-front-left one — and turns the four corners whose
 * layer excludes it:
 *
 * - `U` the top-back corner
 * - `R` the bottom-right corner
 * - `L` the bottom-left corner
 * - `B` the bottom-back corner
 *
 * A plain letter is a clockwise 120° turn seen from outside that corner; a
 * primed letter is counterclockwise. There is no half turn — the turn has
 * order 3.
 */

export type SkewbCorner = 'U' | 'R' | 'L' | 'B';

/** Order fixes the move indexing used by the coordinate tables. */
export const SKEWB_CORNERS: readonly SkewbCorner[] = ['U', 'R', 'L', 'B'];

/** 1 = clockwise 120° seen from outside that corner; 2 = counterclockwise, printed `'`. */
export type SkewbAmount = 1 | 2;

export const SKEWB_AMOUNTS: readonly SkewbAmount[] = [1, 2];

export interface SkewbMove {
  readonly corner: SkewbCorner;
  readonly amount: SkewbAmount;
}

export function skewbMoveToString(move: SkewbMove): string {
  return move.amount === 2 ? `${move.corner}'` : move.corner;
}

export function skewbMovesToString(moves: readonly SkewbMove[]): string {
  return moves.map(skewbMoveToString).join(' ');
}

export function parseSkewbMove(token: string): SkewbMove {
  const match = /^([URLB])(')?$/.exec(token);
  if (!match) {
    throw new Error(`skewb-notation: "${token}" is not a valid Skewb move token`);
  }
  return { corner: match[1] as SkewbCorner, amount: match[2] === "'" ? 2 : 1 };
}

export function inverseSkewbMove(move: SkewbMove): SkewbMove {
  return { corner: move.corner, amount: (3 - move.amount) as SkewbAmount };
}

export function inverseSkewbMoves(moves: readonly SkewbMove[]): SkewbMove[] {
  return [...moves].reverse().map(inverseSkewbMove);
}

/** All eight turns — the complete move set the solver searches over. */
export function allMovesSkewb(): readonly SkewbMove[] {
  const moves: SkewbMove[] = [];
  for (const corner of SKEWB_CORNERS) {
    for (const amount of SKEWB_AMOUNTS) moves.push({ corner, amount });
  }
  return moves;
}
