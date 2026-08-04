/**
 * Internal-only geometric derivation of the 3x3x3 move tables. Not part of
 * the public API (not exported from `index.ts`).
 *
 * Corners and edges are modelled as points on the cube's 8 corner/12 edge
 * coordinates, `x,y,z ∈ {-1,0,1}` (Right/Up/Front positive). Each of the six
 * base face turns is a 90° rotation about one coordinate axis; rather than
 * hand-deriving each move's resulting piece-cycle and orientation-twist
 * tables from memory (an easy place to get a sign or direction backwards —
 * this was cross-checked against physical "clock face" reasoning during
 * development, and the two independently disagreed on a first pass), the
 * rotation matrices are applied programmatically to both position vectors
 * and per-piece orientation reference vectors, so the tables in
 * `move-tables.ts` are derived by computation rather than transcription.
 * `move-tables.ts`'s test suite then cross-checks the result against
 * mathematical invariants of the cube group (order-4 per move, known
 * commutator orders, parity/orientation-sum conservation) that hold for any
 * correct model, independent of this file's own reasoning.
 */

import type { Face } from '../../notation/move';

export type Vec3 = readonly [number, number, number];

export const CORNER_POSITIONS: readonly Vec3[] = [
  [1, 1, 1], // 0 URF
  [-1, 1, 1], // 1 UFL
  [-1, 1, -1], // 2 ULB
  [1, 1, -1], // 3 UBR
  [1, -1, 1], // 4 DFR
  [-1, -1, 1], // 5 DLF
  [-1, -1, -1], // 6 DBL
  [1, -1, -1], // 7 DRB
];

export const EDGE_POSITIONS: readonly Vec3[] = [
  [1, 1, 0], // 0 UR
  [0, 1, 1], // 1 UF
  [-1, 1, 0], // 2 UL
  [0, 1, -1], // 3 UB
  [1, -1, 0], // 4 DR
  [0, -1, 1], // 5 DF
  [-1, -1, 0], // 6 DL
  [0, -1, -1], // 7 DB
  [1, 0, 1], // 8 FR
  [-1, 0, 1], // 9 FL
  [-1, 0, -1], // 10 BL
  [1, 0, -1], // 11 BR
];

/**
 * The face turn as a 90° rotation of position vectors, in the WCA sense
 * (clockwise viewed with that face turned toward the viewer). Derived once
 * per axis from the standard right-hand-rule rotation matrices, using the
 * fact that "clockwise viewed from the positive end of an axis looking
 * toward the origin" is always the negative-angle rotation in the
 * right-hand convention, and its mirror (negative end of the axis) is
 * always the positive-angle rotation — applied uniformly to all six faces
 * rather than re-derived ad hoc per face.
 */
const ROTATIONS: Record<Face, (v: Vec3) => Vec3> = {
  U: ([x, y, z]) => [-z, y, x],
  D: ([x, y, z]) => [z, y, -x],
  F: ([x, y, z]) => [y, -x, z],
  B: ([x, y, z]) => [-y, x, z],
  R: ([x, y, z]) => [x, z, -y],
  L: ([x, y, z]) => [x, -z, y],
};

