/**
 * Subsets of the 24 slots, as bit masks with a dense rank — the shape every
 * 4x4x4 phase coordinate takes.
 *
 * Phase 1 asks which 8 of the 24 centre slots hold a colour pair; phase 2 asks
 * which 12 of the 24 wing slots hold one wing orbit. Both are "a subset of fixed
 * size, permuted by the moves", so both want the same two operations: a
 * colexicographic rank to index a table with, and a fast way to push a mask
 * through a move.
 *
 * The rank is `sum of C(p, i)` over the set bits `p`, counted from one, taken in
 * ascending order. Nothing is skipped, so it indexes an array rather than merely
 * hashing.
 */

export const SLOT_COUNT = 24;

const BINOMIAL: readonly (readonly number[])[] = (() => {
  const table: number[][] = [];
  for (let n = 0; n <= SLOT_COUNT; n += 1) {
    const row = new Array<number>(SLOT_COUNT + 2).fill(0);
    row[0] = 1;
    for (let k = 1; k <= SLOT_COUNT + 1; k += 1) {
      row[k] = (table[n - 1]?.[k] ?? 0) + (table[n - 1]?.[k - 1] ?? 0);
    }
    table.push(row);
  }
  return table;
})();

/** `C(n, k)` for any `n` up to 24 — the centre coordinate asks for `C(8,4)`. */
export function binomial(n: number, k: number): number {
  return BINOMIAL[n]![k]!;
}

/** `C(24, size)` — how many subsets of the 24 slots there are of that size. */
export function subsetCount(size: number): number {
  return binomial(SLOT_COUNT, size);
}

export function rankSubset(mask: number, size: number): number {
  let rank = 0;
  let index = 1;
  // Only the set bits, lowest first: colex needs ascending order, and walking all
  // 24 slots instead cost the phase-1 table build three times over.
  for (let bits = mask; bits !== 0; bits &= bits - 1) {
    const slot = 31 - Math.clz32(bits & -bits);
    rank += BINOMIAL[slot]![index]!;
    index += 1;
  }
  if (index !== size + 1) {
    throw new Error(`444-subsets: expected a subset of ${size} slots, got ${index - 1}`);
  }
  return rank;
}

export function subsetFromRank(rank: number, size: number): number {
  let remaining = rank;
  let mask = 0;
  for (let index = size; index >= 1; index -= 1) {
    let slot = SLOT_COUNT - 1;
    while (BINOMIAL[slot]![index]! > remaining) slot -= 1;
    remaining -= BINOMIAL[slot]![index]!;
    mask |= 1 << slot;
  }
  return mask;
}

/**
 * Byte tables for pushing a 24-bit mask through a slot permutation.
 *
 * Bit by bit that is 24 operations, and a phase-2 table build does it a hundred
 * million times. Splitting the mask into three bytes and looking each one up
 * makes it three reads and two ors, for `3 x 256` precomputed entries per move.
 */
export function buildMaskPermuter(destination: readonly number[]): Int32Array {
  const lookup = new Int32Array(3 * 256);
  for (let chunk = 0; chunk < 3; chunk += 1) {
    for (let byte = 0; byte < 256; byte += 1) {
      let permuted = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        if ((byte & (1 << bit)) === 0) continue;
        permuted |= 1 << destination[chunk * 8 + bit]!;
      }
      lookup[chunk * 256 + byte] = permuted;
    }
  }
  return lookup;
}

export function permuteMask(mask: number, lookup: Int32Array): number {
  return (
    lookup[mask & 0xff]! |
    lookup[256 + ((mask >>> 8) & 0xff)]! |
    lookup[512 + ((mask >>> 16) & 0xff)]!
  );
}
