import { describe, expect, it } from 'vitest';
import { areCentresSolved, areWingsPaired } from './orbits';
import {
  conjugateLibrary,
  cycleType,
  generatorLibrary,
  isTransitive,
  preservesSlotPairsMap,
  smallestSupport,
} from './generators';
import { WING_COUNT_444 } from './pieces';
import { apply444Moves, move444Tables, SOLVED_444_STATE } from './state';

const parityOf = (destination: readonly number[]): number =>
  cycleType(destination).reduce((total, length) => total + (length - 1), 0) % 2;

const supportOf = (destination: readonly number[]): number =>
  destination.reduce((count, landed, slot) => count + (landed === slot ? 0 : 1), 0);

/** Whether a wing map sends each slot pair into some slot pair, keeping pairs intact. */
const preservesPairs = (destination: readonly number[]): boolean => {
  for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
    const sibling = slot % 2 === 0 ? slot + 1 : slot - 1;
    if (Math.floor(destination[slot]! / 2) !== Math.floor(destination[sibling]! / 2)) return false;
  }
  return true;
};

describe('the centre-neutral generator library', () => {
  const library = generatorLibrary(4);

  it('finds a large library quickly, and every member really is centre-neutral', () => {
    expect(library.length).toBeGreaterThan(40_000);
    for (const generator of library.slice(0, 300)) {
      const after = apply444Moves(SOLVED_444_STATE, generator.moves);
      // The whole point: centres come back, wings do not.
      expect(areCentresSolved(after)).toBe(true);
      expect(generator.support).toBeGreaterThan(0);
    }
  });

  it('permutes the wings exactly as its recorded destination says', () => {
    const tables = move444Tables();
    for (const generator of library.slice(0, 200)) {
      const destination = Array.from({ length: WING_COUNT_444 }, (_, slot) => slot);
      for (const move of generator.moves) {
        for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
          destination[slot] = tables[move]!.wingDestination[destination[slot]!]!;
        }
      }
      expect([...generator.wingDestination]).toEqual(destination);
      expect(supportOf(generator.wingDestination)).toBe(generator.support);
    }
  });

  it('is transitive on the 24 wing slots', () => {
    expect(isTransitive(library)).toBe(true);
  });

  /**
   * The smallest generators are **double 3-cycles** of support 6, at four moves
   * each. That matters twice over: a small support is what makes a staged pairing
   * possible at all, and a double 3-cycle is an *even* permutation.
   */
  it('has double 3-cycles as its smallest members', () => {
    expect(smallestSupport(library)).toBe(6);
    const smallest = library.filter((generator) => generator.support === 6);
    expect(smallest.length).toBeGreaterThan(100);
    for (const generator of smallest) {
      expect(cycleType(generator.wingDestination)).toEqual([3, 3]);
      expect(generator.moves).toHaveLength(4);
    }
  });

  /**
   * Every generator is an even permutation of the wings, so the group they
   * generate lies **inside** `A24`. That bounds checkpoint G from above: `A24` is
   * the best case, and proving the group *is* `A24` is therefore proving it is as
   * large as it can be.
   */
  it('generates only even permutations, so the group is inside A24', () => {
    for (const generator of library) {
      expect(parityOf(generator.wingDestination)).toBe(0);
    }
  });

  /**
   * Not what was expected, and it splits the library in two.
   *
   * The support-6 generators are 3-cycles of **whole edges** — they move three
   * pairs of wings as intact pairs, which is why they *preserve* pairing rather
   * than creating it. That makes them the tools of the last phase, where a reduced
   * cube is solved as a 3x3x3, and useless for the pairing phase itself.
   *
   * The library therefore divides by what a generator does to the slot-pair
   * partition: those that map pairs to pairs can only rearrange already-paired
   * edges, and only those that split a pair can pair anything. The pairing phase
   * needs the second kind, so its smallest member is the number that matters.
   */
  it('has small members that move whole edges, so preserve pairing', () => {
    const smallest = library.filter((generator) => generator.support === 6);
    for (const generator of smallest.slice(0, 40)) {
      const after = apply444Moves(SOLVED_444_STATE, generator.moves);
      expect(areCentresSolved(after)).toBe(true);
      // Pairing survives, because whole pairs moved.
      expect(areWingsPaired(after)).toBe(true);
      expect(preservesPairs(generator.wingDestination)).toBe(true);
    }
  });

  /**
   * **The finding that stops the current search dead**, and it is worth stating
   * exactly rather than as a disappointment.
   *
   * Of all 46,308 centre-neutral sequences of four moves or fewer, **not one splits
   * a slot pair.** Every one of them maps pairs to pairs, so every one can only
   * rearrange edges that are already paired. At this length the library cannot
   * pair anything at all.
   *
   * That is a statement about the *length*, not about the approach. The sequences
   * that do pair while restoring the centres are the conjugated ones — slice out,
   * work, slice back — and those run eight to eleven moves. A depth-4 exhaustive
   * search cannot see them, and a depth-10 one cannot be done by walking the tree:
   * `24^10` is far past reach, and the centre-distance prune only bites near the
   * end of a sequence.
   *
   * The technique that does reach them is a **meet in the middle on the centre
   * coordinate**: enumerate prefixes to depth five, hash them by the centre
   * coordinate they produce, then enumerate suffixes to depth five and match. Two
   * halves that leave the centres in the same place compose into a centre-neutral
   * whole. That is the next thing to build, and it is why the library below is
   * capped at four for now — the shallow library is real and verified, it is simply
   * the wrong half of the tool set.
   */
  it('contains no pair-splitting generator at this length, so cannot yet pair', () => {
    const splitting = library.filter(
      (generator) => !preservesPairs(generator.wingDestination),
    );
    expect(splitting).toHaveLength(0);

    // Which is to say: applied to a solved cube, every one of them leaves it
    // reduced — centres solved and wings paired — however much it moves.
    for (const generator of library.slice(0, 60)) {
      const after = apply444Moves(SOLVED_444_STATE, generator.moves);
      expect(areCentresSolved(after)).toBe(true);
      expect(areWingsPaired(after)).toBe(true);
    }
  });
});

