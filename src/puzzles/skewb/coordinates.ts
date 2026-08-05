import { allMovesSkewb, type SkewbMove } from './notation';
import { applySkewbMove, SOLVED_SKEWB_STATE, type SkewbState } from './state';

/**
 * Skewb coordinates, discovered rather than designed.
 *
 * The other puzzles here rank a closed-form coordinate — a permutation
 * index, a base-3 orientation digit string — and then let a BFS reveal which
 * of those encodable values are actually reachable. That works when the
 * encodable space is only a small multiple of the real one. On a Skewb it
 * isn't: the corner permutation alone has `8! = 40,320` encodable values of
 * which just **36** occur, so the closed-form product would be a 227 MB
 * table that is 99.999% holes.
 *
 * So each projection is instead built by breadth-first search from solved
 * over the projection itself, and the reachable values are *re-indexed*
 * densely. Nothing about the puzzle's constraints is stated or assumed
 * anywhere: the coordinate space is literally "what the derived move tables
 * can reach", and the sizes it lands on are then checked against published
 * facts in `coordinates.test.ts`.
 *
 * Two projections suffice, and the split is not arbitrary:
 *
 * - **corners** — permutation and twist *together*, 8,748 values. They have
 *   to be joint. Separately they span `36 x 2187 = 78,732` combinations, of
 *   which only an eighth-and-a-bit are real, because a Skewb's twists are
 *   partly determined by its permutation (each turn twists the corner it
 *   pivots about, so the net twist of a corner orbit is pinned to how many
 *   times the *other* orbit has been cycled). Ranking them jointly absorbs
 *   that coupling instead of leaving it as unreachable padding.
 * - **centers** — permutation only, 360 values. A center has one sticker
 *   and therefore no orientation.
 *
 * `8,748 x 360 = 3,149,280`, exactly the published number of Skewb
 * positions — and the pruning table's BFS then reaches every one of them,
 * which is what proves the two projections really are independent.
 */

export const ALL_MOVES_SKEWB: readonly SkewbMove[] = allMovesSkewb();
export const MOVE_COUNT_SKEWB = ALL_MOVES_SKEWB.length; // 8

interface Projection<T> {
  /** Dense index → the sub-state it stands for. */
  readonly values: readonly T[];
  /** `transition[move][index]` = the index reached by applying that move. */
  readonly transition: readonly (readonly number[])[];
  indexOf(value: T): number;
}

/**
 * Breadth-first closure of one projection of the state under the move set,
 * with the reachable values re-indexed densely. Because BFS starts at solved
 * and only follows real moves, `values` is exactly the reachable set — never
 * a superset that later needs filtering.
 */
function buildProjection<T>(
  solved: T,
  key: (value: T) => string,
  apply: (value: T, move: SkewbMove) => T,
): Projection<T> {
  const values: T[] = [solved];
  const indexByKey = new Map<string, number>([[key(solved), 0]]);

  for (let i = 0; i < values.length; i += 1) {
    for (const move of ALL_MOVES_SKEWB) {
      const next = apply(values[i]!, move);
      const nextKey = key(next);
      if (!indexByKey.has(nextKey)) {
        indexByKey.set(nextKey, values.length);
        values.push(next);
      }
    }
  }

  const transition = ALL_MOVES_SKEWB.map((move) =>
    values.map((value) => indexByKey.get(key(apply(value, move)))!),
  );

  return {
    values,
    transition,
    indexOf(value: T): number {
      const index = indexByKey.get(key(value));
      if (index === undefined) {
        throw new Error(`skewb-coordinates: ${key(value)} is not a reachable projection value`);
      }
      return index;
    },
  };
}

export interface SkewbCornerValue {
  readonly cornerPermutation: readonly number[];
  readonly cornerOrientation: readonly number[];
}

function cornerKey(value: SkewbCornerValue): string {
  return `${value.cornerPermutation.join(',')}|${value.cornerOrientation.join('')}`;
}

function applyToCorners(value: SkewbCornerValue, move: SkewbMove): SkewbCornerValue {
  const next = applySkewbMove({ ...SOLVED_SKEWB_STATE, ...value }, move);
  return { cornerPermutation: next.cornerPermutation, cornerOrientation: next.cornerOrientation };
}

function centerKey(value: readonly number[]): string {
  return value.join(',');
}

function applyToCenters(value: readonly number[], move: SkewbMove): readonly number[] {
  return applySkewbMove({ ...SOLVED_SKEWB_STATE, centerPermutation: value }, move)
    .centerPermutation;
}

let cornerProjection: Projection<SkewbCornerValue> | null = null;
let centerProjection: Projection<readonly number[]> | null = null;

function corners(): Projection<SkewbCornerValue> {
  return (cornerProjection ??= buildProjection<SkewbCornerValue>(
    {
      cornerPermutation: SOLVED_SKEWB_STATE.cornerPermutation,
      cornerOrientation: SOLVED_SKEWB_STATE.cornerOrientation,
    },
    cornerKey,
    applyToCorners,
  ));
}

function centers(): Projection<readonly number[]> {
  return (centerProjection ??= buildProjection<readonly number[]>(
    SOLVED_SKEWB_STATE.centerPermutation,
    centerKey,
    applyToCenters,
  ));
}

export function cornerStatesSkewb(): number {
  return corners().values.length;
}

export function centerStatesSkewb(): number {
  return centers().values.length;
}

export function cornerCoordSkewb(state: SkewbState): number {
  return corners().indexOf(state);
}

export function centerCoordSkewb(state: SkewbState): number {
  return centers().indexOf(state.centerPermutation);
}

export function nextCornerCoordSkewb(coord: number, moveIndex: number): number {
  return corners().transition[moveIndex]![coord]!;
}

export function nextCenterCoordSkewb(coord: number, moveIndex: number): number {
  return centers().transition[moveIndex]![coord]!;
}

export interface SkewbCoordinate {
  readonly corners: number;
  readonly centers: number;
}

export function toSkewbCoordinate(state: SkewbState): SkewbCoordinate {
  return { corners: cornerCoordSkewb(state), centers: centerCoordSkewb(state) };
}

/** The two coordinates flattened into the single index the pruning table is laid out on. */
export function packSkewbCoordinate(coordinate: SkewbCoordinate): number {
  return coordinate.corners * centerStatesSkewb() + coordinate.centers;
}

export function skewbCoordinateStates(): number {
  return cornerStatesSkewb() * centerStatesSkewb();
}

/** Rebuilds the full state a packed index stands for — the inverse of `packSkewbCoordinate` ∘ `toSkewbCoordinate`. */
export function unpackSkewbState(index: number): SkewbState {
  const centerCount = centerStatesSkewb();
  const centerIndex = index % centerCount;
  const cornerIndex = (index - centerIndex) / centerCount;
  const corner = corners().values[cornerIndex];
  const center = centers().values[centerIndex];
  if (!corner || !center) {
    throw new Error(`skewb-coordinates: packed index ${index} out of range`);
  }
  return {
    cornerPermutation: corner.cornerPermutation,
    cornerOrientation: corner.cornerOrientation,
    centerPermutation: center,
  };
}

export const SOLVED_SKEWB_COORDINATE_INDEX = 0;

export function isSolvedSkewbCoordinate(coordinate: SkewbCoordinate): boolean {
  // Dense index 0 is the BFS start in both projections, i.e. solved.
  return coordinate.corners === 0 && coordinate.centers === 0;
}

/** Forces both projections to build now — for benchmarking and for the coverage tests. */
export function buildProjectionsSkewb(): void {
  corners();
  centers();
}
