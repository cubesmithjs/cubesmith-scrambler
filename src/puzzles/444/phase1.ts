import { FACES } from '../../notation/move';
import { CENTRE_COUNT_444, pieces444 } from './pieces';
import { move444Tables, type Cube444State } from './state';

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
export const CENTRE_SUBSET_COUNT = 735_471; // C(24,8)

const BINOMIAL: readonly (readonly number[])[] = (() => {
  const table: number[][] = [];
  for (let n = 0; n <= CENTRE_COUNT_444; n += 1) {
    const row = new Array<number>(CENTRE_SUBSET_SIZE + 2).fill(0);
    row[0] = 1;
    for (let k = 1; k <= CENTRE_SUBSET_SIZE + 1; k += 1) {
      row[k] = (table[n - 1]?.[k] ?? 0) + (table[n - 1]?.[k - 1] ?? 0);
    }
    table.push(row);
  }
  return table;
})();

/**
 * Colexicographic rank of a subset given as a bit mask: the sum of `C(p, i)`
 * over the set bits `p`, counted from one. The smallest subset ranks 0 and the
 * largest `C(24,8) - 1`, with nothing skipped — which is what makes it usable as
 * a table index rather than merely a hash.
 */
export function rankCentreSubset(mask: number): number {
  let rank = 0;
  let index = 1;
  // Only the eight set bits, lowest first — colex needs ascending order, and
  // walking all 24 slots instead cost the table build three times over.
  for (let bits = mask; bits !== 0; bits &= bits - 1) {
    const slot = 31 - Math.clz32(bits & -bits);
    rank += BINOMIAL[slot]![index]!;
    index += 1;
  }
  if (index !== CENTRE_SUBSET_SIZE + 1) {
    throw new Error(`444-phase1: a centre subset must have ${CENTRE_SUBSET_SIZE} slots`);
  }
  return rank;
}

export function centreSubsetFromRank(rank: number): number {
  let remaining = rank;
  let mask = 0;
  for (let index = CENTRE_SUBSET_SIZE; index >= 1; index -= 1) {
    let slot = CENTRE_COUNT_444 - 1;
    while (BINOMIAL[slot]![index]! > remaining) slot -= 1;
    remaining -= BINOMIAL[slot]![index]!;
    mask |= 1 << slot;
  }
  return mask;
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
  if (maskTables) return maskTables;

  maskTables = move444Tables().map((table) => {
    const lookup = new Int32Array(3 * 256);
    for (let chunk = 0; chunk < 3; chunk += 1) {
      for (let byte = 0; byte < 256; byte += 1) {
        let permuted = 0;
        for (let bit = 0; bit < 8; bit += 1) {
          if ((byte & (1 << bit)) === 0) continue;
          permuted |= 1 << table.centreDestination[chunk * 8 + bit]!;
        }
        lookup[chunk * 256 + byte] = permuted;
      }
    }
    return lookup;
  });
  return maskTables;
}

export function permuteCentreMask(mask: number, moveIndex: number): number {
  const lookup = centreMaskTables()[moveIndex]!;
  return (
    lookup[(mask & 0xff)]! |
    lookup[256 + ((mask >>> 8) & 0xff)]! |
    lookup[512 + ((mask >>> 16) & 0xff)]!
  );
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
