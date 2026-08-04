import { randomInt } from './random-int';
import type { RandomSource } from '../random/random-source';

/** A uniformly random permutation of `[0, n)`, via Fisher–Yates. */
export function randomPermutation(random: RandomSource, n: number): number[] {
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = randomInt(random, i + 1);
    const temp = perm[i]!;
    perm[i] = perm[j]!;
    perm[j] = temp;
  }
  return perm;
}

/**
 * `0` (even) or `1` (odd): the number of transpositions `perm` decomposes
 * into, mod 2 — via cycle decomposition (each cycle of length `k`
 * contributes `k - 1` transpositions), rather than counting inversions,
 * which is the same result in fewer operations for anything but tiny `n`.
 */
export function permutationParity(perm: readonly number[]): 0 | 1 {
  const visited = new Array<boolean>(perm.length).fill(false);
  let transpositions = 0;
  for (let i = 0; i < perm.length; i += 1) {
    if (visited[i]) continue;
    let cycleLength = 0;
    let j = i;
    while (!visited[j]) {
      visited[j] = true;
      j = perm[j]!;
      cycleLength += 1;
    }
    transpositions += cycleLength - 1;
  }
  return (transpositions % 2) as 0 | 1;
}

/**
 * Swaps two entries of `perm` in place, flipping its parity — used to
 * correct a randomly-drawn permutation into the parity a caller requires
 * (e.g. matching the cube's corner/edge parity constraint) without
 * re-drawing (which would bias the distribution toward permutations that
 * happen to need fewer redraws).
 */
export function swapToFlipParity(perm: number[]): void {
  if (perm.length < 2) return;
  const temp = perm[0]!;
  perm[0] = perm[1]!;
  perm[1] = temp;
}
