import { extendedLibrary, type Conjugate444 } from './generators';
import { WING_COUNT_444 } from './pieces';
import type { Cube444State } from './state';

/**
 * The staged pairing loop: bring every edge's two wings together, using only
 * sequences that leave the centres exactly as they were.
 *
 * ## What it may assume, and what it must not
 *
 * Checkpoint G proved the conjugate library generates exactly `A24` on the 24
 * wings, so *some* product of its members carries any arrangement to a paired one.
 * That guarantees a solution **exists**; it does not guarantee that taking the
 * locally best generator at each step finds one. So the loop is greedy but not
 * trusting: if it ever stalls it **throws** rather than returning something
 * incomplete or asking the caller to draw again.
 *
 * That distinction is a uniformity requirement, not tidiness. §11 of the design
 * document: a solver that quietly failed on some subset of states, with generation
 * redrawing in response, would produce a distribution uniform only *conditional on
 * solvability* — and the excluded set would be invisible to any statistical test on
 * the output. A stall has to be loud.
 *
 * ## Why it works on wings alone
 *
 * Every member of the library is **verified** centre-neutral — not centre-neutral by
 * construction, a claim `generators.ts` records having had to withdraw — so the
 * centres cannot drift while this runs, and corners are the last phase's business.
 * The loop therefore tracks a 24-entry wing permutation and nothing else, which is
 * what makes scanning the whole 1,872-member library affordable at every step.
 */

/** Which edge slot a wing slot belongs to. */
const edgeOf = (slot: number): number => Math.floor(slot / 2);

/** How many of the twelve edges have both their wings together. */
export function pairedEdgeCount(wingPermutation: readonly number[]): number {
  let paired = 0;
  for (let edge = 0; edge < WING_COUNT_444 / 2; edge += 1) {
    if (edgeOf(wingPermutation[2 * edge]!) === edgeOf(wingPermutation[2 * edge + 1]!)) {
      paired += 1;
    }
  }
  return paired;
}

export function areAllEdgesPaired(wingPermutation: readonly number[]): boolean {
  return pairedEdgeCount(wingPermutation) === WING_COUNT_444 / 2;
}

function applyGenerator(
  wingPermutation: readonly number[],
  generator: Conjugate444,
): number[] {
  const next = new Array<number>(WING_COUNT_444);
  for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
    next[generator.wingDestination[slot]!] = wingPermutation[slot]!;
  }
  return next;
}

export class PairingStalledError extends Error {
  readonly paired: number;

  constructor(paired: number) {
    super(
      `@cubesmith/scrambler: 4x4x4 pairing stalled with ${paired} of 12 edges paired — ` +
        'the greedy step is insufficient even though the library is complete',
    );
    this.name = 'PairingStalledError';
    this.paired = paired;
  }
}

export interface PairingResult {
  /** Move indices into `move444Tables()`, in order. */
  readonly moves: number[];
  /** The wing permutation the sequence arrives at, fully paired. */
  readonly wingPermutation: number[];
  /** How many generators were used. */
  readonly steps: number;
}

/**
 * The library compiled into typed arrays: one flat destination map and one word
 * length per generator.
 *
 * Not a micro-optimisation for its own sake — it is what makes the search below
 * affordable. `applyGenerator` above allocates a fresh 24-entry array per call, and
 * the greedy spends about **13 µs** a generator because of it.
 *
 * With the flat typed arrays *and* the inverse map below, a beam of width 64 costs
 * **0.12x** what the one-step allocating greedy costs — 159 ms against 1363 ms over
 * the same 24 states (2026-08-13). The search that replaced the greedy is cheaper
 * than the greedy.
 */
