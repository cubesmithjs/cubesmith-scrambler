import {
  isLayerTurn,
  SQUARE1_UNITS,
  type Square1LayerTurn,
  type Square1Move,
} from './notation';

/**
 * The Square-1 state model: **24 unit slots plus one bit**. See
 * `docs/square1-design.md` §3–§5 for the sourced reasoning; this file is that
 * model in code.
 *
 * ## Slots
 *
 * Both rings are indexed `0..11` in **one absolute angular frame**: slot `i`
 * spans the same wedge of angle whether it is read on the upper or the lower
 * ring. That shared frame is what makes the slice expressible at all — it
 * exchanges upper slots with lower ones, so the two rings have to be measured
 * against the same protractor.
 *
 * `slots[0..11]` is the upper ring, `slots[12..23]` the lower one.
 *
 * ## Pieces
 *
 * Ids `0..7` are corners, `8..15` are edges. A corner occupies **two
 * consecutive slots of one ring, holding its id in both**; an edge occupies
 * one. `8x2 + 8x1 = 24`, so every slot is accounted for.
 *
 * Nothing tracks orientation, because a Square-1 piece has none to track: which
 * ring holds a piece *is* its orientation. That is why the published position
 * count is `shapes x 8! x 8! x 2` with no orientation factor.
 *
 * "Shape" is likewise not a separate field — it is *which* slots hold corner
 * halves, read straight off the same array (`square1ShapeKey`).
 *
 * ## Turn directions, and the one thing the sources do not say
 *
 * Slot index increases clockwise seen from above. `x` turns the upper layer
 * clockwise, so it **adds** to upper-ring indices. `y` turns the lower layer
 * clockwise *as seen from outside the lower face* — the per-face convention
 * cube notation uses for `U` and `D` — which in a shared frame is the opposite
 * rotational sense, so it **subtracts** from lower-ring indices.
 *
 * That viewpoint is exactly what the sources leave out. Speedsolving's notation
 * page says only "`y` indicates the number of 30-degree increments that the
 * bottom should be twisted clockwise", and Jaap's page only "the multiple of 30
 * degrees that the top/bottom layers are to turn" — neither names the eye the
 * bottom is seen with. So it is settled **empirically** in `state.test.ts`: a
 * real official scramble is a physically applicable sequence, so every `/` in
 * it has to be legal at the moment it appears, and its end state has to be
 * twistable (Regulation 4b3d). Under the mirrored reading of `y` an attested
 * official scramble jams instead.
 *
 * Two related gauge facts, so the empirical claim is not overstated:
 *
 * - The *global* sign is not a fact. Relabelling `i -> 11 - i` on both rings
 *   maps this model exactly onto itself (it fixes `MOVING_HALF` and
 *   `CUT_BOUNDARIES` as sets, and preserves the slice map) while flipping both
 *   signs. Only the **relative** sign of `x` and `y` is physical.
 * - Reflecting through the cut plane (`i -> 5 - i` on both rings) maps this
 *   solved alignment onto the *other* twistable one while negating both
 *   amounts, so the choice of solved alignment is a chirality convention, also
 *   pinned by the same test.
 */

/** Unit slots per ring. */
export const RING_SLOTS = SQUARE1_UNITS;

/** Upper ring + lower ring. */
export const SQUARE1_SLOT_COUNT = 2 * RING_SLOTS;

/** Index of slot 0 of each ring within `slots`. */
export const UPPER_RING = 0;
export const LOWER_RING = RING_SLOTS;
export const SQUARE1_RINGS: readonly number[] = [UPPER_RING, LOWER_RING];

export const SQUARE1_CORNER_COUNT = 8;
export const SQUARE1_EDGE_COUNT = 8;
export const SQUARE1_PIECE_COUNT = SQUARE1_CORNER_COUNT + SQUARE1_EDGE_COUNT;

export interface Square1State {
  /** 24 piece ids: `0..11` the upper ring, `12..23` the lower ring. */
  readonly slots: readonly number[];
  /**
   * Whether the moving half of the middle layer sits upside down.
   *
   * It is a real, visible part of the state — it is the `x2` in
   * `3678 x 8! x 8! x 2` — and it is not independent: only the moving middle
   * piece ever moves, and every slice flips it, so it equals the parity of the
   * number of slices applied.
   */
  readonly middleFlipped: boolean;
}

export function isCornerPiece(piece: number): boolean {
  return piece < SQUARE1_CORNER_COUNT;
}

/**
 * Solved: corners on slots `(0,1) (3,4) (6,7) (9,10)` and edges on `2 5 8 11`,
 * the same alignment in both rings — in a solved cube a corner sits directly
 * above a corner — and the middle the right way up.
 */
export const SOLVED_SQUARE1_STATE: Square1State = {
  slots: [
    0, 0, 8, 1, 1, 9, 2, 2, 10, 3, 3, 11, 4, 4, 12, 5, 5, 13, 6, 6, 14, 7, 7, 15,
  ],
  middleFlipped: false,
};

/**
 * The 180° arc the slice moves: six consecutive slots, listed in angular order
 * so the wrap at 11→0 is visible rather than implied.
 */
