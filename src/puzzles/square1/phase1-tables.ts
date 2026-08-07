import { permutationParity } from '../../utils/permutation';
import { alignmentIndex } from './phase2-coordinates';
import { phase2ClassIndex, phase2ReachableClasses } from './phase2-tables';
import { enumerateAllShapeKeys, stateForShape } from './shapes';
import {
  applySquare1Slice,
  isCornerPiece,
  RING_SLOTS,
  SQUARE1_CORNER_COUNT,
  type Square1State,
} from './state';

/**
 * Phase 1 of the solver: get the puzzle to **square layers** — both rings
 * alternating corner-edge — from which phase 2 can work without ever leaving
 * that set again.
 *
 * Everything here operates on the 24-bit shape key alone, with no piece array
 * in sight, because a shape's *shape* transitions are pure bit work:
 *
 * - a **turn** rotates a ring's corner-start bits (left for the upper ring,
 *   right for the lower — `y` runs the other way round, see `state.ts`);
 * - a **slice** keeps each ring's two "fixed half" starts and takes the other
 *   ring's "moving half" starts reflected through `s → 10 − s`.
 *
 * That reflection is `sliceCounterpart` seen from the corner's point of view: a
 * corner on `(s, s+1)` lands on `(11−s−1, 11−s)`, so its start moves to
 * `10 − s`. It is only well defined when the slice is legal, which in bit terms
 * is simply "no start on slot 2 or 8" (§ `CUT_STRADDLING_STARTS`).
 *
 * The payoff is speed: the breadth-first search below visits 19,305 shapes with
 * 144 moves each using nothing but shifts and masks. `phase1-tables.test.ts`
 * checks every one of those transitions against the real state model, so the
 * fast path is verified against the slow one rather than trusted.
 */

export const RING_MASK = (1 << RING_SLOTS) - 1;

export function upperStarts(key: number): number {
  return key & RING_MASK;
}

export function lowerStarts(key: number): number {
  return (key >>> RING_SLOTS) & RING_MASK;
}

export function shapeKeyFromStarts(upper: number, lower: number): number {
  return (upper & RING_MASK) | ((lower & RING_MASK) << RING_SLOTS);
}

/** Rotate a ring's start bits by `amount` slots in the direction of increasing index. */
export function rotateStarts(mask: number, amount: number): number {
  const shift = ((amount % RING_SLOTS) + RING_SLOTS) % RING_SLOTS;
  return ((mask << shift) | (mask >>> (RING_SLOTS - shift))) & RING_MASK;
}

export function turnShapeKey(key: number, top: number, bottom: number): number {
  return shapeKeyFromStarts(
    rotateStarts(upperStarts(key), top),
    rotateStarts(lowerStarts(key), -bottom),
  );
}

/** Corner starts whose corner lies wholly inside the moving half `{9,10,11,0,1,2}`. */
const MOVING_STARTS = (1 << 9) | (1 << 10) | (1 << 11) | (1 << 0) | (1 << 1);
/** …and wholly outside it. Starts 2 and 8 are the straddling ones, and are what blocks a slice. */
const FIXED_STARTS = (1 << 3) | (1 << 4) | (1 << 5) | (1 << 6) | (1 << 7);
const STRADDLING_STARTS = (1 << 2) | (1 << 8);

/** `s → 10 − s` on the moving half: `9↔1`, `10↔0`, `11` fixed. */
function reflectMovingStarts(mask: number): number {
  let reflected = 0;
  for (let start = 0; start < RING_SLOTS; start += 1) {
    if ((mask & (1 << start)) === 0) continue;
    reflected |= 1 << ((RING_SLOTS + 10 - start) % RING_SLOTS);
  }
  return reflected;
}

export function isTwistableShape(key: number): boolean {
  return (
    (upperStarts(key) & STRADDLING_STARTS) === 0 &&
    (lowerStarts(key) & STRADDLING_STARTS) === 0
  );
}

/** The shape after a slice, or `undefined` when a corner straddles the cut. */
export function sliceShapeKey(key: number): number | undefined {
  if (!isTwistableShape(key)) return undefined;
  const upper = upperStarts(key);
  const lower = lowerStarts(key);
  return shapeKeyFromStarts(
    (upper & FIXED_STARTS) | reflectMovingStarts(lower & MOVING_STARTS),
    (lower & FIXED_STARTS) | reflectMovingStarts(upper & MOVING_STARTS),
  );
}

/** A square ring in alignment `a` has its corners on `a, a+3, a+6, a+9`. */
export const SQUARE_RING_STARTS = 0b001001001001;