interface CompiledLibrary {
  readonly destination: Uint8Array;
  /**
   * The inverse of `destination`: `source[g * 24 + t]` is the slot whose contents
   * land in `t`.
   *
   * 🔴 This is what makes the search affordable under coverage, and the reason is
   * arithmetic rather than taste. Scoring a candidate only needs its **paired
   * count**, and `composed[t] === wings[source[t]]` — so the score can be read with
   * 24 lookups and no writes, instead of composing the whole 24-slot permutation
   * first. Only a candidate that actually improves is then materialised.
   *
   * Without it the first version of this search ran 64 nodes x 6,660 generators x
   * a 24-slot *write* per depth, which was fine warm (688 ms) and pushed
   * `npm run ci` from 455 s to **645 s**, timing out three unrelated tests. A
   * gate nobody can afford to run gets deleted; so does a solver that does the
   * same to the suite.
   */
  readonly source: Uint8Array;
  readonly length: Uint8Array;
  readonly count: number;
}

let compiled: CompiledLibrary | undefined;

/**
 * Builds the compiled library now, so `prepareEvent('444')` pays for it rather than
 * whichever scramble happens to be first. Small — 6,660 x 24 x 2 writes — but this is
 * exactly the kind of lazily-built thing `core/prepare-event.test.ts` exists to catch,
 * and leaving it out would make the preparer a slightly false promise.
 */
export function prepareCompiledLibrary(): void {
  compiledLibrary();
}

function compiledLibrary(): CompiledLibrary {
  if (compiled) return compiled;
  const library = extendedLibrary();
  const count = library.length;
  const destination = new Uint8Array(count * WING_COUNT_444);
  const source = new Uint8Array(count * WING_COUNT_444);
  const length = new Uint8Array(count);
  library.forEach((generator, index) => {
    const base = index * WING_COUNT_444;
    for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
      const landed = generator.wingDestination[slot]!;
      destination[base + slot] = landed;
      source[base + landed] = slot;
    }
    length[index] = generator.moves.length;
  });
  compiled = { destination, source, length, count };
  return compiled;
}

function pairedInTyped(wings: Uint8Array): number {
  let paired = 0;
  for (let edge = 0; edge < WING_COUNT_444 / 2; edge += 1) {
    if (wings[2 * edge]! >> 1 === wings[2 * edge + 1]! >> 1) paired += 1;
  }
  return paired;
}

/**
 * How many partial solutions the search carries forward at each depth.
 *
 * Chosen against the clock rather than the length, because the length keeps
 * improving long after the time stops being worth it. Measured over 24
 * centres-solved states (2026-08-13), means over the states each width solved:
 *
 * | width | moves | ms | states it could not finish |
 * |---|---|---|---|
 * | greedy (shipped before) | 45.2 | 809 | — |
 * | 32 | 26.6 | 341 | 7 of 24 |
 * | **64** | **27.7** | **688** | **1 of 24** |
 * | 128 | 27.0 | 1386 | 1 of 24 |
 * | 256 | 26.4 | 2847 | 1 of 24 |
 *
 * 64 is where the coverage arrives and the clock has not yet moved. 128 doubles the
 * time for two thirds of a move.
 *
 * ⚠️ Those timings are from **before** the inverse map in `CompiledLibrary` — the
 * ordering is what the width was chosen on and is unchanged, but every absolute
 * figure is now about a third of what is written. Width 64 re-measured after that
 * rewrite and the bounded shortlist: **28.6 moves at 159 ms**, against the greedy's
 * 45.2 at 1363 ms.
 */
const PAIRING_BEAM_WIDTH = 64;

/**
 * Roughly what one more paired edge costs, used to rank partial solutions.
 *
 * A guide, not a bound — this is a beam, so nothing here claims optimality and an
 * admissible heuristic would only make the ranking worse. 4 is the observed moves
 * per edge, near enough: the greedy paired 11.4 edges in 45 moves.
 */
const MOVES_PER_EDGE_ESTIMATE = 4;

interface BeamNode {
  readonly wings: Uint8Array;
  readonly moves: number;
  readonly path: readonly number[];
}

/**
 * **Pairs every edge by searching the library for the shortest total word**, and
 * this is the whole point of it: the greedy below optimises *edges paired per
 * step*, with word length only as a tie-break, and never looks past one step.
 *
 * That objective is the wrong one and the measurement says so plainly. Over 24
 * centres-solved states the greedy spent **45.2 moves in 6.3 generators** —
 * averaging 7.2 moves each where the library's shortest is 5 — with a spread of
 * **29 to 63 on identical inputs**. Ranking partial solutions by moves spent
 * instead brings that to **27.7**, on the same move set, in the same time.
 *
 * Returns `undefined` rather than throwing when the beam cannot finish. The caller
 * falls back to the greedy, which has the depth-2 rescue for the last-two-edges
 * stall this search does not: it only ever extends by a generator that pairs *more*
 * edges, so it walks into that stall the same way a plain greedy would. One state in
 * 24 needed the fallback.
 */
