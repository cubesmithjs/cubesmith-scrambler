/**
 * Move/notation primitives shared by the face-turn-family puzzles
 * (222–777 all turn faces named U/D/F/B/L/R; only the layer-depth notation
 * differs between cube sizes, which is why this lives outside `puzzles/333/`
 * even though 333 is the only consumer today).
 */

export type Face = 'U' | 'D' | 'F' | 'B' | 'L' | 'R';

/** 1 = clockwise quarter turn, 2 = half turn, 3 = counterclockwise quarter turn (displayed as `'`). */
export type Amount = 1 | 2 | 3;

export interface FaceMove {
  readonly face: Face;
  readonly amount: Amount;
}

export const FACES: readonly Face[] = ['U', 'D', 'F', 'B', 'L', 'R'];
export const AMOUNTS: readonly Amount[] = [1, 2, 3];

/**
 * The three axes a face turn can be on, named for the pair of opposite faces
 * that share it.
 *
 * The distinction from a *face* matters wherever two moves meet. Two moves on
 * the same face **merge** (`R R2` is `R'`); two moves on the same axis but
 * opposite faces do not merge but do **commute** (`R L` and `L R` are the same
 * algorithm written two ways), so only one of the two orderings is canonical.
 * A rule that has to guarantee "these two moves are genuinely two moves, in a
 * settled order" is therefore an axis rule, not a face rule — see
 * `puzzles/333/fewest-moves.ts`, where the WCA's Fewest Moves padding relies on
 * exactly that.
 */
export type Axis = 'UD' | 'RL' | 'FB';

const AXIS_BY_FACE: Readonly<Record<Face, Axis>> = {
  U: 'UD',
  D: 'UD',
  R: 'RL',
  L: 'RL',
  F: 'FB',
  B: 'FB',
};

/** The axis `face` turns about: `U` and `D` both give `'UD'`. */
export function axisOf(face: Face): Axis {
  return AXIS_BY_FACE[face];
}

/** `{ face: 'R', amount: 3 }` → `"R'"`. */
export function moveToString(move: FaceMove): string {
  if (move.amount === 1) return move.face;
  if (move.amount === 2) return `${move.face}2`;
  return `${move.face}'`;
}

/** `"R'"` → `{ face: 'R', amount: 3 }`. Throws on anything that isn't a single-layer face-move token. */
export function parseMove(token: string): FaceMove {
  const match = /^([UDFBLR])(2|')?$/.exec(token);
  if (!match) {
    throw new Error(`notation: "${token}" is not a valid face-move token`);
  }
  const face = match[1] as Face;
  const suffix = match[2];
  const amount: Amount = suffix === '2' ? 2 : suffix === "'" ? 3 : 1;
  return { face, amount };
}

/** A sequence of moves rendered as a space-separated scramble/algorithm string. */
export function movesToString(moves: readonly FaceMove[]): string {
  return moves.map(moveToString).join(' ');
}

/** Inverse of a single move: `R` ↔ `R'`, `R2` ↔ `R2`. `Amount` is always 1–3, so `4 - amount` is always in range — no modulo needed. */
export function inverseMove(move: FaceMove): FaceMove {
  const amount = (4 - move.amount) as Amount;
  return { face: move.face, amount };
}

/** Inverse of a move sequence: reversed order, each move inverted. */
export function inverseMoves(moves: readonly FaceMove[]): FaceMove[] {
  return [...moves].reverse().map(inverseMove);
}
