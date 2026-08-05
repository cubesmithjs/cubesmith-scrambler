/**
 * Internal-only geometric derivation of the Skewb turn tables.
 *
 * ## The mechanic
 *
 * A Skewb is *corner*-turning and deep-cut: its four cuts are the planes
 * through the puzzle's center perpendicular to the four body diagonals, so
 * every turn rotates exactly half the puzzle by 120° about one diagonal.
 * Working in cube coordinates `x,y,z ∈ {-1,1}` for corners and `(±1,0,0)`
 * &c. for face centers, "the moving half of the turn about corner `c`" is
 * simply every piece `p` with `p·c > 0` — which picks out `c` itself
 * (`p·c = 3`), its three neighbours (`= 1`), and three of the six centers
 * (`= 1`), and excludes the antipodal four corners and three centers
 * (`= -1` or `-3`). No coordinate ever leaves the integer lattice, so piece
 * lookup is exact equality (see `utils/vec3.ts`).
 *
 * The corner on the axis does not go anywhere — it twists in place — and
 * that falls out of the same rotation rather than needing a special case.
 *
 * ## Which four corners the moves turn, and why it matters
 *
 * WCA Fixed Corner Notation holds one corner still. `U`/`R`/`L`/`B` are the
 * four corners whose moving half *excludes* the held one, so no move
 * disturbs it at all — not even a twist. Concretely, holding the corner
 * with white up and green front-left means holding `(1,1,1)`, and the four
 * turnable corners are the remaining four that are not adjacent to it.
 *
 * Those four are one per body diagonal, which is what makes them a complete
 * generating set: every Skewb turn is about *some* diagonal, and turning the
 * other half of a diagonal differs only by a rotation of the whole puzzle.
 * This is the exact analogue of restricting 2x2x2 to U/R/F — with no fixed
 * centers to define an absolute frame, one piece has to be nominated as the
 * frame, and here that nomination is part of the official notation.
 *
 * The `(1,1,1)` assignment is derived in `geometry.test.ts` from the WCA
 * holding position (white face up, green face front-left, viewer looking
 * along the `(1,0,1)` direction so that three faces are visible) rather
 * than asserted here, and the resulting corner labels are checked against
 * the WCA descriptions — `U` top-back, `R` bottom-right, `L` bottom-left,
 * `B` bottom-back.
 */

import {
  rotate120,
  vecDot,
  vecEquals,
  type Vec3,
} from '../../utils/vec3';
import { SKEWB_CORNERS, type SkewbCorner } from './notation';

/**
 * All eight cube corners. Index 0 is the held corner: it is deliberately
 * first so that "corner 0 never moves and never twists" is visible in every
 * permutation and orientation array in this module.
 */
export const CORNER_POSITIONS_SKEWB: readonly Vec3[] = [
  [1, 1, 1], //  0 — the held corner (white up, green front-left)
  [1, 1, -1], //  1
  [1, -1, 1], //  2
  [-1, 1, 1], //  3
  [1, -1, -1], //  4 — R
  [-1, 1, -1], //  5 — U
  [-1, -1, 1], //  6 — L
  [-1, -1, -1], // 7 — B
];

export const CORNER_COUNT_SKEWB = CORNER_POSITIONS_SKEWB.length; // 8

/** The six face centers, each a single sticker — so they permute but have no orientation. */
export const CENTER_POSITIONS_SKEWB: readonly Vec3[] = [
  [1, 0, 0], //  0 +x  (front-right in the WCA holding)
  [-1, 0, 0], // 1 -x
  [0, 1, 0], //  2 +y  (white / up)
  [0, -1, 0], // 3 -y
  [0, 0, 1], //  4 +z  (green / front-left)
  [0, 0, -1], // 5 -z
];

export const CENTER_COUNT_SKEWB = CENTER_POSITIONS_SKEWB.length; // 6

/** The cube corner each notation letter turns about. */
export const TURN_AXIS: Readonly<Record<SkewbCorner, Vec3>> = {
  U: [-1, 1, -1],
  R: [1, -1, -1],
  L: [-1, -1, 1],
  B: [-1, -1, -1],
};