function searchPairing(state: Cube444State): PairingResult | undefined {
  const library = extendedLibrary();
  const { destination, source, length, count } = compiledLibrary();

  const start = new Uint8Array(WING_COUNT_444);
  for (let slot = 0; slot < WING_COUNT_444; slot += 1) start[slot] = state.wingPermutation[slot]!;

  let beam: BeamNode[] = [{ wings: start, moves: 0, path: [] }];
  let best: BeamNode | undefined;
  const edges = WING_COUNT_444 / 2;

  /** A candidate as a *reference*: the permutation it reaches is not built yet. */
  interface Shortlisted {
    readonly node: BeamNode;
    readonly generator: number;
    readonly moves: number;
    readonly score: number;
  }

  const compose = (node: BeamNode, generator: number): Uint8Array => {
    const base = generator * WING_COUNT_444;
    const composed = new Uint8Array(WING_COUNT_444);
    for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
      composed[destination[base + slot]!] = node.wings[slot]!;
    }
    return composed;
  };

  for (let depth = 0; depth < edges && beam.length > 0; depth += 1) {
    // 🔴 A bounded shortlist, not a full candidate list. Collecting every improving
    // candidate as a materialised permutation and sorting the lot was correct and
    // cost the suite dearly: aggregate test time went from 3,876 s to 5,360 s and
    // timing-sensitive tests elsewhere began to time out under the contention. Most
    // candidates are never used, so most must never be built.
    const shortlistLimit = PAIRING_BEAM_WIDTH * 2;
    const shortlist: Shortlisted[] = [];
    let worst = Infinity;

    for (const node of beam) {
      const wings = node.wings;
      const current = pairedInTyped(wings);
      for (let generator = 0; generator < count; generator += 1) {
        const base = generator * WING_COUNT_444;

        // Score without composing: `composed[t] === wings[source[t]]`, so the
        // paired count is 24 reads and no writes.
        let paired = 0;
        for (let edge = 0; edge < edges; edge += 1) {
          const first = wings[source[base + 2 * edge]!]!;
          const second = wings[source[base + 2 * edge + 1]!]!;
          if (first >> 1 === second >> 1) paired += 1;
        }
        // Only ever extend by a generator that pairs more. This is what makes the
        // search affordable and what makes it stall where the greedy would.
        if (paired <= current) continue;

        const moves = node.moves + length[generator]!;
        if (best && moves >= best.moves) continue;

        if (paired === edges) {
          best = { wings: compose(node, generator), moves, path: [...node.path, generator] };
          continue;
        }

        const score = moves + (edges - paired) * MOVES_PER_EDGE_ESTIMATE;
        if (shortlist.length >= shortlistLimit && score >= worst) continue;

        let at = shortlist.length;
        while (at > 0 && shortlist[at - 1]!.score > score) at -= 1;
        shortlist.splice(at, 0, { node, generator, moves, score });
        if (shortlist.length > shortlistLimit) shortlist.pop();
        worst = shortlist[shortlist.length - 1]!.score;
      }
    }

    if (shortlist.length === 0) break;

    // Only now are permutations built, and only for the shortlist. Distinct
    // arrangements only: two different words reaching the same wing permutation are
    // the same position, and keeping both wastes the beam.
    const seen = new Set<string>();
    beam = [];
    for (const candidate of shortlist) {
      const wings = compose(candidate.node, candidate.generator);
      const key = wings.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      beam.push({
        wings,
        moves: candidate.moves,
        path: [...candidate.node.path, candidate.generator],
      });
      if (beam.length >= PAIRING_BEAM_WIDTH) break;
    }
  }

  if (!best) return undefined;

  const moves: number[] = [];
  for (const generator of best.path) moves.push(...library[generator]!.moves);
  return {
    moves,
    wingPermutation: [...best.wings],
    steps: best.path.length,
  };
}

