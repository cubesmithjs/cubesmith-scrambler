import { describe, expect, it } from 'vitest';
import { conjugateLibrary, cycleType } from './generators';
import { WING_COUNT_444 } from './pieces';

/**
 * **Checkpoint G** of `docs/444-design.md`: the generator library is sufficient to
 * reach every valid edge-pairing configuration.
 *
 * The design allowed three kinds of evidence and preferred a proof with a
 * computational input. That is what this is. The proof has four steps, each either
 * a classical theorem or a computation small enough to run here:
 *
 * 1. **The group lies inside `A24`.** Every generator is an even permutation of the
 *    wings, so nothing they generate is odd.
 * 2. **The group is primitive**, shown by the stronger property that it is
 *    2-transitive: the orbit of an ordered pair of wing slots is *all* `24 x 23`
 *    ordered pairs.
 * 3. **The group contains a 3-cycle**, exhibited as a product of two support-6
 *    generators.
 * 4. **Jordan's theorem**: a primitive group of degree `n` containing a 3-cycle
 *    contains `A_n`. With (1) that forces the group to be **exactly `A24`**.
 *
 * Completeness then follows in two lines. `A24` acting on any arrangement reaches
 * every arrangement of the same parity; and paired arrangements exist in **both**
 * parities, since swapping the two wings inside one slot pair keeps an arrangement
 * paired while flipping its parity. So whatever parity the drawn state has, a
 * paired arrangement of that parity is reachable.
 *
 * Which is what makes the staged pairing total — and, per §11, that totality is a
 * *uniformity* requirement and not merely a reliability one: a solver that failed
 * on some states would silently condition the distribution.
 */

const WINGS = WING_COUNT_444;

const compose = (first: readonly number[], second: readonly number[]): number[] =>
  Array.from({ length: WINGS }, (_, slot) => second[first[slot]!]!);

const invert = (destination: readonly number[]): number[] => {
  const inverse = new Array<number>(WINGS).fill(-1);
  destination.forEach((landed, slot) => {
    inverse[landed] = slot;
  });
  return inverse;
};

const supportOf = (destination: readonly number[]): number =>
  destination.reduce((count, landed, slot) => count + (landed === slot ? 0 : 1), 0);

const parityOf = (destination: readonly number[]): number =>
  cycleType(destination).reduce((total, length) => total + (length - 1), 0) % 2;

describe('checkpoint G: the generator library is complete', () => {
  const library = conjugateLibrary(4);
  const smallest = library.filter((generator) => generator.support === 6);

  it('step 1 — every generator is even, so the group lies inside A24', () => {
    expect(library.length).toBeGreaterThan(100_000);
    for (const generator of library) {
      expect(parityOf(generator.wingDestination)).toBe(0);
    }
  });

  /**
   * 2-transitivity implies primitivity, and is cheaper to check than primitivity
   * directly: a group that can carry any ordered pair of points to any other has no
   * non-trivial invariant partition to preserve.
   */
  it('step 2 — the group is 2-transitive on the 24 wings, hence primitive', () => {
    const key = (a: number, b: number): number => a * WINGS + b;
    const seen = new Set<number>([key(0, 1)]);
    const queue: [number, number][] = [[0, 1]];

    for (let head = 0; head < queue.length; head += 1) {
      const [a, b] = queue[head]!;
      for (const generator of library) {
        const landed: [number, number] = [
          generator.wingDestination[a]!,
          generator.wingDestination[b]!,
        ];
        if (seen.has(key(landed[0], landed[1]))) continue;
        seen.add(key(landed[0], landed[1]));
        queue.push(landed);
      }
    }

    // All ordered pairs of distinct slots.
    expect(seen.size).toBe(WINGS * (WINGS - 1));
  });

  it('step 3 — the group contains a bare 3-cycle', () => {
    expect(smallest.length).toBeGreaterThan(1_000);

    let threeCycle: number[] | undefined;
    outer: for (const first of smallest) {
      const inverse = invert(first.wingDestination);
      for (const second of smallest) {
        const product = compose(second.wingDestination, inverse);
        if (supportOf(product) !== 3) continue;
        threeCycle = product;
        break outer;
      }
    }

    expect(threeCycle).toBeDefined();
    expect(cycleType(threeCycle!)).toEqual([3]);
    // A 3-cycle is even, as it must be for step 1 to hold of the whole group.
    expect(parityOf(threeCycle!)).toBe(0);
  });

  /**
   * Step 4 is Jordan's theorem, which is not something a test can run. What a test
   * *can* do is pin the two facts the conclusion rests on, so that if either ever
   * stops holding the conclusion is not quietly left standing: paired arrangements
   * exist in both parities, and swapping within one slot pair is what produces the
   * odd one.
   */
  it('step 4 — paired arrangements exist in both parities, so either parity can land', () => {
    const identity = Array.from({ length: WINGS }, (_, slot) => slot);
    const isPaired = (arrangement: readonly number[]): boolean => {
      for (let edge = 0; edge < WINGS / 2; edge += 1) {
        const first = arrangement[2 * edge]!;
        const second = arrangement[2 * edge + 1]!;
        if (Math.floor(first / 2) !== Math.floor(second / 2)) return false;
      }
      return true;
    };

    expect(isPaired(identity)).toBe(true);
    expect(parityOf(identity)).toBe(0);

    // Swap the two wings inside one slot pair: still paired, parity flipped.
    const swapped = [...identity];
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    expect(isPaired(swapped)).toBe(true);
    expect(parityOf(swapped)).toBe(1);
  });

  /**
   * The conclusion, restated as the property the pairing phase will rely on: from
   * any wing arrangement, some paired arrangement is reachable. Steps 1-4 prove it;
   * this records what it means so the next phase can cite it rather than re-derive
   * it.
   */
  it('concludes that pairing is reachable from any arrangement', () => {
    // The group is A24 (steps 1-4), so it reaches every arrangement of the same
    // parity as the one it starts from, and both parities contain paired
    // arrangements (step 4). Nothing is left to check at runtime; this test exists
    // to fail loudly if any input to that argument is edited away.
    const library1 = conjugateLibrary(4);
    expect(library1.length).toBeGreaterThan(100_000);
    expect(library1.every((generator) => parityOf(generator.wingDestination) === 0)).toBe(true);
  });
});
