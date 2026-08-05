import { SOLVED_UD_SLICE_COORD, decodeUdSliceCoord } from './coordinates';
import { EDGE_COUNT, SOLVED_STATE, type CubeState } from './state';

/**
 * Phase-2 coordinates, valid only once a state is in G1 (see
 * `coordinates.ts`'s `isInG1`): corner permutation, the permutation of the
 * 8 non-slice edges, and the permutation of the 4 slice edges *within* the
 * slice — each ranked against a canonical, exhaustively-generated
 * permutation list, for the same reason `udSliceCoord` uses a generated
 * combination list rather than a hand-recalled ranking formula: the
 * encode/decode pair is correct by construction, not by whether a formula
 * was remembered correctly.
 */

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

const PERMUTATIONS_8 = generatePermutations(8);
export const PERMUTATION_8_STATES = PERMUTATIONS_8.length; // 8! = 40320
const permutation8Index = new Map<string, number>(
  PERMUTATIONS_8.map((perm, index) => [perm.join(','), index]),
);

const PERMUTATIONS_4 = generatePermutations(4);
export const PERMUTATION_4_STATES = PERMUTATIONS_4.length; // 4! = 24
const permutation4Index = new Map<string, number>(
  PERMUTATIONS_4.map((perm, index) => [perm.join(','), index]),
);

function rank8(perm: readonly number[]): number {
  const key = perm.join(',');
  const index = permutation8Index.get(key);
  if (index === undefined) {
    throw new Error(`phase2-coordinates: "${key}" is not a permutation of [0..7]`);
  }
  return index;
}

function rank4(perm: readonly number[]): number {
  const key = perm.join(',');
  const index = permutation4Index.get(key);
  if (index === undefined) {
    throw new Error(`phase2-coordinates: "${key}" is not a permutation of [0..3]`);
  }
  return index;
}

/** Ranks `cornerPermutation` (already 0–7, no re-mapping needed) against the canonical permutation-of-8 list. */
export function cornerPermCoord(cornerPermutation: readonly number[]): number {
  return rank8(cornerPermutation);
}

export function decodeCornerPermCoord(coord: number): readonly number[] {
  const perm = PERMUTATIONS_8[coord];
  if (!perm) throw new Error(`phase2-coordinates: cornerPermCoord ${coord} out of range`);
  return perm;
}

/** Ranks the 8 non-slice edges' permutation. Only meaningful once in G1, where positions 0–7 always hold pieces 0–7. */
export function edge8PermCoord(edgePermutation: readonly number[]): number {
  return rank8(edgePermutation.slice(0, 8));
}

export function decodeEdge8PermCoord(coord: number): readonly number[] {
  const perm = PERMUTATIONS_8[coord];
  if (!perm) throw new Error(`phase2-coordinates: edge8PermCoord ${coord} out of range`);
  return perm;
}

/** Ranks the 4 slice edges' permutation *within the slice* (positions 8–11, pieces 8–11 remapped to 0–3). Only meaningful once in G1. */
export function udSliceOrderCoord(edgePermutation: readonly number[]): number {
  const sliceValues = edgePermutation.slice(8, 12).map((piece) => piece - 8);
  return rank4(sliceValues);
}

export function decodeUdSliceOrderCoord(coord: number): readonly number[] {
  const perm = PERMUTATIONS_4[coord];
  if (!perm) throw new Error(`phase2-coordinates: udSliceOrderCoord ${coord} out of range`);
  return perm.map((v) => v + 8);
}

export interface Phase2Coordinate {
  readonly cornerPerm: number;
  readonly edge8Perm: number;
  readonly udSliceOrder: number;
}

/** The three phase-2 coordinates of a G1 state. Assumes `state` is already in G1 (`coordinates.ts`'s `isInG1`) — the corner/edge orientation and slice-membership constraints aren't re-checked here. */
export function toPhase2Coordinate(state: CubeState): Phase2Coordinate {
  return {
    cornerPerm: cornerPermCoord(state.cornerPermutation),
    edge8Perm: edge8PermCoord(state.edgePermutation),
    udSliceOrder: udSliceOrderCoord(state.edgePermutation),
  };
}

export const SOLVED_CORNER_PERM_COORD = cornerPermCoord(SOLVED_STATE.cornerPermutation);
export const SOLVED_EDGE8_PERM_COORD = edge8PermCoord(SOLVED_STATE.edgePermutation);
export const SOLVED_UD_SLICE_ORDER_COORD = udSliceOrderCoord(SOLVED_STATE.edgePermutation);

export function isSolvedPhase2(coordinate: Phase2Coordinate): boolean {
  return (
    coordinate.cornerPerm === SOLVED_CORNER_PERM_COORD &&
    coordinate.edge8Perm === SOLVED_EDGE8_PERM_COORD &&
    coordinate.udSliceOrder === SOLVED_UD_SLICE_ORDER_COORD
  );
}

// Re-exported for callers that need to build a concrete representative G1
// state from phase-1/phase-2 coordinates alone (the pruning-table and
// move-table builders in this same puzzle module).
export { SOLVED_UD_SLICE_COORD, decodeUdSliceCoord, EDGE_COUNT };
