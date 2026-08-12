import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomCube444State } from './coordinates';
import { extendedLibrary, isCentreNeutral } from './generators';
import { areCentresSolved, areWingsPaired, isReduced } from './orbits';
import { areAllEdgesPaired, pairedEdgeCount, pairWings444 } from './pairing';
import { MAX_REDUCTION_ROUTES, reduce444, reduce444BestRoute } from './reduce';
import { parityOf444Handoff, to333State } from './handoff';
import { apply444Moves, SOLVED_444_STATE } from './state';

describe('the support-4 gadgets', () => {
  const library = extendedLibrary();

  it('exist, which the plain library cannot manage', () => {
    const gadgets = library.filter((generator) => generator.support === 4);
    expect(gadgets.length).toBeGreaterThan(0);
    // Support 4 and even can only be 2+2 -- a lone 4-cycle is odd.
    for (const gadget of gadgets.slice(0, 50)) {
      const swapped = gadget.wingDestination.filter((landed, slot) => landed !== slot);
      expect(swapped).toHaveLength(4);
    }
  });

  it('are still centre-neutral, being products of centre-neutral sequences', () => {
    for (const generator of library.filter((g) => g.support === 4)) {
      expect(isCentreNeutral(generator.moves)).toBe(true);
    }
  });

  it('keeps every member centre-neutral, checked over the whole library', () => {
    for (const generator of library) {
      expect(isCentreNeutral(generator.moves)).toBe(true);
    }
  });
});

describe('pairing the wings', () => {
  it('counts paired edges on the solved cube as twelve', () => {
    expect(pairedEdgeCount(SOLVED_444_STATE.wingPermutation)).toBe(12);
    expect(areAllEdgesPaired(SOLVED_444_STATE.wingPermutation)).toBe(true);
  });

  it('pairs every edge, and its own moves reproduce the arrangement it reports', () => {
    const random = createRandomSource('444 pairing');
    for (let trial = 0; trial < 3; trial += 1) {
      // Pairing only reads the wings, so it can be exercised on a raw draw; the
      // centres are made solved by the reduction before it is called for real.
      const state = randomCube444State(random);
      const result = pairWings444(state);
      expect(areAllEdgesPaired(result.wingPermutation)).toBe(true);
      // The reported permutation is what the moves actually do.
      const applied = apply444Moves(state, result.moves);
      expect(applied.wingPermutation).toEqual(result.wingPermutation);
    }
  });

  it('leaves the centres exactly as it found them', () => {
    const random = createRandomSource('444 pairing centres');
    const drawn = randomCube444State(random);
    // Start from solved centres, which is the contract pairing is called under.
    const state = { ...drawn, centreColour: SOLVED_444_STATE.centreColour };
    const result = pairWings444(state);
    expect(areCentresSolved(apply444Moves(state, result.moves))).toBe(true);
  });
});

describe('the reduction', () => {
  it('reduces a random state, and the moves it returns are what did it', () => {
    const random = createRandomSource('444 reduce');
    for (let trial = 0; trial < 3; trial += 1) {
      const state = randomCube444State(random);
      const reduction = reduce444(state);

      expect(isReduced(reduction.state)).toBe(true);
      expect(areCentresSolved(reduction.state)).toBe(true);
      expect(areWingsPaired(reduction.state)).toBe(true);
      // Replaying the whole sequence from the drawn state lands on the same place.
      expect(apply444Moves(state, reduction.moves)).toEqual(reduction.state);
    }
  });

  it('leaves an already-reduced cube reduced', () => {
    const reduction = reduce444(SOLVED_444_STATE);
    expect(isReduced(reduction.state)).toBe(true);
  });
});

/**
 * The route-choosing reduction, which is the largest single lever on 4x4x4 length.
 *
 * Which parity case a reduction lands in is a property of the **route**, not of the
 * state: measured over 10 states reduced 12 ways each (2026-08-12), 6 of them had a
 * route needing no parity work while their first route did.
 */
describe('reduce444BestRoute', () => {
  const passesFor = (state: Parameters<typeof to333State>[0]): number => {
    const parity = parityOf444Handoff(to333State(state));
    return parity === 'none' ? 0 : parity === 'permutation' ? 2 : 1;
  };

  it('still reduces, and the moves it returns are what did it', () => {
    const random = createRandomSource('444 best route');
    for (let trial = 0; trial < 3; trial += 1) {
      const state = randomCube444State(random);
      const reduction = reduce444BestRoute(state);
      expect(isReduced(reduction.state)).toBe(true);
      expect(apply444Moves(state, reduction.moves)).toEqual(reduction.state);
    }
  });

  /**
   * 🔴 The property that makes it worth its extra time: it is never a worse landing
   * than taking the first route, which is what `reduce444` does. A route is only
   * preferred when it costs strictly fewer parity passes, so this cannot regress.
   */
  it('never lands in a costlier parity case than the first route would', () => {
    const random = createRandomSource('444 best route not worse');
    for (let trial = 0; trial < 4; trial += 1) {
      const state = randomCube444State(random);
      expect(passesFor(reduce444BestRoute(state).state)).toBeLessThanOrEqual(
        passesFor(reduce444(state).state),
      );
    }
  });

  it('asks for no more routes than it is budgeted', () => {
    // A guard on the time this costs: the cap is what keeps a 4x4x4 solve seconds
    // rather than tens of seconds, and it is easy to raise by accident.
    expect(MAX_REDUCTION_ROUTES).toBeLessThanOrEqual(4);
  });
});
