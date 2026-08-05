import type { Face } from '../../notation/move';
import { FACES } from '../../notation/move';
import type { RandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { wideMovesToString, type WideMove } from './notation';
import { applyWideMoves, modelForSize, solvedCubeNxN, type CubeNxNState } from './state';

/**
 * Random puzzle orientation, for the blindfolded events.
 *
 * WCA Regulation 4b3a:
 *
 * > For blindfolded events, the scramble sequence must orient the puzzle
 * > randomly (equal probability for each orientation).
 *
 * This is why a blindfolded event is **not** simply an alias for its sighted
 * counterpart. An ordinary 3x3x3 scramble is all single-layer face turns,
 * which never move a centre — so it always leaves the cube in the same
 * orientation it started in, white up and green front. For a sighted solve
 * that's irrelevant; for a blindfolded one the starting orientation is part of
 * the memorisation, and always being the same would be a real advantage.
 *
 * ## How the orientation is expressed
 *
 * Scramble notation has no `x`/`y`/`z` rotations, so the orientation has to be
 * carried by *wide* moves — which is exactly why official 3BLD scrambles end
 * with tokens like `Rw2 Fw'`. A wide move is a rotation of the whole puzzle
 * composed with an ordinary turn, so appending one both reorients the cube and
 * turns it a bit more. Both halves are harmless: the extra turning is applied
 * to an already-uniform random state, which stays uniform, and the rotation
 * half is what 4b3a asks for.
 *
 * ## Why the suffixes are searched for rather than written down
 *
 * The obvious construction — some `Rw^a Fw^b` — cannot work: `Rw` and `Fw`
 * contribute rotations about two different axes, and `x^a z^b` over
 * `a, b ∈ 0..3` is only 16 distinct rotations out of 24. Rather than guess a
 * vocabulary that covers all 24, this searches short sequences and keeps one
 * shortest representative per orientation, then checks it found exactly 24.
 * The result is a genuinely uniform draw over orientations, which is the part
 * the regulation is specific about.
 *
 * Only odd cube sizes are supported, and that is not an omission: an even cube
 * has no fixed centres, so its orientation is not a property of the puzzle's
 * state at all.
 */

/**
 * The shallowest block depth that reaches a cube's middle layer, and therefore
 * the shallowest wide move that can reorient it. `Rw` on a 3x3x3, `3Rw` on a
 * 5x5x5.
 */
export function orientationDepth(size: number): number {
  return Math.ceil(size / 2);
}

/** The wide moves used to build orientation suffixes: one depth, all six faces, all three amounts. */
export function orientationMoves(size: number): readonly WideMove[] {
  const depth = orientationDepth(size);
  const moves: WideMove[] = [];
  for (const face of FACES) {
    for (const amount of [1, 2, 3] as const) moves.push({ face, depth, amount });
  }
  return moves;
}

/**
 * Which face's centre facelet now sits in each face's centre slot — the
 * orientation of an odd cube, read straight off the puzzle.
 */
function orientationKey(state: CubeNxNState): string {
  const { facelets } = modelForSize(state.size);
  const centres: string[] = [];
  for (const face of FACES) {
    const slot = facelets.findIndex(
      (f) => f.face === face && f.position.every((c, i) => c === f.normal[i]! * state.size || c === 0),
    );
    centres.push(facelets[state.occupant[slot]!]!.face);
  }
  return centres.join('');
}

const CUBE_ORIENTATION_COUNT = 24;

const cache = new Map<number, readonly (readonly WideMove[])[]>();

/**
 * One shortest wide-move suffix per cube orientation — 24 of them, found by
 * breadth-first search from the empty suffix.
 */
export function orientationSuffixes(size: number): readonly (readonly WideMove[])[] {
  const cached = cache.get(size);
  if (cached) return cached;

  if (size % 2 === 0) {
    throw new Error(
      `nxn-orientation: an even cube (${size}) has no fixed centres, so it has no observable orientation`,
    );
  }

  const moves = orientationMoves(size);
  const byOrientation = new Map<string, readonly WideMove[]>();
  const solved = solvedCubeNxN(size);
  byOrientation.set(orientationKey(solved), []);

  let frontier: (readonly WideMove[])[] = [[]];
  while (frontier.length > 0 && byOrientation.size < CUBE_ORIENTATION_COUNT) {
    const next: (readonly WideMove[])[] = [];
    for (const prefix of frontier) {
      for (const move of moves) {
        // Two consecutive moves of the same face would merge.
        if (prefix.length > 0 && prefix[prefix.length - 1]!.face === move.face) continue;
        const suffix = [...prefix, move];
        const key = orientationKey(applyWideMoves(solved, suffix));
        if (byOrientation.has(key)) continue;
        byOrientation.set(key, suffix);
        next.push(suffix);
      }
    }
    frontier = next;
  }

  if (byOrientation.size !== CUBE_ORIENTATION_COUNT) {
    throw new Error(
      `nxn-orientation: found ${byOrientation.size} orientations for size ${size}, expected ${CUBE_ORIENTATION_COUNT}`,
    );
  }

  const suffixes = [...byOrientation.values()];
  cache.set(size, suffixes);
  return suffixes;
}

/** A uniformly random one of the 24 orientation suffixes, rendered ready to append. */
export function randomOrientationSuffix(random: RandomSource, size: number): string {
  const suffixes = orientationSuffixes(size);
  return wideMovesToString(suffixes[randomInt(random, suffixes.length)]!);
}

/**
 * Appends a random orientation to a scramble — the blindfolded-event wrapper.
 * The identity orientation contributes no tokens, so one scramble in 24 comes
 * back unchanged, which is correct rather than a missing suffix.
 */
export function withRandomOrientation(
  scramble: string,
  random: RandomSource,
  size: number,
): string {
  const suffix = randomOrientationSuffix(random, size);
  return suffix.length === 0 ? scramble : `${scramble} ${suffix}`;
}

export { orientationKey, CUBE_ORIENTATION_COUNT, type Face };
