import {
  LOWER_RING,
  RING_SLOTS,
  square1Alignments,
  SQUARE1_CORNER_COUNT,
  SQUARE1_SLOT_COUNT,
  UPPER_RING,
  type Square1State,
} from './state';

/**
 * Phase-2 coordinates: a **complete** description of any state with square
 * layers, in four small numbers.
 *
 * Once both rings alternate, the shape is nothing but the pair of alignments
 * (`0`, `1` or `2` per ring — where each ring's corners start, mod 3), so a
 * state is exactly:
 *
 * ```
 *   alignment  0..8      which of the 3 x 3 alignment pairs
 *   middle     0..1      the moving middle piece, upside down or not
 *   corners    0..40319  which corner sits in each of the 8 corner positions
 *   edges      0..40319  likewise for edges
 * ```
 *
 * `9 x 2 x 8! x 8! = 29,262,643,200` — far too many to tabulate, which is why
 * phase 2 searches rather than looks up, but each of the four factors *is*
 * small enough to tabulate on its own. That is where the pruning tables come
 * from (`phase2-tables.ts`).
 *
 * **Positions are ordered by slot, ascending, upper ring first.** That is the
 * same ordering the phase-1 parity uses, which matters: the invariant phase 1
 * has to satisfy — corner and edge permutations of equal parity — is stated in
 * this ordering, so the two phases must agree on it exactly.
 */

export const PHASE2_ALIGNMENT_COUNT = 9;
export const PERMUTATION_COUNT = 40_320; // 8!

/** `(upper, lower)` alignments, indexed `upper * 3 + lower`. */
export function alignmentIndex(upper: number, lower: number): number {
  return upper * 3 + lower;
}

export function alignmentPair(index: number): readonly [number, number] {
  return [Math.floor(index / 3), index % 3];
}

/** Solved is both rings in alignment 0. */
export const SOLVED_ALIGNMENT_INDEX = alignmentIndex(0, 0);

function ringPositionSlots(ring: number, alignment: number, offset: number): number[] {
  const slots: number[] = [];
  for (let k = 0; k < 4; k += 1) {
    slots.push(ring + ((alignment + offset + 3 * k) % RING_SLOTS));
  }
  return slots.sort((a, b) => a - b);
}

/** The eight corner slots of an alignment: the upper ring's four, then the lower ring's. */
export function cornerPositionSlots(index: number): readonly number[] {
  const [upper, lower] = alignmentPair(index);
  return [
    ...ringPositionSlots(UPPER_RING, upper, 0),
    ...ringPositionSlots(LOWER_RING, lower, 0),
  ];
}

/** The eight edge slots: each sits two slots past a corner's start. */
export function edgePositionSlots(index: number): readonly number[] {
  const [upper, lower] = alignmentPair(index);
  return [
    ...ringPositionSlots(UPPER_RING, upper, 2),
    ...ringPositionSlots(LOWER_RING, lower, 2),
  ];
}

/**
 * Lehmer rank of a permutation of `0..n-1`. Straightforward `O(n²)`, which for
 * `n = 8` beats anything cleverer.
 */
export function permutationIndex(permutation: readonly number[]): number {
  let index = 0;
  for (let i = 0; i < permutation.length; i += 1) {
    let smallerAfter = 0;
    for (let j = i + 1; j < permutation.length; j += 1) {
      if (permutation[j]! < permutation[i]!) smallerAfter += 1;
    }
    index = index * (permutation.length - i) + smallerAfter;
  }
  return index;
}

export function permutationFromIndex(index: number, size: number): number[] {
  const digits: number[] = [];
  let remaining = index;
  for (let radix = 1; radix <= size; radix += 1) {
    digits.unshift(remaining % radix);
    remaining = Math.floor(remaining / radix);
  }
  if (remaining !== 0) {
    throw new Error(`@cubesmith/scrambler: permutation index ${index} is out of range for ${size}`);
  }

  const available = Array.from({ length: size }, (_, i) => i);
  return digits.map((digit) => available.splice(digit, 1)[0]!);
}

export interface Phase2Coordinate {
  readonly alignment: number;
  readonly middleFlipped: boolean;
  readonly corners: number;
  readonly edges: number;
}