function vecEquals(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/**
 * A face turn only physically moves pieces actually on that face's layer —
 * everything else must be an untouched fixed point. The rotation matrices
 * above describe rotating the *entire* space about an axis, so applying one
 * unconditionally to every position (rather than gating on this) would
 * incorrectly "rotate" pieces the move never touches, e.g. treating a U turn
 * as also moving D-layer corners. `axisIndex`/`requiredValue` identify which
 * coordinate must match for a piece to be on the turning layer.
 */
const LAYER_COORDINATE: Record<Face, { axisIndex: 0 | 1 | 2; requiredValue: 1 | -1 }> = {
  U: { axisIndex: 1, requiredValue: 1 },
  D: { axisIndex: 1, requiredValue: -1 },
  F: { axisIndex: 2, requiredValue: 1 },
  B: { axisIndex: 2, requiredValue: -1 },
  R: { axisIndex: 0, requiredValue: 1 },
  L: { axisIndex: 0, requiredValue: -1 },
};

function isOnLayer(face: Face, position: Vec3): boolean {
  const { axisIndex, requiredValue } = LAYER_COORDINATE[face];
  return position[axisIndex] === requiredValue;
}

function findIndex(positions: readonly Vec3[], target: Vec3): number {
  const index = positions.findIndex((p) => vecEquals(p, target));
  if (index === -1) {
    throw new Error(`geometry: no cube position matches vector [${target.join(',')}]`);
  }
  return index;
}

export interface BaseMoveTable {
  readonly face: Face;
  /** `cornerDestination[i]` = position the piece at corner position `i` moves to. */
  readonly cornerDestination: readonly number[];
  /** `cornerTwist[i]` = orientation delta (mod 3) applied to the piece that started at corner position `i`. */
  readonly cornerTwist: readonly number[];
  /** `edgeDestination[i]` = position the piece at edge position `i` moves to. */
  readonly edgeDestination: readonly number[];
  /** `edgeFlip[i]` = orientation delta (mod 2) applied to the piece that started at edge position `i`. */
  readonly edgeFlip: readonly number[];
}

/**
 * Corner orientation: `o = 0` means the corner's Y-facelet (the one that is
 * U/D-colored when solved) points along the Y axis. `o = 1`/`o = 2` track it
 * pointing along the corner's other two axes instead, walked in a fixed
 * cyclic order. That order must flip with the corner's chirality
 * (`x*y*z`) — otherwise two corners on opposite space diagonals would use
 * inconsistent orientation numbering and the group invariants (e.g. total
 * twist ≡ 0 mod 3 on any reachable state) would silently break. This is the
 * standard resolution for this well-known modelling subtlety.
 */
function cornerCyclicAxes(position: Vec3): readonly ['Y', 'X', 'Z'] | readonly ['Y', 'Z', 'X'] {
  const chirality = position[0] * position[1] * position[2];
  return chirality === 1 ? (['Y', 'X', 'Z'] as const) : (['Y', 'Z', 'X'] as const);
}

function axisVector(position: Vec3, axis: 'X' | 'Y' | 'Z'): Vec3 {
  if (axis === 'X') return [position[0], 0, 0];
  if (axis === 'Y') return [0, position[1], 0];
  return [0, 0, position[2]];
}

function deriveCornerTable(face: Face): { destination: number[]; twist: number[] } {
  const rotate = ROTATIONS[face];
  const destination: number[] = [];
  const twist: number[] = [];
  for (let i = 0; i < CORNER_POSITIONS.length; i += 1) {
    const from = CORNER_POSITIONS[i]!;
    if (!isOnLayer(face, from)) {
      destination[i] = i;
      twist[i] = 0;
      continue;
    }
    const to = rotate(from);
    const j = findIndex(CORNER_POSITIONS, to);
    destination[i] = j;

    const fromAxes = cornerCyclicAxes(from);
    const toAxes = cornerCyclicAxes(to);
    const referenceO0 = axisVector(from, fromAxes[0]);
    const transformed = rotate(referenceO0);

    let matched: number | null = null;
    for (let o = 0; o < 3; o += 1) {
      const expected = axisVector(to, toAxes[o]!);
      if (vecEquals(transformed, expected)) {
        matched = o;
        break;
      }
    }
    if (matched === null) {
      throw new Error(
        `geometry: ${face} produced an inconsistent corner orientation for position ${i}`,
      );
    }
    twist[i] = matched;
  }
  return { destination, twist };
}

/**
 * Edge orientation flips exactly for F and B turns, for every edge they
 * affect, and never for U/D/L/R — the standard, well-established
 * classification of edge-orientation-preserving vs. -reversing face turns.
 * Encoded directly rather than derived from a per-position "primary axis"
 * reference (unlike corners, edges only ever have 2 orientation states and
 * this classification is unambiguous), and cross-checked by the same
 * group-invariant test suite as the corner tables.
 */
function deriveEdgeTable(face: Face): { destination: number[]; flip: number[] } {
  const rotate = ROTATIONS[face];
  const destination: number[] = [];
  const flip: number[] = [];
  const flips = face === 'F' || face === 'B';
  for (let i = 0; i < EDGE_POSITIONS.length; i += 1) {
    const from = EDGE_POSITIONS[i]!;
    if (!isOnLayer(face, from)) {
      destination[i] = i;
      flip[i] = 0;
      continue;
    }
    const to = rotate(from);
    destination[i] = findIndex(EDGE_POSITIONS, to);
    flip[i] = flips ? 1 : 0;
  }
  return { destination, flip };
}

export function deriveBaseMoveTable(face: Face): BaseMoveTable {
  const corners = deriveCornerTable(face);
  const edges = deriveEdgeTable(face);
  return {
    face,
    cornerDestination: corners.destination,
    cornerTwist: corners.twist,
    edgeDestination: edges.destination,
    edgeFlip: edges.flip,
  };
}