export const MOVING_HALF: readonly number[] = [9, 10, 11, 0, 1, 2];

/**
 * Where a slot's contents land under the slice. The slice is a 180° rotation
 * about the horizontal axis perpendicular to the cut plane, which flips the
 * ring **and reflects the angle** — so it is `i -> 11 - i`, an involution that
 * maps `MOVING_HALF` onto itself.
 *
 * The angular reflection is the part that makes Square-1 unlike every other
 * puzzle in this package: the moving arc comes back *reversed*.
 */
export function sliceCounterpart(slot: number): number {
  return RING_SLOTS - 1 - slot;
}

/**
 * The two slot pairs the cut plane runs between — the ends of `MOVING_HALF`.
 * A slice is legal exactly when no corner straddles either of them.
 */
export const CUT_BOUNDARIES: readonly (readonly [number, number])[] = [
  [2, 3],
  [8, 9],
];

/**
 * Regulation 4b3d's second clause — *"the state must allow a `/` move to be
 * applied without a prior (X, Y) move"* — is precisely this predicate.
 *
 * Because a corner is *the same piece id in two consecutive slots*, "a corner
 * straddles the cut" is literally "the same id appears on both sides of it". No
 * separate shape bookkeeping is needed.
 */
export function isSliceLegal(state: Square1State): boolean {
  for (const ring of SQUARE1_RINGS) {
    for (const [before, after] of CUT_BOUNDARIES) {
      if (state.slots[ring + before]! === state.slots[ring + after]!) return false;
    }
  }
  return true;
}

export class Square1IllegalSliceError extends Error {
  constructor() {
    super('@cubesmith/scrambler: this Square-1 state cannot be sliced — a corner straddles the cut');
    this.name = 'Square1IllegalSliceError';
  }
}

/**
 * Layer turns are **always legal**: the whole ring rotates, and a cyclic shift
 * keeps a corner's two slots adjacent, so no piece can be sheared. Only the
 * slice can be blocked.
 */
export function applySquare1LayerTurn(
  state: Square1State,
  turn: Square1LayerTurn,
): Square1State {
  const slots = state.slots.slice();
  for (let i = 0; i < RING_SLOTS; i += 1) {
    slots[UPPER_RING + ((i + turn.top) % RING_SLOTS)] = state.slots[UPPER_RING + i]!;
    slots[LOWER_RING + ((i - turn.bottom + RING_SLOTS) % RING_SLOTS)] =
      state.slots[LOWER_RING + i]!;
  }
  return { slots, middleFlipped: state.middleFlipped };
}

/** Throws `Square1IllegalSliceError` rather than silently producing a torn state. */
export function applySquare1Slice(state: Square1State): Square1State {
  if (!isSliceLegal(state)) throw new Square1IllegalSliceError();
  return sliceUnchecked(state);
}

/**
 * The slice's slot map with the legality test skipped. Exported because it is
 * the independent oracle for `isSliceLegal`: applying it to an illegal state
 * tears a corner in half, so `isSliceLegal(s)` must agree exactly with
 * "`sliceUnchecked(s)` is still a well-formed state" — two descriptions of
 * legality that share no code.
 */
export function sliceUnchecked(state: Square1State): Square1State {
  const slots = state.slots.slice();
  for (const i of MOVING_HALF) {
    const landing = sliceCounterpart(i);
    slots[UPPER_RING + landing] = state.slots[LOWER_RING + i]!;
    slots[LOWER_RING + landing] = state.slots[UPPER_RING + i]!;
  }
  return { slots, middleFlipped: !state.middleFlipped };
}

export function applySquare1Move(state: Square1State, move: Square1Move): Square1State {
  return isLayerTurn(move) ? applySquare1LayerTurn(state, move) : applySquare1Slice(state);
}

export function applySquare1Moves(
  state: Square1State,
  moves: readonly Square1Move[],
): Square1State {
  let current = state;
  for (const move of moves) current = applySquare1Move(current, move);
  return current;
}

export function square1StatesEqual(a: Square1State, b: Square1State): boolean {
  if (a.middleFlipped !== b.middleFlipped) return false;
  for (let i = 0; i < SQUARE1_SLOT_COUNT; i += 1) {
    if (a.slots[i] !== b.slots[i]) return false;
  }
  return true;
}

export function isSquare1Solved(state: Square1State): boolean {
  return square1StatesEqual(state, SOLVED_SQUARE1_STATE);
}

/**
 * The shape as a 24-bit key: bit `i` is set when slot `i` holds the **first**
 * of a corner's two slots.
 *
 * Corner *starts* rather than the obvious "is this slot a corner half", because
 * that cruder reading is ambiguous. A ring may hold six corners and no edges
 * (`2c + e = 12` with `c = 6`), and then every slot is a corner half under
 * *two* different pairings — genuinely different shapes with the same
 * corner-half pattern. Start bits distinguish them.
 */
