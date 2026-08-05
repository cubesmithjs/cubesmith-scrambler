import { SOLVED_222_STATE, type Cube222State } from './state';

/**
 * 2x2x2's entire reachable state space is small enough (7! × 3^6 =
 * 3,674,160 — the well-known Pocket Cube group order, a useful
 * independent cross-check on this module's correctness) to encode as a
 * single combined coordinate pair and cover with *one* pruning table, no
 * two-phase decomposition needed (contrast `puzzles/333/`).
 *
 * Corner 6 (DBL, see `state.ts`) never moves under U/R/F, so only the
 * other 7 corners — at positions {0,1,2,3,4,5,7}, always holding piece
 * values from that same set — are ranked at all.
 */

const MOVABLE_POSITIONS = [0, 1, 2, 3, 4, 5, 7] as const;
const MOVABLE_COUNT = MOVABLE_POSITIONS.length; // 7
const ORIENTATION_FREE_SLOTS = MOVABLE_COUNT - 1; // 6 — the 7th movable corner's orientation is determined

/** `0..5,7` → `0..6`, a dense rank for permutation-ranking purposes (piece 6 never appears here). */
function toDenseValue(piece: number): number {
  return piece === 7 ? 6 : piece;
}

function fromDenseValue(dense: number): number {
  return dense === 6 ? 7 : dense;
}

function generatePermutations(n: number): number[][] {
  const elements = Array.from({ length: n }, (_, i) => i);
  const results: number[][] = [];
  function recurse(current: number[], remaining: number[]): void {
    if (remaining.length === 0) {
      results.push(current);
      return;
    }
    for (let i = 0; i < remaining.length; i += 1) {
      const next = remaining[i]!;
      recurse([...current, next], [...remaining.slice(0, i), ...remaining.slice(i + 1)]);
    }
  }
  recurse([], elements);
  return results;
}

const PERMUTATIONS_7 = generatePermutations(MOVABLE_COUNT);
export const CORNER_PERM_222_STATES = PERMUTATIONS_7.length; // 7! = 5040
const permutation7Index = new Map<string, number>(
  PERMUTATIONS_7.map((perm, index) => [perm.join(','), index]),
);

export function cornerPerm222Coord(cornerPermutation: readonly number[]): number {
  const dense = MOVABLE_POSITIONS.map((pos) => toDenseValue(cornerPermutation[pos]!));
  const key = dense.join(',');
  const index = permutation7Index.get(key);
  if (index === undefined) {
    throw new Error(`coordinates-222: "${key}" is not a valid permutation of the 7 movable corners`);
  }
  return index;
}

/** A full (length-8) corner permutation matching this coordinate, with corner 6 fixed. */
export function decodeCornerPerm222Coord(coord: number): number[] {
  const dense = PERMUTATIONS_7[coord];
  if (!dense) throw new Error(`coordinates-222: cornerPerm222Coord ${coord} out of range`);
  const permutation = new Array<number>(8).fill(-1);
  permutation[6] = 6;
  MOVABLE_POSITIONS.forEach((pos, i) => {
    permutation[pos] = fromDenseValue(dense[i]!);
  });
  return permutation;
}

export const CORNER_ORIENTATION_222_STATES = 3 ** ORIENTATION_FREE_SLOTS; // 729

export function cornerOrientation222Coord(cornerOrientation: readonly number[]): number {
  let coord = 0;
  for (let i = 0; i < ORIENTATION_FREE_SLOTS; i += 1) {
    coord = coord * 3 + cornerOrientation[MOVABLE_POSITIONS[i]!]!;
  }
  return coord;
}

/** A full (length-8) corner orientation array matching this coordinate, with corner 6 fixed at 0. */
export function decodeCornerOrientation222Coord(coord: number): number[] {
  const orientation = new Array<number>(8).fill(0);
  let remaining = coord;
  let sum = 0;
  const digits = new Array<number>(ORIENTATION_FREE_SLOTS);
  for (let i = ORIENTATION_FREE_SLOTS - 1; i >= 0; i -= 1) {
    const digit = remaining % 3;
    digits[i] = digit;
    sum += digit;
    remaining = (remaining - digit) / 3;
  }
  for (let i = 0; i < ORIENTATION_FREE_SLOTS; i += 1) {
    orientation[MOVABLE_POSITIONS[i]!] = digits[i]!;
  }
  // The 7th movable corner (last in MOVABLE_POSITIONS) carries whatever
  // makes the movable corners' total ≡ 0 (mod 3) — corner 6 always
  // contributes 0, so the constraint is over just these 7.
  orientation[MOVABLE_POSITIONS[MOVABLE_COUNT - 1]!] = (3 - (sum % 3)) % 3;
  return orientation;
}

export interface Coordinate222 {
  readonly cornerPerm: number;
  readonly cornerOrientation: number;
}

export function toCoordinate222(state: Cube222State): Coordinate222 {
  return {
    cornerPerm: cornerPerm222Coord(state.cornerPermutation),
    cornerOrientation: cornerOrientation222Coord(state.cornerOrientation),
  };
}

export const SOLVED_CORNER_PERM_222_COORD = cornerPerm222Coord(SOLVED_222_STATE.cornerPermutation);
export const SOLVED_CORNER_ORIENTATION_222_COORD = cornerOrientation222Coord(
  SOLVED_222_STATE.cornerOrientation,
);

export function isSolved222Coordinate(coordinate: Coordinate222): boolean {
  return (
    coordinate.cornerPerm === SOLVED_CORNER_PERM_222_COORD &&
    coordinate.cornerOrientation === SOLVED_CORNER_ORIENTATION_222_COORD
  );
}