export function squareRingStarts(alignment: number): number {
  return rotateStarts(SQUARE_RING_STARTS, alignment);
}

/** The nine shapes with both layers square — phase 1's goal set. */
export const SQUARE_LAYER_SHAPE_KEYS: readonly number[] = [0, 1, 2].flatMap((top) =>
  [0, 1, 2].map((bottom) => shapeKeyFromStarts(squareRingStarts(top), squareRingStarts(bottom))),
);

/**
 * ## Parity, and why it is in this table
 *
 * Square layers alone are **not** a sufficient goal. Phase 2 can only reach half
 * of the `(alignment, corner parity, edge parity)` classes, so an ending in the
 * wrong half is not a slow solve but an impossible one (`phase2-tables.ts`).
 *
 * Filtering endings after the fact does not work either, and the reason is
 * instructive: appending a turn to an ending keeps it inside square layers, and
 * every move *inside* square layers is a phase-2 move, which by definition
 * cannot change the half. So a whole family of longer endings inherits the same
 * unusable class, and an enumeration can grind through thousands of them
 * finding nothing.
 *
 * The parity therefore belongs in the coordinate: this table is indexed by
 * `(shape, parity)` and its goal set is the nine square-layer shapes each paired
 * with the one parity phase 2 accepts. The search is then exact again, and every
 * ending it returns is usable by construction.
 *
 * `parity` here is `parity(corner permutation) XOR parity(edge permutation)`
 * with positions read in ascending slot order — the same reading
 * `phase2-coordinates.ts` uses, which is what lets the two phases agree.
 */

/** Parity of the cyclic shift by `by` of `size` elements: `size - gcd` cycles' worth. */
function cyclicShiftParity(size: number, by: number): number {
  if (size === 0 || by % size === 0) return 0;
  let a = size;
  let b = by % size;
  while (b !== 0) [a, b] = [b, a % b];
  return (size - a) % 2;
}

/** The slots a ring's edges occupy: everything no corner covers. */
function edgeStarts(mask: number): number {
  return ~(mask | rotateStarts(mask, 1)) & RING_MASK;
}

function popcount(bits: number): number {
  let count = 0;
  for (let value = bits; value !== 0; value &= value - 1) count += 1;
  return count;
}

let ringFlips: Uint8Array | undefined;

/**
 * How rotating one ring by `shift` flips that ring's contribution to the parity.
 *
 * Rotating slides the pieces that pass slot 11 round to the front, and since
 * positions are numbered in ascending slot order that is exactly a cyclic shift
 * of the ring's positions by the number of pieces that wrapped. Corners and
 * edges wrap in different numbers — which is the whole reason parity moves at
 * all — so the flip is the XOR of the two shifts' parities.
 *
 * Tabulated over every 12-bit mask, so the phase-1 breadth-first search costs
 * two lookups per turn instead of building a permutation.
 */
function ringTurnFlip(mask: number, shift: number): number {
  if (!ringFlips) {
    ringFlips = new Uint8Array((RING_MASK + 1) * RING_SLOTS);
    for (let bits = 0; bits <= RING_MASK; bits += 1) {
      const edges = edgeStarts(bits);
      const corners = popcount(bits);
      const edgeCount = popcount(edges);
      for (let by = 0; by < RING_SLOTS; by += 1) {
        // A start at slot `s` wraps when `s + by >= 12`.
        const wrapping = by === 0 ? 0 : (RING_MASK << (RING_SLOTS - by)) & RING_MASK;
        ringFlips[bits * RING_SLOTS + by] =
          cyclicShiftParity(corners, popcount(bits & wrapping)) ^
          cyclicShiftParity(edgeCount, popcount(edges & wrapping));
      }
    }
  }
  return ringFlips[mask * RING_SLOTS + (((shift % RING_SLOTS) + RING_SLOTS) % RING_SLOTS)]!;
}

export function turnParityFlip(key: number, top: number, bottom: number): number {
  return ringTurnFlip(upperStarts(key), top) ^ ringTurnFlip(lowerStarts(key), -bottom);
}

const sliceFlips = new Map<number, number>();

/**
 * The slice's parity flip, read off the real state model rather than derived —
 * it moves pieces between rings and reverses an arc, which no per-ring formula
 * captures. Memoised per shape; only the 3,678 twistable shapes ever ask.
 */
