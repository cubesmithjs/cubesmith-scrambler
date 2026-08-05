/**
 * Square-1 notation. See `docs/square1-design.md` for the sourced background;
 * this file is the decisions it reached, in code.
 *
 * A scramble is a sequence of layer-turn pairs, each followed by a slice:
 *
 * ```
 *   (-2, 0) / (-3, -3) / (2, 5) / … / (-6, 0) /
 * ```
 *
 * - `x` — 30° **clockwise** turns of the **upper** layer; negative is
 *   counterclockwise.
 * - `y` — the same for the **lower** layer.
 * - `/` — turn the right half of the puzzle 180°.
 *
 * Each number counts 30° units, and since a corner spans two units and an edge
 * one, it reads as "a sum of 1s for edges and 2s for corners".
 *
 * ## Why this doesn't reuse `notation/move.ts`
 *
 * Nothing carries over. There are no named faces, no turn amounts in the cube
 * sense, and the two layers move *simultaneously* in a single token — a
 * Square-1 move is an ordered pair of integers mod 12 plus a separate slice,
 * which has no expression in `Face`/`Amount`.
 *
 * ## Metric
 *
 * `(x,y)` is **one** move and `/` is **one** move — the WCA/TNoodle axis-turn
 * metric. The regulations never define a Square-1 move
 * (`thewca/wca-regulations#364`, open since 2016), and the alternatives
 * disagree: the face-turn metric counts `(x,y)` as two. Matching TNoodle is
 * what makes generated scrambles comparable to official ones.
 */

/** How many 30° units make a full layer. Turn amounts live in `Z12`. */
export const SQUARE1_UNITS = 12;

/**
 * A layer-turn pair. `top` and `bottom` are already reduced into
 * `[0, 12)`; `CANONICAL_MIN`/`CANONICAL_MAX` describe how they *print*.
 */
export interface Square1LayerTurn {
  readonly kind: 'turn';
  readonly top: number;
  readonly bottom: number;
}

export interface Square1Slice {
  readonly kind: 'slice';
}

export type Square1Move = Square1LayerTurn | Square1Slice;

export const SLICE: Square1Slice = { kind: 'slice' };

/**
 * The canonical printed range. Twelve residues need twelve spellings, and
 * `[-5, 6]` gives exactly one each — so `6` prints as `6` and never as `-6`.
 *
 * Real scrambles in the wild do contain `-6`, because generators differ on the
 * representative they pick. `parseSquare1Amount` therefore accepts any integer
 * and reduces it, while rendering always produces the canonical form. Anything
 * copied in from another tool round-trips *semantically*, which is what
 * matters, even if its spelling is normalised.
 */
export const CANONICAL_MIN = -5;
export const CANONICAL_MAX = 6;

export function normalizeUnits(value: number): number {
  if (!Number.isInteger(value)) {
    throw new Error(`square1-notation: turn amount must be an integer, got ${value}`);
  }
  return ((value % SQUARE1_UNITS) + SQUARE1_UNITS) % SQUARE1_UNITS;
}

/** `[0,12)` → the canonical printed representative in `[-5, 6]`. */
export function toCanonicalUnits(value: number): number {
  const reduced = normalizeUnits(value);
  return reduced > CANONICAL_MAX ? reduced - SQUARE1_UNITS : reduced;
}

export function layerTurn(top: number, bottom: number): Square1LayerTurn {
  const t = normalizeUnits(top);
  const b = normalizeUnits(bottom);
  if (t === 0 && b === 0) {
    // `(0,0)` turns nothing. It is not a move, only a spelling, and admitting
    // it would let a scramble contain a token that does nothing while still
    // costing a move under the metric.
    throw new Error('square1-notation: (0,0) is not a move');
  }
  return { kind: 'turn', top: t, bottom: b };
}

export function isLayerTurn(move: Square1Move): move is Square1LayerTurn {
  return move.kind === 'turn';
}

/** Every legal layer turn: all 12x12 pairs except `(0,0)`. */
export function allLayerTurns(): readonly Square1LayerTurn[] {
  const turns: Square1LayerTurn[] = [];
  for (let top = 0; top < SQUARE1_UNITS; top += 1) {
    for (let bottom = 0; bottom < SQUARE1_UNITS; bottom += 1) {
      if (top === 0 && bottom === 0) continue;
      turns.push({ kind: 'turn', top, bottom });
    }
  }
  return turns;
}

export const LAYER_TURN_COUNT = SQUARE1_UNITS * SQUARE1_UNITS - 1; // 143

export function square1MoveToString(move: Square1Move): string {
  if (move.kind === 'slice') return '/';
  return `(${toCanonicalUnits(move.top)}, ${toCanonicalUnits(move.bottom)})`;
}

/**
 * Renders a whole sequence in the attested official layout: `(x, y) / ` per
 * pair, spaces around each slash, trailing slash kept when the sequence ends
 * with one.
 */
export function square1MovesToString(moves: readonly Square1Move[]): string {
  return moves.map(square1MoveToString).join(' ');
}

export function parseSquare1Amount(text: string): number {
  if (!/^[+-]?\d+$/.test(text.trim())) {
    throw new Error(`square1-notation: "${text}" is not a turn amount`);
  }
  return normalizeUnits(Number(text.trim()));
}

/**
 * Parses a scramble.
 *
 * Deliberately tolerant about whitespace and about the trailing slash, so that
 * strings from other generators parse: `(1,0)/(0,-2)/` and
 * `(1, 0) / (0, -2) /` are the same scramble. Tolerant about *values* too —
 * `(-6, 0)` and `(6, 0)` are the same move and both parse — but strict about
 * structure: an unbalanced parenthesis, a missing comma, a third number or a
 * `(0,0)` is an error rather than something quietly ignored.
 */
export function parseSquare1Scramble(text: string): Square1Move[] {
  const moves: Square1Move[] = [];
  const pattern = /\(\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*\)|\/|(\S)/g;

  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const [whole, top, bottom, stray] = match;
    if (stray !== undefined) {
      throw new Error(`square1-notation: unexpected "${stray}" in "${text}"`);
    }
    if (whole === '/') {
      moves.push(SLICE);
      continue;
    }
    moves.push(layerTurn(parseSquare1Amount(top!), parseSquare1Amount(bottom!)));
  }

  return moves;
}

/**
 * The inverse of a single move. A slice is its own inverse (it is a 180°
 * turn); a layer turn negates both amounts.
 */
export function inverseSquare1Move(move: Square1Move): Square1Move {
  if (move.kind === 'slice') return SLICE;
  return { kind: 'turn', top: normalizeUnits(-move.top), bottom: normalizeUnits(-move.bottom) };
}

export function inverseSquare1Moves(moves: readonly Square1Move[]): Square1Move[] {
  return [...moves].reverse().map(inverseSquare1Move);
}
