import { centrePreservingMoveIndices, edgeOfWingSlot } from './orbits';
import { WING_COUNT_444 } from './pieces';
import { move444Tables, type Cube444State } from './state';

/**
 * Pattern databases for the wing half of the reduction: how far a **pair of
 * edges** is from being paired.
 *
 * ## The coordinate
 *
 * Track the exact positions of four wings — the two of edge `a` and the two of
 * edge `b` — among the 24 slots: `24 x 23 x 22 x 21 = 255,024`. Six disjoint
 * groups cover all twelve edges, for 1.5 MB in total.
 *
 * This is the size the design document's six-wing database (96,909,120) was
 * revised down to, once it was clear that the entries were affordable but the
 * breadth-first search filling them was not.
 *
 * ## The goal, and why it is a set
 *
 * "Paired" does not mean "home": the two wings of an edge only have to be in one
 * slot pair, any slot pair, either way round. So the search runs from many
 * sources at once — every coordinate in which both edges are paired somewhere —
 * and the distance it reports is to the *nearest* of them.
 *
 * That keeps it admissible for the reduction: any real reduction pairs these two
 * edges too, so it cannot do so in fewer moves than the shortest route to the
 * nearest paired arrangement.
 */

export const WING_PAIR_GROUP_SIZE = 4;
export const WING_PAIR_COORDINATE_COUNT = 24 * 23 * 22 * 21; // 255,024

/** The six disjoint groups of two edges, covering all twelve. */
export const WING_PAIR_GROUPS: readonly (readonly number[])[] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [8, 9],
  [10, 11],
].map(([a, b]) => [2 * a!, 2 * a! + 1, 2 * b!, 2 * b! + 1]);

/** Rank four distinct slots as a partial permutation of the 24. */
export function rankWingPositions(positions: readonly number[]): number {
  let index = 0;
  for (let i = 0; i < WING_PAIR_GROUP_SIZE; i += 1) {
    let adjusted = positions[i]!;
    for (let j = 0; j < i; j += 1) if (positions[j]! < positions[i]!) adjusted -= 1;
    index = i === 0 ? adjusted : index * (WING_COUNT_444 - i) + adjusted;
  }
  return index;
}

export function wingPositionsFromRank(rank: number): number[] {
  const adjusted = new Array<number>(WING_PAIR_GROUP_SIZE).fill(0);
  let remaining = rank;
  for (let i = WING_PAIR_GROUP_SIZE - 1; i >= 1; i -= 1) {
    const radix = WING_COUNT_444 - i;
    adjusted[i] = remaining % radix;
    remaining = Math.floor(remaining / radix);
  }
  adjusted[0] = remaining;

  const available = Array.from({ length: WING_COUNT_444 }, (_, slot) => slot);
  return adjusted.map((offset) => available.splice(offset, 1)[0]!);
}

/** Where the group's four wings are, in the group's own order. */
export function wingPositionsOf(state: Cube444State, group: readonly number[]): number[] {
  const positionOf = new Array<number>(WING_COUNT_444).fill(-1);
  for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
    positionOf[state.wingPermutation[slot]!] = slot;
  }
  return group.map((piece) => positionOf[piece]!);
}

/** Both edges of the group paired: each edge's two wings sharing one slot pair. */
function isGroupPaired(positions: readonly number[]): boolean {
  return (
    edgeOfWingSlot(positions[0]!) === edgeOfWingSlot(positions[1]!) &&
    edgeOfWingSlot(positions[2]!) === edgeOfWingSlot(positions[3]!)
  );
}

const tables = new Map<number, Uint8Array>();

/**
 * The exact table for group `index`, by multi-source breadth-first search from
 * every paired arrangement, over the 24 centre-preserving moves.
 */
export function wingPairTable(index: number): Uint8Array {
  const cached = tables.get(index);
  if (cached) return cached;

  const moves = centrePreservingMoveIndices();
  const moveTables = move444Tables();
  const distance = new Uint8Array(WING_PAIR_COORDINATE_COUNT).fill(255);
  const queue = new Int32Array(WING_PAIR_COORDINATE_COUNT);
  let tail = 0;

  // Every coordinate in which both edges are paired is a source.
  for (let rank = 0; rank < WING_PAIR_COORDINATE_COUNT; rank += 1) {
    if (!isGroupPaired(wingPositionsFromRank(rank))) continue;
    distance[rank] = 0;
    queue[tail] = rank;
    tail += 1;
  }
  if (tail === 0) throw new Error(`444-wing-pairs: group ${index} has no paired arrangement`);

  for (let head = 0; head < tail; head += 1) {
    const rank = queue[head]!;
    const positions = wingPositionsFromRank(rank);
    const depth = distance[rank]! + 1;
    for (const move of moves) {
      const landed = positions.map((slot) => moveTables[move]!.wingDestination[slot]!);
      const next = rankWingPositions(landed);
      if (distance[next] !== 255) continue;
      distance[next] = depth;
      queue[tail] = next;
      tail += 1;
    }
  }

  if (tail !== WING_PAIR_COORDINATE_COUNT) {
    throw new Error(
      `444-wing-pairs: group ${index} reaches only ${tail} of ${WING_PAIR_COORDINATE_COUNT}`,
    );
  }

  tables.set(index, distance);
  return distance;
}

/** How far this group's two edges are from being paired. */
export function wingPairDistance(state: Cube444State, index: number): number {
  return wingPairTable(index)[
    rankWingPositions(wingPositionsOf(state, WING_PAIR_GROUPS[index]!))
  ]!;
}

/**
 * `max` over the six groups — a lower bound on pairing all twelve edges, since
 * each group has to be paired by any sequence that pairs everything.
 */
export function wingPairLowerBound(state: Cube444State): number {
  let bound = 0;
  for (let index = 0; index < WING_PAIR_GROUPS.length; index += 1) {
    bound = Math.max(bound, wingPairDistance(state, index));
  }
  return bound;
}
