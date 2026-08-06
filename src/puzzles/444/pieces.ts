import { FACES, type Face } from '../../notation/move';
import { vecKey, type Vec3 } from '../../utils/vec3';
import { CORNER_POSITIONS, EDGE_POSITIONS } from '../333/geometry';
import { buildFacelets, deriveFaceletPermutation, type Facelet } from '../nxn/geometry';
import { allMovesForSize } from '../nxn/notation';

/**
 * The 4x4x4's pieces, and which facelets belong to each — **derived from the
 * geometry**, never tabulated by hand.
 *
 * `puzzles/nxn/` already models a cube as facelets on an exact integer lattice,
 * with each facelet carrying its cubie centre plus its outward normal. That is
 * everything needed to recover the pieces: two facelets belong to the same
 * physical piece exactly when `position - normal` — the **cubie** — is the same
 * for both. Counting the facelets on a cubie then classifies it:
 *
 * | facelets | piece | count |
 * |---|---|---|
 * | 3 | corner | 8 |
 * | 2 | wing (an edge piece) | 24 |
 * | 1 | centre | 24 |
 *
 * A 4x4x4 has no piece with more than three and none with none, so the
 * classification is complete by construction rather than by a case list.
 *
 * ## Orderings, and why they are the 3x3x3's
 *
 * Phase 4 of the solver finishes a reduced 4x4x4 with the existing 3x3x3
 * solver, so the piece orderings here are chosen to line up with that model
 * rather than to be locally convenient:
 *
 * - **Corners** are indexed by `333/geometry.ts`'s `CORNER_POSITIONS`: a 4x4x4
 *   corner cubie sits at `3 x (+-1, +-1, +-1)`, whose sign vector *is* the
 *   3x3x3 corner position.
 * - **Wings** come in pairs on each 3x3x3 edge. Wing `2e` and `2e + 1` are the
 *   two wings of `EDGE_POSITIONS[e]`, ordered so that the one whose odd
 *   coordinate is positive comes first. *Which* of a wing's two facelets is
 *   listed first is **propagated**, not chosen — see `orderWingFacelets`.
 * - **Centres** are `4f + k` for face `f` in `FACES` order, with `k` fixed by
 *   the signs of the two in-face coordinates (see `centreIndexWithinFace`).
 *
 * ## Corner orientation
 *
 * Each corner has exactly one facelet on U or D, which is the reference. The
 * other two are ordered so that the triple runs the same rotational way round
 * every corner — otherwise "twist by one" would mean opposite things on
 * opposite corners and the usual `sum = 0 mod 3` invariant would not hold.
 * `cornerFacelets` builds that order from the cubie's chirality, and
 * `state.test.ts` checks the invariant rather than trusting the rule.
 */

export const SIZE_444 = 4;
export const CORNER_COUNT_444 = 8;
export const WING_COUNT_444 = 24;
export const CENTRE_COUNT_444 = 24;
export const FACELET_COUNT_444 = 6 * SIZE_444 * SIZE_444;

/** A cubie centre: the facelet's position with its outward normal taken back off. */
function cubieOf(facelet: Facelet): Vec3 {
  return [
    facelet.position[0] - facelet.normal[0],
    facelet.position[1] - facelet.normal[1],
    facelet.position[2] - facelet.normal[2],
  ];
}

export interface Pieces444 {
  readonly facelets: readonly Facelet[];
  /** Three facelet ids per corner, in a consistently-rotating order, U/D first. */
  readonly cornerFacelets: readonly (readonly number[])[];
  /** Two facelet ids per wing. */
  readonly wingFacelets: readonly (readonly number[])[];
  /** One facelet id per centre. */
  readonly centreFacelets: readonly number[];
  /** Which face each centre slot belongs to, as an index into `FACES`. */
  readonly centreFace: readonly number[];
}

let cached: Pieces444 | undefined;

/**
 * `k` for a centre on face `f`: the two coordinates that are not the face's own
 * axis, each `+-1`, read in axis order `x, y, z` with the face's axis skipped,
 * positive before negative.
 */
function centreIndexWithinFace(cubie: Vec3, faceAxis: number): number {
  const others = [0, 1, 2].filter((axis) => axis !== faceAxis);
  return others.reduce((index, axis) => index * 2 + (cubie[axis]! > 0 ? 0 : 1), 0);
}

function signVector(cubie: Vec3): Vec3 {
  return [Math.sign(cubie[0]), Math.sign(cubie[1]), Math.sign(cubie[2])];
}

function indexOfVector(table: readonly Vec3[], vector: Vec3): number {
  const index = table.findIndex((candidate) => vecKey(candidate) === vecKey(vector));
  if (index < 0) throw new Error(`444-pieces: no entry for ${vecKey(vector)}`);
  return index;
}

