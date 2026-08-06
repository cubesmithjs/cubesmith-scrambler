import { centrePreservingMoveIndices } from './orbits';
import { CENTRE_COUNT_444, pieces444 } from './pieces';
import { AXIS_PAIRS } from './phase1';
import { binomial, rankSubset } from './subsets';
import { move444Tables, type Cube444State } from './state';

/**
 * Solving the centres **completely**, within the 24 moves that keep each centre
 * on its own axis pair.
 *
 * Phase 1 sorted the centres onto their axis pairs. What is left for them is one
 * question per pair: of the eight slots of the U/D pair, which four hold U rather
 * than D. That is `C(8,4) = 70` per pair and `70^3 = 343,000` for all three —
 * small enough that the table is **exact**, so the centres need no search at all.
 * Read the distance, take any move that lowers it, repeat.
 *
 * ## Why this is a component and not a phase
 *
 * Solving the centres is not something the solver can do and then move on from.
 * Every move that could *pair the wings* breaks solved centres — a wide turn
 * splits a slot pair and carries a centre to another face in the same stroke —
 * and the outer turns, which do preserve solved centres, cannot pair anything
 * (`orbits.ts`). Centres-solved and wings-paired have to be reached together.
 *
 * So what this module gives the reduction is:
 *
 * - an **exact heuristic** for the centre half of that joint goal, which is the
 *   strongest kind available, and
 * - a way to *finish* the centres when the wings are already paired.
 *
 * `centres.test.ts` shows the trap rather than describing it: solving the centres
 * from a phase-1 state leaves the wings unpaired, and every move that could pair
 * them puts the centres back out.
 */

export const CENTRE_PAIR_SUBSETS = binomial(8, 4); // 70
export const CENTRE_COORDINATE_COUNT = CENTRE_PAIR_SUBSETS ** 3; // 343,000

interface CentreLayout {
  /** The eight centre slots of each axis pair, in a fixed order. */
  readonly slots: readonly (readonly number[])[];
  /** Where each of those eight lands, indexed by restricted move then pair. */
  readonly destination: readonly (readonly Int32Array[])[];
}

let layout: CentreLayout | undefined;

function centreLayout(): CentreLayout {
  if (layout) return layout;

  const { centreFace } = pieces444();
  const slots = AXIS_PAIRS.map((pair) => {
    const own: number[] = [];
    for (let slot = 0; slot < CENTRE_COUNT_444; slot += 1) {
      if (pair.includes(centreFace[slot]!)) own.push(slot);
    }
    if (own.length !== 8) throw new Error('444-centres: an axis pair without eight slots');
    return own;
  });

  const tables = move444Tables();
  const destination = centrePreservingMoveIndices().map((moveIndex) =>
    slots.map((own) => {
      const map = new Int32Array(8);
      for (const [index, slot] of own.entries()) {
        const target = own.indexOf(tables[moveIndex]!.centreDestination[slot]!);
        if (target < 0) {
          // Would mean the move carried a centre off its axis pair, which is the
          // one thing this move set is chosen not to do.
          throw new Error('444-centres: a centre-preserving move left its axis pair');
        }
        map[index] = target;
      }
      return map;
    }),
  );

  layout = { slots, destination };
  return layout;
}

/** Which four of a pair's eight slots hold the pair's *first* colour, as a mask. */
function pairMask(centreColour: readonly number[], pair: number): number {
  const { slots } = centreLayout();
  const colour = AXIS_PAIRS[pair]![0];
  let mask = 0;
  for (const [index, slot] of slots[pair]!.entries()) {
    if (centreColour[slot] === colour) mask |= 1 << index;
  }
  return mask;
}

function coordinateOfColours(centreColour: readonly number[]): number {
  return (
    rankSubset(pairMask(centreColour, 0), 4) +
    CENTRE_PAIR_SUBSETS * rankSubset(pairMask(centreColour, 1), 4) +
    CENTRE_PAIR_SUBSETS ** 2 * rankSubset(pairMask(centreColour, 2), 4)
  );
}