export const SOLVED_PHASE2_COORDINATE: Phase2Coordinate = {
  alignment: SOLVED_ALIGNMENT_INDEX,
  middleFlipped: false,
  corners: 0,
  edges: 0,
};

export class NotSquareLayersError extends Error {
  constructor() {
    super('@cubesmith/scrambler: phase 2 needs both Square-1 layers square; phase 1 comes first');
    this.name = 'NotSquareLayersError';
  }
}

/** `square1Alignments`, but insisting rather than returning `undefined`. */
export function square1AlignmentsOf(state: Square1State): readonly [number, number] {
  const alignments = square1Alignments(state);
  if (!alignments) throw new NotSquareLayersError();
  return alignments;
}

export function toPhase2Coordinate(state: Square1State): Phase2Coordinate {
  const alignments = square1AlignmentsOf(state);
  const index = alignmentIndex(alignments[0], alignments[1]);
  const corners = cornerPositionSlots(index).map((slot) => state.slots[slot]!);
  const edges = edgePositionSlots(index).map(
    (slot) => state.slots[slot]! - SQUARE1_CORNER_COUNT,
  );

  return {
    alignment: index,
    middleFlipped: state.middleFlipped,
    corners: permutationIndex(corners),
    edges: permutationIndex(edges),
  };
}

export function fromPhase2Coordinate(coordinate: Phase2Coordinate): Square1State {
  const slots = new Array<number>(SQUARE1_SLOT_COUNT).fill(-1);

  const corners = permutationFromIndex(coordinate.corners, SQUARE1_CORNER_COUNT);
  cornerPositionSlots(coordinate.alignment).forEach((slot, position) => {
    const ring = slot < RING_SLOTS ? UPPER_RING : LOWER_RING;
    slots[slot] = corners[position]!;
    slots[ring + ((slot - ring + 1) % RING_SLOTS)] = corners[position]!;
  });

  const edges = permutationFromIndex(coordinate.edges, SQUARE1_CORNER_COUNT);
  edgePositionSlots(coordinate.alignment).forEach((slot, position) => {
    slots[slot] = edges[position]! + SQUARE1_CORNER_COUNT;
  });

  return { slots, middleFlipped: coordinate.middleFlipped };
}

export function phase2CoordinatesEqual(a: Phase2Coordinate, b: Phase2Coordinate): boolean {
  return (
    a.alignment === b.alignment &&
    a.middleFlipped === b.middleFlipped &&
    a.corners === b.corners &&
    a.edges === b.edges
  );
}

/**
 * Parity of a permutation given as position → piece.
 *
 * Kept because the *absence* of a parity constraint here is a real finding, and
 * one worth being able to re-check: the classic Square-1 two-phase split has
 * phase 1 deliver "a cube with an even permutation", which is necessary only if
 * phase 2's moves cannot change parity. They can here — see `phase2-tables.ts`
 * — so this package's phase 1 has no parity goal at all.
 */
export function permutationParityOfIndex(index: number): 0 | 1 {
  const permutation = permutationFromIndex(index, SQUARE1_CORNER_COUNT);
  const seen = new Array<boolean>(permutation.length).fill(false);
  let transpositions = 0;
  for (let start = 0; start < permutation.length; start += 1) {
    if (seen[start]) continue;
    let length = 0;
    for (let at = start; !seen[at]; at = permutation[at]!) {
      seen[at] = true;
      length += 1;
    }
    transpositions += length - 1;
  }
  return (transpositions % 2) as 0 | 1;
}

/**
 * `parity(corners) XOR parity(edges)` — the quantity the classic decomposition
 * makes phase 1 fix. Here it is *not* invariant, so it is only a diagnostic.
 */
export function combinedParity(coordinate: Phase2Coordinate): 0 | 1 {
  return ((permutationParityOfIndex(coordinate.corners) ^
    permutationParityOfIndex(coordinate.edges)) %
    2) as 0 | 1;
}

/** Every piece id, for tests and for the table builder's canonical states. */
export function canonicalPhase2State(alignment: number): Square1State {
  return fromPhase2Coordinate({
    alignment,
    middleFlipped: false,
    corners: 0,
    edges: 0,
  });
}