/**
 * Pairs every edge: by search over the library, falling back to the greedy.
 *
 * 🔴 The fallback is not defensive tidiness. A pairing that quietly failed on some
 * subset of states, with generation redrawing in response, would produce a
 * distribution uniform only *conditional on solvability* — and the excluded set
 * would be invisible to any statistical test on the output. So the search may
 * decline, the greedy may not, and `PairingStalledError` still means what it always
 * meant.
 */
export function pairWings444(state: Cube444State, maxSteps = 40): PairingResult {
  return searchPairing(state) ?? greedyPairWings444(state, maxSteps);
}

/**
 * Pairs every edge, greedily: at each step take the generator that pairs the most
 * additional edges, breaking ties toward the shorter sequence.
 *
 * Scans the whole library each step: 1,872 applications of a 24-entry permutation,
 * which is nothing.
 *
 * Kept as the fallback rather than replaced, because it is the *total* one — its
 * depth-2 rescue leaves the last-two-edges stall that `searchPairing` walks into.
 */
export function greedyPairWings444(state: Cube444State, maxSteps = 40): PairingResult {
  const library = extendedLibrary();
  let wings = [...state.wingPermutation];
  const moves: number[] = [];
  let steps = 0;

  while (!areAllEdgesPaired(wings)) {
    if (steps >= maxSteps) throw new PairingStalledError(pairedEdgeCount(wings));

    const current = pairedEdgeCount(wings);
    let best: { generator: Conjugate444; paired: number } | undefined;

    for (const generator of library) {
      const paired = pairedEdgeCount(applyGenerator(wings, generator));
      if (paired <= current) continue;
      if (
        !best ||
        paired > best.paired ||
        (paired === best.paired && generator.moves.length < best.generator.moves.length)
      ) {
        best = { generator, paired };
      }
      // Pairing three more edges at once is the most a support-6 generator can do,
      // so there is nothing better to find.
      if (paired === current + 3) break;
    }

    if (best) {
      wings = applyGenerator(wings, best.generator);
      moves.push(...best.generator.moves);
      steps += 1;
      continue;
    }

    // No single generator improves. Look one further: some generator that makes
    // things no worse, followed by one that improves.
    const rescue = lookAhead(library, wings, current);
    if (!rescue) throw new PairingStalledError(current);
    for (const generator of rescue) {
      wings = applyGenerator(wings, generator);
      moves.push(...generator.moves);
      steps += 1;
    }
  }

  return { moves, wingPermutation: wings, steps };
}

/**
 * The depth-2 rescue, for the position greedy cannot leave.
 *
 * Greedy stalls in the last-two-edges shape: ten edges paired, and every generator
 * that touches the remaining two breaks one of the ten. The way out is a pair of
 * generators — the first allowed to *lose* ground, the second required to end above
 * where the first began.
 *
 * Two things keep this affordable. Only generators that leave the count no worse
 * than `current - 3` are worth extending, which throws away almost all of the
 * 1,872; and the second leg stops at the first genuine improvement, since any
 * improvement breaks the stall and greedy takes over again.
 *
 * This is a heuristic escape, not a proof of totality. Checkpoint G proves a
 * solution exists; if this ever fails to find one the loop still throws rather than
 * redrawing, so the gap would surface as an error and not as a silent bias.
 */
function lookAhead(
  library: readonly Conjugate444[],
  wings: readonly number[],
  current: number,
): Conjugate444[] | undefined {
  const candidates = library
    .map((generator) => ({ generator, wings: applyGenerator(wings, generator) }))
    .map((step) => ({ ...step, paired: pairedEdgeCount(step.wings) }))
    .filter((step) => step.paired >= current - 3)
    .sort((a, b) => b.paired - a.paired || a.generator.moves.length - b.generator.moves.length);

  for (const first of candidates) {
    for (const second of library) {
      if (pairedEdgeCount(applyGenerator(first.wings, second)) > current) {
        return [first.generator, second];
      }
    }
  }
  return undefined;
}
