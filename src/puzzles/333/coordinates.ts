import { CORNER_COUNT, EDGE_COUNT, SOLVED_STATE, type CubeState } from './state';

/**
 * Coordinate representations of a `CubeState`, for the two-phase search
 * (`search.ts`). Each coordinate collapses a subset of the cube's state
 * into a small integer, which is what makes a pruning-table-guided IDA*
 * search over billions of raw states tractable: the search reasons about a
 * handful of small integers per node instead of the full 8+8+12+12-entry
 * `CubeState`.
 *
 * Two different encoding strategies are used, deliberately:
 * - Orientation coordinates (`cornerOrientationCoord`/`edgeOrientationCoord`)
 *   are plain positional-number-system encodings (base 3 / base 2) — safe
 *   to compute directly from a formula, low risk of getting wrong.
 * - Combinatorial coordinates (`udSliceCoord`, the two permutation
 *   coordinates in `phase2-coordinates.ts`) instead enumerate every
 *   possibility once into a canonical lookup table and index into it, never
 *   relying on a hand-recalled ranking formula. Slightly more code, but the
 *   encode/decode pair is correct by construction (both directions are
 *   built from the exact same generated list) rather than by whether a
 *   formula was remembered correctly — the same "derive, don't transcribe"
 *   principle `geometry.ts` uses for the move tables.
 */

const CORNER_TWIST_SLOTS = CORNER_COUNT - 1; // the 8th corner's orientation is always determined
const EDGE_FLIP_SLOTS = EDGE_COUNT - 1; // the 12th edge's orientation is always determined

export const CORNER_ORIENTATION_STATES = 3 ** CORNER_TWIST_SLOTS; // 2187
export const EDGE_ORIENTATION_STATES = 2 ** EDGE_FLIP_SLOTS; // 2048

/** Encodes `cornerOrientation` as a base-3 number over its first 7 entries (the 8th is redundant — see the module doc comment). */
export function cornerOrientationCoord(cornerOrientation: readonly number[]): number {
  let coord = 0;
  for (let i = 0; i < CORNER_TWIST_SLOTS; i += 1) {
    coord = coord * 3 + cornerOrientation[i]!;
  }
  return coord;
}

/** Inverse of {@link cornerOrientationCoord}: the 8th entry is derived so the total is ≡ 0 (mod 3), the invariant every reachable state satisfies. */
export function decodeCornerOrientationCoord(coord: number): number[] {
  const orientation = new Array<number>(CORNER_COUNT).fill(0);
  let remaining = coord;
  let sum = 0;
  for (let i = CORNER_TWIST_SLOTS - 1; i >= 0; i -= 1) {
    const digit = remaining % 3;
    orientation[i] = digit;
    sum += digit;
    remaining = (remaining - digit) / 3;
  }
  orientation[CORNER_COUNT - 1] = (3 - (sum % 3)) % 3;
  return orientation;
}

/** Encodes `edgeOrientation` as a base-2 number over its first 11 entries (the 12th is redundant). */
export function edgeOrientationCoord(edgeOrientation: readonly number[]): number {
  let coord = 0;
  for (let i = 0; i < EDGE_FLIP_SLOTS; i += 1) {
    coord = coord * 2 + edgeOrientation[i]!;
  }
  return coord;
}

/** Inverse of {@link edgeOrientationCoord}: the 12th entry is derived so the total is even. */
export function decodeEdgeOrientationCoord(coord: number): number[] {
  const orientation = new Array<number>(EDGE_COUNT).fill(0);
  let remaining = coord;
  let sum = 0;
  for (let i = EDGE_FLIP_SLOTS - 1; i >= 0; i -= 1) {
    const digit = remaining % 2;
    orientation[i] = digit;
    sum += digit;
    remaining = (remaining - digit) / 2;
  }
  orientation[EDGE_COUNT - 1] = sum % 2;
  return orientation;
}

/** Edge piece indices 8–11 (FR, FL, BL, BR — see `geometry.ts`'s `EDGE_POSITIONS`) are the four "E-slice" edges phase 1 confines to the middle layer. */
const SLICE_EDGE_PIECES = new Set([8, 9, 10, 11]);

/**
 * All 4-subsets of `[0, 12)`, generated once in a fixed (lexicographic)
 * order — the canonical list both `udSliceCoord` and
 * `decodeUdSliceCoord` index into, so they're inverses of each other by
 * construction rather than by a hand-derived ranking formula.
 */
function generateCombinations(n: number, k: number): number[][] {
  const results: number[][] = [];
  const current: number[] = [];
  function recurse(start: number): void {
    if (current.length === k) {
      results.push([...current]);
      return;
    }
    for (let i = start; i < n; i += 1) {
      current.push(i);
      recurse(i + 1);
      current.pop();
    }
  }
  recurse(0);
  return results;
}

const UD_SLICE_COMBINATIONS = generateCombinations(EDGE_COUNT, 4);
export const UD_SLICE_STATES = UD_SLICE_COMBINATIONS.length; // C(12,4) = 495

const udSliceCombinationIndex = new Map<string, number>(
  UD_SLICE_COMBINATIONS.map((combination, index) => [combination.join(','), index]),
);

/** Which 4 of the 12 edge *positions* currently hold a slice-origin piece (8–11), as an index into the canonical combination list. */
export function udSliceCoord(edgePermutation: readonly number[]): number {
  const positions: number[] = [];
  for (let pos = 0; pos < EDGE_COUNT; pos += 1) {
    if (SLICE_EDGE_PIECES.has(edgePermutation[pos]!)) positions.push(pos);
  }
  const key = positions.join(',');
  const index = udSliceCombinationIndex.get(key);
  if (index === undefined) {
    throw new Error(`coordinates: "${key}" is not a valid 4-of-12 slice-edge combination`);
  }
  return index;
}

/** The 4 positions (out of 12) a given `udSliceCoord` value represents. */
export function decodeUdSliceCoord(coord: number): readonly number[] {
  const combination = UD_SLICE_COMBINATIONS[coord];
  if (!combination) {
    throw new Error(`coordinates: udSliceCoord ${coord} is out of range [0, ${UD_SLICE_STATES})`);
  }
  return combination;
}

export interface Phase1Coordinate {
  readonly twist: number;
  readonly flip: number;
  readonly udSlice: number;
}

/** The three phase-1 coordinates of `state`, as a single object for convenience. */
export function toPhase1Coordinate(state: CubeState): Phase1Coordinate {
  return {
    twist: cornerOrientationCoord(state.cornerOrientation),
    flip: edgeOrientationCoord(state.edgeOrientation),
    udSlice: udSliceCoord(state.edgePermutation),
  };
}

/**
 * The `udSliceCoord` value the four slice edges (pieces 8–11) have when
 * they occupy their solved positions (8–11). **Not** necessarily 0 —
 * `udSliceCoord` indexes into a canonical lexicographic list of all 4-of-12
 * combinations, and `[8,9,10,11]` is the *last* one in that ordering, not
 * the first. Computed from `SOLVED_STATE` rather than assumed, precisely to
 * avoid hardcoding that off-by-a-lot mistake.
 */
export const SOLVED_UD_SLICE_COORD = udSliceCoord(SOLVED_STATE.edgePermutation);

/** A state is in the phase-1 target subgroup G1 once corners and edges are all oriented and the slice edges are confined to the slice — permutation within those constraints is phase 2's job. */
export function isInG1(coordinate: Phase1Coordinate): boolean {
  return (
    coordinate.twist === 0 && coordinate.flip === 0 && coordinate.udSlice === SOLVED_UD_SLICE_COORD
  );
}