export function sliceParityFlip(key: number): number {
  const cached = sliceFlips.get(key);
  if (cached !== undefined) return cached;

  const identity = Array.from({ length: SQUARE1_CORNER_COUNT }, (_, i) => i);
  const before = stateForShape(key, identity, identity, false);
  const flip = combinedParity(applySquare1Slice(before));
  sliceFlips.set(key, flip);
  return flip;
}

/** `parity(corners) XOR parity(edges)`, positions in ascending slot order. */
export function combinedParity(state: Square1State): number {
  const corners: number[] = [];
  const edges: number[] = [];
  for (const ring of [0, RING_SLOTS]) {
    for (let slot = 0; slot < RING_SLOTS; slot += 1) {
      const piece = state.slots[ring + slot]!;
      const previous = state.slots[ring + ((slot + RING_SLOTS - 1) % RING_SLOTS)]!;
      if (piece === previous) continue;
      if (isCornerPiece(piece)) corners.push(piece);
      else edges.push(piece - SQUARE1_CORNER_COUNT);
    }
  }
  return permutationParity(corners) ^ permutationParity(edges);
}

/**
 * The parity phase 2 requires at each alignment, read out of the class table
 * rather than written down — and cross-checked to be the same whichever way up
 * the middle piece is, which is what makes it a function of alignment alone.
 */
export function requiredCombinedParity(alignment: number): number {
  const classes = phase2ReachableClasses();
  for (let parity = 0; parity < 2; parity += 1) {
    const forUnflipped = classes[phase2ClassIndex(alignment, false, 0, parity)] === 1;
    const forFlipped = classes[phase2ClassIndex(alignment, true, 0, parity)] === 1;
    if (forUnflipped !== forFlipped) {
      throw new Error('@cubesmith/scrambler: Square-1 phase-2 parity depends on the middle piece');
    }
    if (forUnflipped) return parity;
  }
  throw new Error('@cubesmith/scrambler: no Square-1 phase-2 parity is reachable at this alignment');
}

export interface Phase1Table {
  /** Dense index per shape key, and its inverse. */
  readonly indexOf: ReadonlyMap<number, number>;
  readonly keys: readonly number[];
  /** Moves to a usable square-layer state, indexed `shape * 2 + parity`. Exact. */
  readonly distance: Uint8Array;
}

let table: Phase1Table | undefined;

export function phase1Table(): Phase1Table {
  if (table) return table;

  const keys = enumerateAllShapeKeys();
  const indexOf = new Map<number, number>(keys.map((key, index) => [key, index]));
  const distance = new Uint8Array(keys.length * 2).fill(255);

  const queue: number[] = [];
  for (const key of SQUARE_LAYER_SHAPE_KEYS) {
    const alignment = alignmentIndex(
      cornerStartAlignment(upperStarts(key)),
      cornerStartAlignment(lowerStarts(key)),
    );
    const node = indexOf.get(key)! * 2 + requiredCombinedParity(alignment);
    distance[node] = 0;
    queue.push(node);
  }

  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head]!;
    const parity = node % 2;
    const key = keys[(node - parity) / 2]!;
    const depth = distance[node]! + 1;

    const successors: number[] = [];
    for (let top = 0; top < RING_SLOTS; top += 1) {
      for (let bottom = 0; bottom < RING_SLOTS; bottom += 1) {
        if (top === 0 && bottom === 0) continue;
        successors.push(
          indexOf.get(turnShapeKey(key, top, bottom))! * 2 +
            (parity ^ turnParityFlip(key, top, bottom)),
        );
      }
    }
    const sliced = sliceShapeKey(key);
    if (sliced !== undefined) {
      successors.push(indexOf.get(sliced)! * 2 + (parity ^ sliceParityFlip(key)));
    }

    for (const successor of successors) {
      if (distance[successor] !== 255) continue;
      distance[successor] = depth;
      queue.push(successor);
    }
  }

  table = { indexOf, keys, distance };
  return table;
}

/** Which alignment a square ring's corner starts describe. */
function cornerStartAlignment(mask: number): number {
  for (let slot = 0; slot < RING_SLOTS; slot += 1) {
    if ((mask & (1 << slot)) !== 0) return slot % 3;
  }
  throw new Error('@cubesmith/scrambler: a Square-1 ring with no corners');
}

/**
 * Exact number of moves to a square-layer shape phase 2 can then finish from.
 */
export function movesToPhase1Goal(key: number, parity: number): number {
  const { indexOf, distance } = phase1Table();
  const index = indexOf.get(key);
  if (index === undefined) {
    throw new Error('@cubesmith/scrambler: Square-1 shape key is not a shape the puzzle has');
  }
  return distance[index * 2 + parity]!;
}
