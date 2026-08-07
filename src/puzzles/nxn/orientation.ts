import type { Face } from '../../notation/move';
import { FACES } from '../../notation/move';
import type { RandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { scrambleTokensToString, type WideMove } from './notation';
import {
  applyWideMoves,
  isUniformlyColouredNxN,
  modelForSize,
  solvedCubeNxN,
  type CubeNxNState,
} from './state';

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
 * ## Even cubes get a rotation, not a wide move
 *
 * An even cube has no fixed centre, so its orientation genuinely is not a
 * property of its state — `docs/444-design.md` §11 works that through and the
 * argument still stands. This module used to conclude from that that `444bf`
 * needed no suffix at all, and **threw** if asked for one.
 *
 * TNoodle disagrees, and reading how it disagrees is what settled it.
 * `NoInspectionFourByFourCubePuzzle` calls `getRandomOrientationMoves(size - 1)`
 * — and at that thickness `CubeMove.toString` stops spelling a wide move and
 * starts spelling a **rotation**: `x`, `y`, `z`. So the official program does
 * not pretend an even cube's orientation is observable. It appends a pure
 * whole-cube rotation, which changes nothing about the state and everything
 * about how the competitor is told to pick the puzzle up. That is a
 * presentation instruction, and 4b3a asks for exactly that.
 *
 * Two consequences worth naming:
 *
 * - The suffix cannot affect the 4b3 floor for an even cube, because a
 *   rotation preserves distance-to-solved exactly. It is still checked after
 *   the suffix, for the same reason `333bf` is: the check belongs on the thing
 *   handed to a competitor, not on an intermediate.
 * - The odd-cube trap does not apply here. The 16-of-24 failure is specific to
 *   an `Rw^a Fw^b` vocabulary; TNoodle's is `{∅, x, x2, x', z, z'} × {∅, y, y2,
 *   y'}`, which is "six choices of which face is up, times four turns about
 *   it" and genuinely reaches all 24. It is reproduced rather than searched
 *   for, and then verified.
 */

/**
 * The block depth an orientation suffix turns.
 *
 * For an **odd** cube: the shallowest block that reaches the middle layer, and
 * therefore the shallowest wide move that can reorient it — `Rw` on a 3x3x3,
 * `3Rw` on a 5x5x5. It carries the fixed centre with it, which is what makes
 * the reorientation observable.
 *
 * For an **even** cube: every layer, i.e. a pure rotation. Not "the shallowest
 * that works" — depths above halfway would also reorient — but the one the
 * official program uses, and the only one that reorients *without* also
 * turning something.
 */
export function orientationDepth(size: number): number {
  return size % 2 === 0 ? size : Math.ceil(size / 2);
}

/**
 * The moves used to build orientation suffixes.
 *
 * Odd cubes: one depth, all six faces, all three amounts. Even cubes: the same
 * depth rule, but only the three faces a rotation has a WCA spelling for
 * (`R`→`x`, `U`→`y`, `F`→`z`) — `L`, `D` and `B` at full depth are the same
 * three rotations written backwards, so including them would put two spellings
 * of one rotation in the vocabulary.
 */
export function orientationMoves(size: number): readonly WideMove[] {
  const depth = orientationDepth(size);
  const faces = size % 2 === 0 ? (['R', 'U', 'F'] as const) : FACES;
  const moves: WideMove[] = [];
  for (const face of faces) {
    for (const amount of [1, 2, 3] as const) moves.push({ face, depth, amount });
  }
  return moves;
}

/**
 * Which face's colour now sits on each face — the puzzle's orientation, read
 * straight off it.
 *
 * The two parities read it from different places because they have different
 * things to read. An **odd** cube has a fixed centre facelet per face, so the
 * orientation is legible even when the rest of the puzzle is scrambled — which
 * matters, because an odd suffix is a wide move and therefore turns the cube
 * as well as rotating it. An **even** cube has no such facelet, and its
 * suffixes are pure rotations applied to a solved cube, so the whole face
 * reads as one colour and that colour is the answer.
 *
 * Asking an even cube for its orientation while it is scrambled is a
 * programming error, not a question with a bad answer, so it throws.
 */
function orientationKey(state: CubeNxNState): string {
  const { facelets } = modelForSize(state.size);

  if (state.size % 2 === 0) {
    if (!isUniformlyColouredNxN(state)) {
      throw new Error(
        `nxn-orientation: an even cube (${state.size}) has no fixed centres, so its orientation is only readable while every face is one colour`,
      );
    }
    const colours = new Map<Face, Face>();
    for (let slot = 0; slot < state.occupant.length; slot += 1) {
      colours.set(facelets[slot]!.face, facelets[state.occupant[slot]!]!.face);
    }
    return FACES.map((face) => colours.get(face)!).join('');
  }

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
 * TNoodle's even-cube vocabulary, reproduced rather than searched for:
 * `{∅, x, x2, x', z, z'} × {∅, y, y2, y'}` — six choices of which face ends up
 * on top, times four turns about the vertical. Reproduced because matching the
 * official program token-for-token is the point of the task, and verified
 * below because "this construction reaches all 24" is exactly the kind of claim
 * the odd-cube case proved you cannot take on trust.
 */
function evenOrientationSuffixes(size: number): readonly (readonly WideMove[])[] {
  const depth = size;
  const upFaceMoves: readonly (WideMove | null)[] = [
    null,
    { face: 'R', depth, amount: 1 },
    { face: 'R', depth, amount: 2 },
    { face: 'R', depth, amount: 3 },
    { face: 'F', depth, amount: 1 },
    { face: 'F', depth, amount: 3 },
  ];
  const spinMoves: readonly (WideMove | null)[] = [
    null,
    { face: 'U', depth, amount: 1 },
    { face: 'U', depth, amount: 2 },
    { face: 'U', depth, amount: 3 },
  ];

  const suffixes: (readonly WideMove[])[] = [];
  for (const up of upFaceMoves) {
    for (const spin of spinMoves) {
      suffixes.push([up, spin].filter((move): move is WideMove => move !== null));
    }
  }
  return suffixes;
}

/**
 * One suffix per cube orientation — 24 of them. Odd cubes search for the
 * shortest wide-move representative of each; even cubes take TNoodle's
 * rotation vocabulary. Either way the result is checked to be 24 *distinct*
 * orientations before it is returned, because 4b3a's "equal probability for
 * each orientation" is a claim about completeness, not about intent.
 */
export function orientationSuffixes(size: number): readonly (readonly WideMove[])[] {
  const cached = cache.get(size);
  if (cached) return cached;

  if (size % 2 === 0) {
    const suffixes = evenOrientationSuffixes(size);
    const solved = solvedCubeNxN(size);
    const reached = new Set(suffixes.map((s) => orientationKey(applyWideMoves(solved, s))));
    if (reached.size !== CUBE_ORIENTATION_COUNT) {
      throw new Error(
        `nxn-orientation: the size-${size} vocabulary reaches ${reached.size} orientations, expected ${CUBE_ORIENTATION_COUNT}`,
      );
    }
    cache.set(size, suffixes);
    return suffixes;
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
  return scrambleTokensToString(suffixes[randomInt(random, suffixes.length)]!, size);
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