export function square1ShapeKey(state: Square1State): number {
  let key = 0;
  for (const ring of SQUARE1_RINGS) {
    for (let i = 0; i < RING_SLOTS; i += 1) {
      const piece = state.slots[ring + i]!;
      if (!isCornerPiece(piece)) continue;
      const previous = state.slots[ring + ((i + RING_SLOTS - 1) % RING_SLOTS)]!;
      if (previous !== piece) key |= 1 << (ring + i);
    }
  }
  return key;
}

/**
 * Whether a ring's pieces alternate corner-edge-corner-edge — "cube shape" for
 * that layer, in the sense of the solid rather than of which slots it occupies.
 */
export function isRingCubeShaped(state: Square1State, ring: number): boolean {
  const kinds: boolean[] = [];
  for (let i = 0; i < RING_SLOTS; i += 1) {
    const piece = state.slots[ring + i]!;
    const previous = state.slots[ring + ((i + RING_SLOTS - 1) % RING_SLOTS)]!;
    if (piece !== previous) kinds.push(isCornerPiece(piece));
  }
  // Alternation has to be tested cyclically, not against index parity: the walk
  // above starts at slot 0, which may land mid-pattern on an edge, and a ring
  // whose first collected piece is an edge alternates just as well.
  if (kinds.length !== 8) return false;
  return kinds.every((isCorner, index) => isCorner !== kinds[(index + 1) % kinds.length]!);
}

/**
 * Both rings alternate — each layer is a square. **Not** the same as the puzzle
 * being a cube: two square layers rotated 30° from each other are two squares,
 * not a cube. This larger set is the one phase 2 of the solver lives in, and it
 * is the set a slice can keep you inside.
 */
export function hasSquareLayers(state: Square1State): boolean {
  return SQUARE1_RINGS.every((ring) => isRingCubeShaped(state, ring));
}

/**
 * Where each ring's corners start, `mod 3` — the three rotational alignments a
 * square layer can sit in. `undefined` when that ring is not square.
 *
 * Alignment `2` puts corners on slots `(2,3)` and `(8,9)`, straddling both cuts,
 * so a square layer in alignment 2 can never be sliced.
 */
export function square1Alignments(
  state: Square1State,
): readonly [number, number] | undefined {
  if (!hasSquareLayers(state)) return undefined;
  const alignments = SQUARE1_RINGS.map((ring) => {
    for (let i = 0; i < RING_SLOTS; i += 1) {
      const piece = state.slots[ring + i]!;
      const previous = state.slots[ring + ((i + RING_SLOTS - 1) % RING_SLOTS)]!;
      if (isCornerPiece(piece) && piece !== previous) return i % 3;
    }
    throw new Error('@cubesmith/scrambler: a square Square-1 ring with no corners');
  });
  return [alignments[0]!, alignments[1]!];
}

/**
 * A cube: both layers square **and** in the same alignment, so a corner sits
 * directly above a corner. This is what "cube shape" means on the puzzle.
 */
export function isSquare1CubeShaped(state: Square1State): boolean {
  const alignments = square1Alignments(state);
  return alignments !== undefined && alignments[0] === alignments[1];
}

/**
 * Whether `state` could be a state of the physical puzzle at all: every piece
 * present the right number of times, and every corner's two slots consecutive
 * **within one ring**. Used to check that the move functions never produce
 * anything impossible.
 */
export function isWellFormedSquare1State(state: Square1State): boolean {
  if (state.slots.length !== SQUARE1_SLOT_COUNT) return false;

  const seen = new Array<number>(SQUARE1_PIECE_COUNT).fill(0);
  for (const piece of state.slots) {
    if (!Number.isInteger(piece) || piece < 0 || piece >= SQUARE1_PIECE_COUNT) return false;
    seen[piece]! += 1;
  }
  for (let piece = 0; piece < SQUARE1_PIECE_COUNT; piece += 1) {
    if (seen[piece] !== (isCornerPiece(piece) ? 2 : 1)) return false;
  }

  for (let piece = 0; piece < SQUARE1_CORNER_COUNT; piece += 1) {
    const at: number[] = [];
    for (let slot = 0; slot < SQUARE1_SLOT_COUNT; slot += 1) {
      if (state.slots[slot] === piece) at.push(slot);
    }
    const [first, second] = at as [number, number];
    const ring = first < RING_SLOTS ? UPPER_RING : LOWER_RING;
    if ((second < RING_SLOTS ? UPPER_RING : LOWER_RING) !== ring) return false;
    const gap = (second - first + RING_SLOTS) % RING_SLOTS;
    if (gap !== 1 && gap !== RING_SLOTS - 1) return false;
  }

  return true;
}

/** How many corners each ring holds. Counting forces `2 <= c <= 6` per ring. */
export function cornersPerRing(state: Square1State): readonly [number, number] {
  const counts: [number, number] = [0, 0];
  for (const [index, ring] of SQUARE1_RINGS.entries()) {
    for (let i = 0; i < RING_SLOTS; i += 1) {
      const piece = state.slots[ring + i]!;
      const previous = state.slots[ring + ((i + RING_SLOTS - 1) % RING_SLOTS)]!;
      if (isCornerPiece(piece) && piece !== previous) counts[index]! += 1;
    }
  }
  return counts;
}
