import { AMOUNTS, FACES, type Amount, type Face } from '../../notation/move';

/**
 * Wide-move notation for the NxNxN cubes — the layer-depth extension of
 * `src/notation/move.ts`, which is exactly what that module said it was there
 * for ("only the layer-depth notation differs between cube sizes").
 *
 * - depth 1 — `R`, the outer layer alone.
 * - depth 2 — `Rw`, the outer two layers as a block.
 * - depth 3 and beyond — `3Rw`, `4Rw`, …
 *
 * A cube of size `n` has outer blocks up to `floor(n / 2)`: past halfway a
 * block turn is the opposite face's block turn plus a rotation of the whole
 * puzzle, so deeper prefixes would be redundant notation rather than new
 * moves. That's `R`/`Rw` for 4x4x4 and 5x5x5, and `R`/`Rw`/`3Rw` for 6x6x6
 * and 7x7x7.
 */

export interface WideMove {
  readonly face: Face;
  /** How many layers in from `face` turn together. 1 is the outer layer alone. */
  readonly depth: number;
  readonly amount: Amount;
}

export function maxDepthForSize(size: number): number {
  if (!Number.isInteger(size) || size < 2) {
    throw new Error(`nxn-notation: cube size must be an integer of at least 2, got ${size}`);
  }
  return Math.floor(size / 2);
}

/** `2Rw` is accepted on input but never produced — `Rw` is the spelling WCA scrambles use. */
export function wideMoveToString(move: WideMove): string {
  const prefix = move.depth >= 3 ? String(move.depth) : '';
  const wide = move.depth >= 2 ? 'w' : '';
  const suffix = move.amount === 2 ? '2' : move.amount === 3 ? "'" : '';
  return `${prefix}${move.face}${wide}${suffix}`;
}

export function wideMovesToString(moves: readonly WideMove[]): string {
  return moves.map(wideMoveToString).join(' ');
}

export function parseWideMove(token: string): WideMove {
  const match = /^(\d+)?([UDFBLR])(w)?(2|')?$/.exec(token);
  if (!match) {
    throw new Error(`nxn-notation: "${token}" is not a valid wide-move token`);
  }
  const prefix = match[1];
  const isWide = match[3] === 'w';
  if (prefix !== undefined && !isWide) {
    throw new Error(`nxn-notation: "${token}" has a layer count but no 'w'`);
  }
  const depth = prefix !== undefined ? Number(prefix) : isWide ? 2 : 1;
  if (depth < 2 && isWide) {
    throw new Error(`nxn-notation: "${token}" is a wide move of depth ${depth}`);
  }
  const suffix = match[4];
  return {
    face: match[2] as Face,
    depth,
    amount: suffix === '2' ? 2 : suffix === "'" ? 3 : 1,
  };
}

export function inverseWideMove(move: WideMove): WideMove {
  return { ...move, amount: (4 - move.amount) as Amount };
}

export function inverseWideMoves(moves: readonly WideMove[]): WideMove[] {
  return [...moves].reverse().map(inverseWideMove);
}

/** Every legal move on a cube of this size: 6 faces x depths x 3 amounts. */
export function allMovesForSize(size: number): readonly WideMove[] {
  const maxDepth = maxDepthForSize(size);
  const moves: WideMove[] = [];
  for (const face of FACES) {
    for (let depth = 1; depth <= maxDepth; depth += 1) {
      for (const amount of AMOUNTS) moves.push({ face, depth, amount });
    }
  }
  return moves;
}

/**
 * The axis a move turns about, as `'x' | 'y' | 'z'`. Two moves on the same
 * axis commute, which is what the redundancy rule in `random-moves.ts` needs
 * to reason about.
 */
export function moveAxis(move: WideMove): 'x' | 'y' | 'z' {
  if (move.face === 'R' || move.face === 'L') return 'x';
  if (move.face === 'U' || move.face === 'D') return 'y';
  return 'z';
}

/** Identifies the exact set of layers a move turns — two moves sharing it always merge. */
export function moveLayerSet(move: WideMove): string {
  return `${move.face}${move.depth}`;
}

/**
 * Whole-cube rotations — `x`, `y`, `z` — which are the same thing as a block
 * turn that happens to include *every* layer.
 *
 * A rotation is not a turn: it moves no piece relative to any other, so it
 * cannot scramble or unscramble anything. It is an instruction about how to
 * hold the puzzle, and that is exactly what a blindfolded event needs from an
 * even cube, which has no fixed centre to make a partial reorientation
 * meaningful. `orientation.ts` uses them for that; nothing else in the package
 * emits one.
 *
 * The spellings and the R/U/F → x/y/z mapping are TNoodle's
 * (`CubePuzzle.faceRotationsByName`), so a `444bf` scramble reads exactly as
 * the official program prints it. Only three of the six faces have a name —
 * an `L` rotation is spelled `x'`, not `x` about L — so a rotation is always
 * rendered from R, U or F.
 */
const ROTATION_BY_FACE: Partial<Record<Face, string>> = { R: 'x', U: 'y', F: 'z' };
const FACE_BY_ROTATION: Readonly<Record<string, Face>> = { x: 'R', y: 'U', z: 'F' };

/** Whether `move` turns every layer, and is therefore a rotation rather than a turn. */
export function isWholeCubeRotation(move: WideMove, size: number): boolean {
  return move.depth >= size;
}

/**
 * Renders any token a scramble string can contain, rotations included.
 *
 * Separate from `wideMoveToString` rather than an optional parameter on it,
 * because `wideMoveToString` is passed straight to `Array.map` in places and a
 * second parameter would silently collect the array index as the cube size.
 */
export function scrambleTokenToString(move: WideMove, size: number): string {
  if (!isWholeCubeRotation(move, size)) return wideMoveToString(move);
  const rotation = ROTATION_BY_FACE[move.face];
  if (rotation === undefined) {
    throw new Error(
      `nxn-notation: a whole-cube rotation about ${move.face} has no WCA spelling — use R, U or F`,
    );
  }
  const suffix = move.amount === 2 ? '2' : move.amount === 3 ? "'" : '';
  return `${rotation}${suffix}`;
}

export function scrambleTokensToString(moves: readonly WideMove[], size: number): string {
  return moves.map((move) => scrambleTokenToString(move, size)).join(' ');
}

/**
 * Parses any token a scramble string can contain, rotations included. The size
 * is required and not merely helpful: `x` is a four-layer block on a 4x4x4 and
 * a five-layer one on a 5x5x5, so the token alone does not determine the move.
 */
export function parseScrambleToken(token: string, size: number): WideMove {
  const rotation = /^([xyz])(2|')?$/.exec(token);
  if (!rotation) return parseWideMove(token);
  const suffix = rotation[2];
  return {
    face: FACE_BY_ROTATION[rotation[1]!]!,
    depth: size,
    amount: suffix === '2' ? 2 : suffix === "'" ? 3 : 1,
  };
}