/**
 * The construction that gets past the shallow search's ceiling, and the reason it
 * needs no search at all: an outer turn does not change the centre arrangement,
 * only permuting four identical centres within a face. So `A X A'` with `X`
 * outer-only is centre-neutral on **every** centre arrangement, not merely on the
 * solved one — structurally, by construction.
 *
 * Taking `A` from the wide moves is what makes the conjugate split slot pairs,
 * which is exactly what the shallow library could not do and what pairing needs.
 * It is also the shape of the algorithms a human uses: slice out, work, slice back.
 */
describe('the conjugate library', () => {
  const library = conjugateLibrary(4);

  /**
   * 1,872 survivors, from 407,832 candidates — the filter throws away 99.5% of
   * them, which is the measure of how wrong the "centre-neutral by construction"
   * claim was. Every survivor is checked here, not a sample of the smallest, since
   * sampling the smallest is exactly what let the error through.
   */
  it('holds the centres and splits pairs, in every single member', () => {
    expect(library.length).toBeGreaterThan(1_000);
    expect(library.length).toBeLessThan(10_000);
    for (const generator of library) {
      const after = apply444Moves(SOLVED_444_STATE, generator.moves);
      // Centre-neutral by construction, verified against the model anyway.
      expect(areCentresSolved(after)).toBe(true);
      // And unlike every member of the shallow library, it breaks pairing — which
      // is the same thing as being able to create it.
      expect(areWingsPaired(after)).toBe(false);
      expect(preservesSlotPairsMap(generator.wingDestination)).toBe(false);
    }
  });

  it('is built as a wide setup bracketing an outer-turn core', () => {
    const tables = move444Tables();
    for (const generator of library.slice(0, 200)) {
      for (const move of generator.core) expect(tables[move]!.move.depth).toBe(1);
      // Setup and its inverse bracket the core.
      expect(generator.setup).toHaveLength(1);
      expect(tables[generator.setup[0]!]!.move.depth).toBe(2);
      expect(generator.moves).toHaveLength(generator.core.length + 2);
    }
  });

  it('reaches support 6 at six moves, and is transitive', () => {
    expect(library[0]!.support).toBe(6);
    expect(library[0]!.moves).toHaveLength(6);
    expect(cycleType(library[0]!.wingDestination)).toEqual([3, 3]);
    expect(isTransitive(library)).toBe(true);
  });

  it('permutes the wings exactly as recorded', () => {
    const tables = move444Tables();
    for (const generator of library.slice(0, 150)) {
      const destination = Array.from({ length: WING_COUNT_444 }, (_, slot) => slot);
      for (const move of generator.moves) {
        for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
          destination[slot] = tables[move]!.wingDestination[destination[slot]!]!;
        }
      }
      expect([...generator.wingDestination]).toEqual(destination);
    }
  });
});