/** Index 0 in `CORNER_POSITIONS_SKEWB` — the corner FCN holds still. */
export const HELD_CORNER_INDEX = 0;

function cornerIndexAt(position: Vec3): number {
  const index = CORNER_POSITIONS_SKEWB.findIndex((p) => vecEquals(p, position));
  if (index === -1) throw new Error(`skewb-geometry: no corner at [${position.join(',')}]`);
  return index;
}

function centerIndexAt(position: Vec3): number {
  const index = CENTER_POSITIONS_SKEWB.findIndex((p) => vecEquals(p, position));
  if (index === -1) throw new Error(`skewb-geometry: no center at [${position.join(',')}]`);
  return index;
}

/**
 * The three sticker normals of the corner at `position`, in the cyclic
 * order that *defines* orientation there: `0` is the y-axis sticker (the
 * up/down-colored one when solved, the same reference 3x3x3 corner
 * orientation uses), and `1`/`2` follow it under the right-hand-rule 120°
 * rotation about that corner's own diagonal.
 *
 * Deriving the cycle from the rotation itself — rather than writing down an
 * axis order per corner — is what makes it automatically consistent with
 * the corner's chirality. `puzzles/333/geometry.ts` documents the same
 * subtlety and resolves it by flipping a hand-written axis order on
 * `x*y*z`; doing it this way there is no order to get backwards.
 */
function orientationCycle(position: Vec3): readonly [Vec3, Vec3, Vec3] {
  const first: Vec3 = [0, position[1], 0];
  const second = rotate120(position, first, 1);
  const third = rotate120(position, second, 1);
  return [first, second, third];
}

const CORNER_ORIENTATION_CYCLES: readonly (readonly [Vec3, Vec3, Vec3])[] =
  CORNER_POSITIONS_SKEWB.map(orientationCycle);

export interface SkewbTurnTable {
  readonly corner: SkewbCorner;
  /** `cornerDestination[i]` = corner slot the piece at slot `i` moves to. */
  readonly cornerDestination: readonly number[];
  /** `cornerTwist[i]` = orientation delta (mod 3) applied to the piece starting at corner slot `i`. */
  readonly cornerTwist: readonly number[];
  /** `centerDestination[i]` = center slot the piece at slot `i` moves to. */
  readonly centerDestination: readonly number[];
}

/** The clockwise turn about the corner `corner` names. */
export function deriveTurnTableSkewb(corner: SkewbCorner): SkewbTurnTable {
  const axis = TURN_AXIS[corner];
  const cornerDestination: number[] = [];
  const cornerTwist: number[] = [];
  const centerDestination: number[] = [];

  for (let i = 0; i < CORNER_COUNT_SKEWB; i += 1) {
    const from = CORNER_POSITIONS_SKEWB[i]!;
    if (vecDot(from, axis) < 0) {
      cornerDestination[i] = i;
      cornerTwist[i] = 0;
      continue;
    }
    const to = rotate120(axis, from, -1);
    const destination = cornerIndexAt(to);
    cornerDestination[i] = destination;

    const carried = rotate120(axis, CORNER_ORIENTATION_CYCLES[i]![0], -1);
    const cycle = CORNER_ORIENTATION_CYCLES[destination]!;
    const twist = cycle.findIndex((normal) => vecEquals(normal, carried));
    if (twist === -1) {
      throw new Error(
        `skewb-geometry: ${corner} carried corner ${i}'s reference sticker onto a face that is not one of its own`,
      );
    }
    cornerTwist[i] = twist;
  }

  for (let i = 0; i < CENTER_COUNT_SKEWB; i += 1) {
    const from = CENTER_POSITIONS_SKEWB[i]!;
    centerDestination[i] =
      vecDot(from, axis) < 0 ? i : centerIndexAt(rotate120(axis, from, -1));
  }

  return { corner, cornerDestination, cornerTwist, centerDestination };
}

export const SKEWB_TURN_TABLES: Readonly<Record<SkewbCorner, SkewbTurnTable>> = Object.freeze(
  Object.fromEntries(SKEWB_CORNERS.map((c) => [c, deriveTurnTableSkewb(c)])) as Record<
    SkewbCorner,
    SkewbTurnTable
  >,
);