export function centreCoordinateOf(state: Cube444State): number {
  return coordinateOfColours(state.centreColour);
}

export function solvedCentreCoordinate(): number {
  return coordinateOfColours(pieces444().centreFace);
}

let unrankCache: Int32Array | undefined;

function unrankPairMask(rank: number): number {
  if (!unrankCache) {
    unrankCache = new Int32Array(CENTRE_PAIR_SUBSETS);
    for (let mask = 0; mask < 256; mask += 1) {
      let bits = 0;
      for (let bit = 0; bit < 8; bit += 1) if ((mask & (1 << bit)) !== 0) bits += 1;
      if (bits === 4) unrankCache[rankSubset(mask, 4)] = mask;
    }
  }
  return unrankCache[rank]!;
}

function permutePairMask(mask: number, map: Int32Array): number {
  let moved = 0;
  for (let index = 0; index < 8; index += 1) {
    if ((mask & (1 << index)) !== 0) moved |= 1 << map[index]!;
  }
  return moved;
}

/** `move` indexes the *restricted* move set, not all 36. */
export function applyCentreCoordinate(coordinate: number, move: number): number {
  const maps = centreLayout().destination[move]!;
  const first = coordinate % CENTRE_PAIR_SUBSETS;
  const second = Math.floor(coordinate / CENTRE_PAIR_SUBSETS) % CENTRE_PAIR_SUBSETS;
  const third = Math.floor(coordinate / CENTRE_PAIR_SUBSETS ** 2);
  return (
    rankSubset(permutePairMask(unrankPairMask(first), maps[0]!), 4) +
    CENTRE_PAIR_SUBSETS * rankSubset(permutePairMask(unrankPairMask(second), maps[1]!), 4) +
    CENTRE_PAIR_SUBSETS ** 2 *
      rankSubset(permutePairMask(unrankPairMask(third), maps[2]!), 4)
  );
}

let table: Uint8Array | undefined;

/**
 * Exact moves-to-solved for the centres, over all 343,000 coordinates and the 24
 * centre-preserving moves. Searched outward from solved, which is valid because
 * every move's inverse is in the same set.
 */
export function centreTable(): Uint8Array {
  if (table) return table;

  const moveCount = centrePreservingMoveIndices().length;
  const distance = new Uint8Array(CENTRE_COORDINATE_COUNT).fill(255);
  const queue = new Int32Array(CENTRE_COORDINATE_COUNT);

  const start = solvedCentreCoordinate();
  distance[start] = 0;
  queue[0] = start;
  let tail = 1;

  for (let head = 0; head < tail; head += 1) {
    const coordinate = queue[head]!;
    const depth = distance[coordinate]! + 1;
    for (let move = 0; move < moveCount; move += 1) {
      const next = applyCentreCoordinate(coordinate, move);
      if (distance[next] !== 255) continue;
      distance[next] = depth;
      queue[tail] = next;
      tail += 1;
    }
  }

  table = distance;
  return distance;
}

export function centreDistance(state: Cube444State): number {
  return centreTable()[centreCoordinateOf(state)]!;
}

/**
 * A shortest sequence solving the centres, by descending the exact table. No
 * search is needed: an exact distance always has a neighbour one closer.
 *
 * Returns indices into `move444Tables()`.
 */
export function solveCentres444(state: Cube444State): number[] {
  const preserving = centrePreservingMoveIndices();
  const distances = centreTable();
  const moves: number[] = [];

  let coordinate = centreCoordinateOf(state);
  let remaining = distances[coordinate]!;
  if (remaining === 255) {
    throw new Error('444-centres: this centre coordinate is unreachable — run phase 1 first');
  }

  while (remaining > 0) {
    let stepped = false;
    for (const [index, moveIndex] of preserving.entries()) {
      const next = applyCentreCoordinate(coordinate, index);
      if (distances[next]! !== remaining - 1) continue;
      moves.push(moveIndex);
      coordinate = next;
      remaining -= 1;
      stepped = true;
      break;
    }
    if (!stepped) throw new Error('444-centres: exact table with no descending move');
  }

  return moves;
}
