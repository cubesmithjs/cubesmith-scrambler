import { FACES } from '../../notation/move';
import { CENTRE_COUNT_444, pieces444 } from './pieces';
import { move444Tables, type Cube444State } from './state';
import {
  buildMaskPermuter,
  permuteMask,
  rankSubset,
  subsetCount,
  subsetFromRank,
} from './subsets';

/**
 * Phase 1 of the 4x4x4 solver: **every centre onto its own axis pair**.
 *
 * The invariant established is that each of the eight U/D-coloured centres sits
 * on the U or D face, each of the eight F/B-coloured ones on F or B, and each
 * L/R one on L or R. It does not say *which* face of the pair, nor which slot on
 * it — those are phase 2's and phase 3's business.
 *
 * ## The coordinates, and a correction to the design document
 *
 * `docs/444-design.md` proposed "which 8 of the 24 slots hold U/D colours"
 * (`C(24,8) = 735,471`) and then "which 8 of the remaining 16 hold F/B"
 * (`C(16,8) = 12,870`). The second of those is **not a usable abstraction**: it
 * is defined relative to the first, so it has no transition function of its own
 * and cannot be tabulated independently — the pair would be a single
 * 9.5-billion-entry coordinate.
 *
 * What works instead is **three** coordinates of the *same* form, one per axis
 * pair:
 *
 * | coordinate | meaning | size |
 * |---|---|---|
 * | `UD` | which 8 slots hold U-or-D colours | `C(24,8) = 735,471` |
 * | `FB` | which 8 slots hold F-or-B colours | `C(24,8) = 735,471` |
 * | `LR` | which 8 slots hold L-or-R colours | `C(24,8) = 735,471` |
 *
 * Each is a genuine homomorphic projection — a move permutes centre slots, and
 * "which slots hold this colour pair" transforms by that permutation and nothing
 * else — so each admits an exact breadth-first table, and `max` of the three is
 * admissible.
 *
 * The third is *logically* redundant, since the L/R mask is whatever the other
 * two leave over. Its **distance** is not: a determined coordinate still carries
 * an independent lower bound, and including it is why the search settled at 67ms
 * a solve rather than half a second.
 *
 * ## Measured
 *
 * Radius 8, all three tables built in 1.3s together, 2.2 MB. Phase-1 solutions
 * average 9.1 moves against a bound averaging 6.5, and a solve takes ~67ms.
 *
 * ## Representation
 *
 * A coordinate value is a **24-bit mask** of centre slots, ranked into
 * `0..735,470` by the colexicographic rank of its set bits. Masks are what the
 * search moves; ranks are what indexes the table.
 */

export const CENTRE_SUBSET_SIZE = 8;
export const CENTRE_SUBSET_COUNT = subsetCount(CENTRE_SUBSET_SIZE); // C(24,8) = 735,471

/**
 * A centre subset's rank and its inverse, and the mask permuter — all shared with
 * phase 2 through `subsets.ts`, since "a fixed-size subset of the 24 slots,
 * permuted by the moves" is the shape both phases' coordinates take.
 */
export function rankCentreSubset(mask: number): number {
  return rankSubset(mask, CENTRE_SUBSET_SIZE);
}

export function centreSubsetFromRank(rank: number): number {
  return subsetFromRank(rank, CENTRE_SUBSET_SIZE);
}

/** The colour pairs phase 1 sorts the centres into, as indices into `FACES`. */
export const AXIS_PAIRS: readonly (readonly [number, number])[] = [
  [FACES.indexOf('U'), FACES.indexOf('D')],
  [FACES.indexOf('F'), FACES.indexOf('B')],
  [FACES.indexOf('L'), FACES.indexOf('R')],
];

/** Which centre slots hold a colour from `pair`, as a mask. */
export function centreMaskFor(state: Cube444State, pair: readonly [number, number]): number {
  let mask = 0;
  for (let slot = 0; slot < CENTRE_COUNT_444; slot += 1) {
    const colour = state.centreColour[slot]!;
    if (colour === pair[0] || colour === pair[1]) mask |= 1 << slot;
  }
  return mask;
}

/** The mask a solved cube has for `pair` — the slots of those two faces. */
export function solvedCentreMaskFor(pair: readonly [number, number]): number {
  const { centreFace } = pieces444();
  let mask = 0;
  for (let slot = 0; slot < CENTRE_COUNT_444; slot += 1) {
    const face = centreFace[slot]!;
    if (face === pair[0] || face === pair[1]) mask |= 1 << slot;
  }
  return mask;
}

