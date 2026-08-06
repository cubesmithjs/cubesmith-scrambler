import { conjugateLibrary, type Conjugate444 } from './generators';
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
      `@cube/scrambler: 4x4x4 pairing stalled with ${paired} of 12 edges paired — ` +
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
 * Pairs every edge, greedily: at each step take the generator that pairs the most
 * additional edges, breaking ties toward the shorter sequence.
 *
 * Scans the whole library each step: 1,872 applications of a 24-entry permutation,
 * which is nothing.
 */
export function pairWings444(state: Cube444State, maxSteps = 40): PairingResult {
  const library = conjugateLibrary(4);
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

    if (!best) throw new PairingStalledError(current);

    wings = applyGenerator(wings, best.generator);
    moves.push(...best.generator.moves);
    steps += 1;
  }

  return { moves, wingPermutation: wings, steps };
}
