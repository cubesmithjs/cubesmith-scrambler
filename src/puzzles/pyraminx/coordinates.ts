import { allPermutations } from '../../utils/permutation';
import { EDGE_COUNT_PYRAMINX, VERTEX_COUNT_PYRAMINX, type PyraminxState } from './state';

/**
 * Coordinates for the Pyraminx's non-trivial state: edge permutation, edge
 * orientation, and the four axial twists. Tips are deliberately absent —
 * nothing on the puzzle can observe a tip, so they're handled separately in
 * `solve.ts` rather than multiplying the search space by 81 for no
 * information.
 *
 * ## Why the *full* spaces are encoded, constraints and all
 *
 * Two constraints are known to hold on any reachable state: edge
 * permutation must be even (a layer turn 3-cycles edges, and a 3-cycle is
 * even) and total edge flip must be even. Rather than encoding only the
 * legal half of each — which would bake those claims into the coordinate
 * and make them unfalsifiable — this ranks all `6! = 720` permutations and
 * all `2^6 = 64` flip vectors. The pruning table's BFS then reaches exactly
 * `360 x 32 x 81 = 933,120` of the `720 x 64 x 81 = 3,732,480` encodable
 * combinations, which *proves* both constraints from the move tables alone
 * and independently reproduces the published Pyraminx state count. See
 * `pruning.test.ts`.
 */

const PERMUTATIONS_6 = allPermutations(EDGE_COUNT_PYRAMINX);
export const EDGE_PERM_PYRAMINX_STATES = PERMUTATIONS_6.length; // 720
export const EDGE_ORIENTATION_PYRAMINX_STATES = 2 ** EDGE_COUNT_PYRAMINX; // 64
export const AXIAL_PYRAMINX_STATES = 3 ** VERTEX_COUNT_PYRAMINX; // 81

const permutationIndex = new Map<string, number>(
  PERMUTATIONS_6.map((perm, index) => [perm.join(','), index]),
);

export function edgePermPyraminxCoord(edgePermutation: readonly number[]): number {
  const index = permutationIndex.get(edgePermutation.join(','));
  if (index === undefined) {
    throw new Error(
      `pyraminx-coordinates: [${edgePermutation.join(',')}] is not a permutation of the 6 edges`,
    );
  }
  return index;
}

export function decodeEdgePermPyraminxCoord(coord: number): number[] {
  const perm = PERMUTATIONS_6[coord];
  if (!perm) throw new Error(`pyraminx-coordinates: edge permutation coord ${coord} out of range`);
  return [...perm];
}

export function edgeOrientationPyraminxCoord(edgeOrientation: readonly number[]): number {
  let coord = 0;
  for (let i = 0; i < EDGE_COUNT_PYRAMINX; i += 1) {
    coord = coord * 2 + edgeOrientation[i]!;
  }
  return coord;
}

export function decodeEdgeOrientationPyraminxCoord(coord: number): number[] {
  const orientation = new Array<number>(EDGE_COUNT_PYRAMINX);
  let remaining = coord;
  for (let i = EDGE_COUNT_PYRAMINX - 1; i >= 0; i -= 1) {
    orientation[i] = remaining % 2;
    remaining = (remaining - orientation[i]!) / 2;
  }
  return orientation;
}

export function axialPyraminxCoord(axialOrientation: readonly number[]): number {
  let coord = 0;
  for (let i = 0; i < VERTEX_COUNT_PYRAMINX; i += 1) {
    coord = coord * 3 + axialOrientation[i]!;
  }
  return coord;
}

export function decodeAxialPyraminxCoord(coord: number): number[] {
  const orientation = new Array<number>(VERTEX_COUNT_PYRAMINX);
  let remaining = coord;
  for (let i = VERTEX_COUNT_PYRAMINX - 1; i >= 0; i -= 1) {
    orientation[i] = remaining % 3;
    remaining = (remaining - orientation[i]!) / 3;
  }
  return orientation;
}

export interface PyraminxCoordinate {
  readonly edgePerm: number;
  readonly edgeOrientation: number;
  readonly axial: number;
}

export function toPyraminxCoordinate(state: PyraminxState): PyraminxCoordinate {
  return {
    edgePerm: edgePermPyraminxCoord(state.edgePermutation),
    edgeOrientation: edgeOrientationPyraminxCoord(state.edgeOrientation),
    axial: axialPyraminxCoord(state.axialOrientation),
  };
}

/** The three coordinates flattened into one index, the layout both the pruning table and its BFS use. */
export function packPyraminxCoordinate(coordinate: PyraminxCoordinate): number {
  return (
    (coordinate.edgePerm * EDGE_ORIENTATION_PYRAMINX_STATES + coordinate.edgeOrientation) *
      AXIAL_PYRAMINX_STATES +
    coordinate.axial
  );
}

export const PYRAMINX_COORDINATE_STATES =
  EDGE_PERM_PYRAMINX_STATES * EDGE_ORIENTATION_PYRAMINX_STATES * AXIAL_PYRAMINX_STATES;

export function unpackPyraminxCoordinate(index: number): PyraminxCoordinate {
  const axial = index % AXIAL_PYRAMINX_STATES;
  const rest = (index - axial) / AXIAL_PYRAMINX_STATES;
  const edgeOrientation = rest % EDGE_ORIENTATION_PYRAMINX_STATES;
  const edgePerm = (rest - edgeOrientation) / EDGE_ORIENTATION_PYRAMINX_STATES;
  return { edgePerm, edgeOrientation, axial };
}

export const SOLVED_PYRAMINX_COORDINATE: PyraminxCoordinate = {
  edgePerm: edgePermPyraminxCoord([0, 1, 2, 3, 4, 5]),
  edgeOrientation: 0,
  axial: 0,
};

export function isSolvedPyraminxCoordinate(coordinate: PyraminxCoordinate): boolean {
  return (
    coordinate.edgePerm === SOLVED_PYRAMINX_COORDINATE.edgePerm &&
    coordinate.edgeOrientation === SOLVED_PYRAMINX_COORDINATE.edgeOrientation &&
    coordinate.axial === SOLVED_PYRAMINX_COORDINATE.axial
  );
}