/**
 * Per-move byte tables for permuting a 24-bit mask.
 *
 * Permuting a mask bit by bit is 24 operations, and the breadth-first search
 * below does it 26 million times per table. Splitting the mask into three bytes
 * and looking each one up turns that into three reads and two ors, at a cost of
 * `36 x 3 x 256` precomputed entries.
 */
let maskTables: readonly Int32Array[] | undefined;

function centreMaskTables(): readonly Int32Array[] {
  maskTables ??= move444Tables().map((table) => buildMaskPermuter(table.centreDestination));
  return maskTables;
}

export function permuteCentreMask(mask: number, moveIndex: number): number {
  return permuteMask(mask, centreMaskTables()[moveIndex]!);
}

/**
 * Exact moves-to-goal for one colour pair, by breadth-first search over all
 * 735,471 subsets.
 *
 * Searching outward from the *goal* rather than toward it is valid here because
 * every move's inverse is also a move, so the graph is undirected and the two
 * distances coincide.
 */
function buildCentrePairTable(pair: readonly [number, number]): Uint8Array {
  const moveCount = move444Tables().length;
  const distance = new Uint8Array(CENTRE_SUBSET_COUNT).fill(255);
  const queue = new Int32Array(CENTRE_SUBSET_COUNT);

  const goal = solvedCentreMaskFor(pair);
  distance[rankCentreSubset(goal)] = 0;
  queue[0] = goal;
  let tail = 1;

  for (let head = 0; head < tail; head += 1) {
    const mask = queue[head]!;
    const depth = distance[rankCentreSubset(mask)]! + 1;
    for (let move = 0; move < moveCount; move += 1) {
      const next = permuteCentreMask(mask, move);
      const rank = rankCentreSubset(next);
      if (distance[rank] !== 255) continue;
      distance[rank] = depth;
      queue[tail] = next;
      tail += 1;
    }
  }

  if (tail !== CENTRE_SUBSET_COUNT) {
    throw new Error(
      `444-phase1: the centre subsets are not all reachable (${tail} of ${CENTRE_SUBSET_COUNT})`,
    );
  }
  return distance;
}

const tables = new Map<number, Uint8Array>();

/** The exact table for axis pair `index` (0 = U/D, 1 = F/B, 2 = L/R). */
export function centrePairTable(index: number): Uint8Array {
  const cached = tables.get(index);
  if (cached) return cached;
  const built = buildCentrePairTable(AXIS_PAIRS[index]!);
  tables.set(index, built);
  return built;
}

export interface Phase1Coordinate {
  readonly upDown: number;
  readonly frontBack: number;
  readonly leftRight: number;
}

export function phase1CoordinateOf(state: Cube444State): Phase1Coordinate {
  return {
    upDown: centreMaskFor(state, AXIS_PAIRS[0]!),
    frontBack: centreMaskFor(state, AXIS_PAIRS[1]!),
    leftRight: centreMaskFor(state, AXIS_PAIRS[2]!),
  };
}

export function isPhase1Solved(coordinate: Phase1Coordinate): boolean {
  return (
    coordinate.upDown === solvedCentreMaskFor(AXIS_PAIRS[0]!) &&
    coordinate.frontBack === solvedCentreMaskFor(AXIS_PAIRS[1]!)
  );
}

/**
 * `max` of **three** exact tables, one per axis pair.
 *
 * Two would do for correctness — the L/R mask is whatever the other two leave
 * over — but its *distance* is an independent lower bound, and taking the max of
 * three rather than two cut the gap between bound and truth from 2.7 moves to
 * under 1, which is the difference between a half-second search and a
 * millisecond one. A determined coordinate is not a redundant heuristic.
 *
 * Admissible for the usual reason: each is the exact distance of a homomorphic
 * projection, so none can exceed the real distance, and the largest of several
 * lower bounds is a lower bound.
 */
export function phase1LowerBound(coordinate: Phase1Coordinate): number {
  return Math.max(
    centrePairTable(0)[rankCentreSubset(coordinate.upDown)]!,
    centrePairTable(1)[rankCentreSubset(coordinate.frontBack)]!,
    centrePairTable(2)[rankCentreSubset(coordinate.leftRight)]!,
  );
}