export function pieces444(): Pieces444 {
  if (cached) return cached;

  const facelets = buildFacelets(SIZE_444);
  const byCubie = new Map<string, number[]>();
  for (const [id, facelet] of facelets.entries()) {
    const key = vecKey(cubieOf(facelet));
    const group = byCubie.get(key);
    if (group) group.push(id);
    else byCubie.set(key, [id]);
  }

  const cornerFacelets: number[][] = Array.from({ length: CORNER_COUNT_444 }, () => []);
  const wingFacelets: number[][] = Array.from({ length: WING_COUNT_444 }, () => []);
  const centreFacelets = new Array<number>(CENTRE_COUNT_444).fill(-1);
  const centreFace = new Array<number>(CENTRE_COUNT_444).fill(-1);

  for (const ids of byCubie.values()) {
    const cubie = cubieOf(facelets[ids[0]!]!);

    if (ids.length === 3) {
      cornerFacelets[indexOfVector(CORNER_POSITIONS, signVector(cubie))] = orderCornerFacelets(
        facelets,
        ids,
        cubie,
      );
      continue;
    }

    if (ids.length === 2) {
      // Two coordinates at +-3 and one at +-1: zeroing the odd one out gives the
      // 3x3x3 edge this pair of wings sits on.
      const oddAxis = [0, 1, 2].find((axis) => Math.abs(cubie[axis]!) === 1)!;
      const signs = signVector(cubie);
      const edgeVector: Vec3 = [
        oddAxis === 0 ? 0 : signs[0],
        oddAxis === 1 ? 0 : signs[1],
        oddAxis === 2 ? 0 : signs[2],
      ];
      const edge = indexOfVector(EDGE_POSITIONS, edgeVector);
      wingFacelets[2 * edge + (cubie[oddAxis]! > 0 ? 0 : 1)] = [...ids];
      continue;
    }

    const id = ids[0]!;
    const faceAxis = [0, 1, 2].find((axis) => Math.abs(cubie[axis]!) === SIZE_444 - 1)!;
    const face = FACES.indexOf(facelets[id]!.face);
    const slot = 4 * face + centreIndexWithinFace(cubie, faceAxis);
    centreFacelets[slot] = id;
    centreFace[slot] = face;
  }

  orderWingFacelets(facelets, wingFacelets);

  const complete =
    cornerFacelets.every((c) => c.length === 3) &&
    wingFacelets.every((w) => w.length === 2) &&
    centreFacelets.every((c) => c >= 0);
  if (!complete) {
    throw new Error('444-pieces: the geometry did not account for every piece');
  }

  cached = { facelets, cornerFacelets, wingFacelets, centreFacelets, centreFace };
  return cached;
}

/**
 * Puts each wing's two facelets in an order that the moves *preserve*.
 *
 * This cannot be chosen: a wing's two facelets sit on two different faces, and
 * which face is "first" changes as the piece travels, so any local rule — lower
 * facelet id, lower normal axis — is inconsistent somewhere. Sorting by id was
 * the first attempt, and the oracle rejected it on 16 of the 36 moves.
 *
 * So the order is *propagated*: fix one wing's order arbitrarily, then push it
 * along the moves' facelet permutations, breadth first. Whenever a slot is
 * reached a second time the two answers must agree — and they do, which is the
 * computational statement of the fact that a 4x4x4 wing cannot flip. If they
 * ever disagreed, that would be the model saying so rather than a test noticing
 * a wrong colour later.
 */
function orderWingFacelets(facelets: readonly Facelet[], wings: number[][]): void {
  const slotOfFacelet = new Map<number, number>();
  wings.forEach((ids, slot) => ids.forEach((id) => slotOfFacelet.set(id, slot)));

  const permutations = allMovesForSize(SIZE_444).map((move) =>
    deriveFaceletPermutation(facelets, move, SIZE_444),
  );

  const first = new Array<number>(wings.length).fill(-1);
  first[0] = wings[0]![0]!;
  const queue = [0];

  for (let head = 0; head < queue.length; head += 1) {
    const slot = queue[head]!;
    for (const destination of permutations) {
      const landedFirst = destination[first[slot]!]!;
      const landedSlot = slotOfFacelet.get(landedFirst)!;
      if (first[landedSlot] === -1) {
        first[landedSlot] = landedFirst;
        queue.push(landedSlot);
        continue;
      }
      if (first[landedSlot] !== landedFirst) {
        throw new Error(
          `444-pieces: wing ${landedSlot} would have to flip — the propagated order is inconsistent`,
        );
      }
    }
  }

  if (first.some((id) => id === -1)) {
    throw new Error('444-pieces: the moves do not reach every wing');
  }

  wings.forEach((ids, slot) => {
    const lead = first[slot]!;
    wings[slot] = [lead, ids.find((id) => id !== lead)!];
  });
}

/**
 * A corner's three facelets, U/D first and the other two in an order that runs
 * the same rotational way round every corner.
 *
 * The chirality rule: after the U/D facelet, take the remaining two axes in the
 * order `x` then `z` when the product of the cubie's signs is positive, and `z`
 * then `x` when it is negative. That flip is what keeps the cycle consistent —
 * mirror-image corners would otherwise be read in opposite senses.
 */
function orderCornerFacelets(
  facelets: readonly Facelet[],
  ids: readonly number[],
  cubie: Vec3,
): number[] {
  const byAxis = new Map<number, number>();
  for (const id of ids) {
    const axis = facelets[id]!.normal.findIndex((component) => component !== 0);
    byAxis.set(axis, id);
  }
  const chirality = Math.sign(cubie[0]! * cubie[1]! * cubie[2]!);
  const order = chirality > 0 ? [1, 0, 2] : [1, 2, 0];
  return order.map((axis) => byAxis.get(axis)!);
}

/** Which of `FACES` a facelet wears when solved. */
export function faceIndexOfFacelet(id: number): number {
  return FACES.indexOf(pieces444().facelets[id]!.face);
}

export type { Face };
