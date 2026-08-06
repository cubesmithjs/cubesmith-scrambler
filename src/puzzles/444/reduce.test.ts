import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomCube444State } from './coordinates';
import { extendedLibrary, isCentreNeutral } from './generators';
import { areCentresSolved, areWingsPaired, isReduced } from './orbits';
import { areAllEdgesPaired, pairedEdgeCount, pairWings444 } from './pairing';
import { reduce444 } from './reduce';
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
