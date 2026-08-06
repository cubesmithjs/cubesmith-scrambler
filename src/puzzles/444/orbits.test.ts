import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { wideMoveToString } from '../nxn/notation';
import { randomCube444State } from './coordinates';
import {
  areCentresSolved,
  areWingsPaired,
  centrePreservingMoveIndices,
  centresOnOwnAxisPair,
  isReduced,
  outerMoveIndices,
  wingOrbitSizes,
} from './orbits';
import { phase1Search } from './phase1-search';
import { apply444Moves, move444Tables, SOLVED_444_STATE } from './state';

/**
 * `docs/444-design.md` §9's first open question, answered — and answered against
 * the expectation that prompted it, which is exactly why it was listed as a
 * question rather than written down as a fact.
 */
describe('the wing orbits', () => {
  const all = move444Tables().map((_, index) => index);

  it('is a single orbit of 24 under every move set, not two of twelve', () => {
    expect(wingOrbitSizes(all)).toEqual([24]);
    expect(wingOrbitSizes(centrePreservingMoveIndices())).toEqual([24]);
    expect(wingOrbitSizes(outerMoveIndices())).toEqual([24]);
  });

  /**
   * The counterexample to the intuition, stated concretely: `U2` sends one wing of
   * the UR edge to the *other* wing's slot family on UL, so even the outer turns
   * mix what looks like two handednesses. Unflippable in place is not the same as
   * confined to half the slots.
   */
  it('has an outer turn that moves a wing to its partner slot', () => {
    const tables = move444Tables();
    const half = tables.find((table) => wideMoveToString(table.move) === 'U2')!;
    const moved = [...Array(24).keys()].some(
      (slot) => half.wingDestination[slot]! % 2 !== slot % 2,
    );
    expect(moved).toBe(true);
  });
});

describe('the move sets', () => {
  it('counts 18 outer turns and 24 centre-preserving moves', () => {
    expect(outerMoveIndices()).toHaveLength(18);
    expect(centrePreservingMoveIndices()).toHaveLength(24);
  });

  /**
   * What phase 2 will be searched with: the moves that cannot undo phase 1. Every
   * one of them keeps each centre on its own axis pair, and every move outside the
   * set is a wide quarter turn, which can break it.
   */
  it('keeps centres on their axis pairs, and only those moves do', () => {
    const random = createRandomSource('centre preserving');
    const preserving = centrePreservingMoveIndices();

    for (let trial = 0; trial < 20; trial += 1) {
      const state = apply444Moves(
        SOLVED_444_STATE,
        Array.from({ length: 25 }, () => preserving[random.nextUint32() % preserving.length]!),
      );
      expect(centresOnOwnAxisPair(state)).toBe(true);
    }

    // And a wide quarter turn does break it, so the restriction is not vacuous.
    const tables = move444Tables();
    const wideQuarter = tables.findIndex(
      (table) => table.move.depth === 2 && table.move.amount !== 2,
    );
    expect(centresOnOwnAxisPair(apply444Moves(SOLVED_444_STATE, [wideQuarter]))).toBe(false);
  });

  /**
   * What the last phase relies on: an outer turn moves both wings of an edge
   * together, because both lie in the same two layers. That is why a reduced cube
   * behaves as a 3x3x3.
   */
  it('keeps wings paired under outer turns, once they are paired', () => {
    const random = createRandomSource('pairing preserved');
    const outer = outerMoveIndices();
    for (let trial = 0; trial < 20; trial += 1) {
      const state = apply444Moves(
        SOLVED_444_STATE,
        Array.from({ length: 30 }, () => outer[random.nextUint32() % outer.length]!),
      );
      expect(areWingsPaired(state)).toBe(true);
      expect(areCentresSolved(state)).toBe(true);
      expect(isReduced(state)).toBe(true);
    }
  });

  it('breaks pairing as soon as a wide quarter turn is used', () => {
    const tables = move444Tables();
    const wideQuarter = tables.findIndex(
      (table) => table.move.depth === 2 && table.move.amount !== 2,
    );
    expect(areWingsPaired(apply444Moves(SOLVED_444_STATE, [wideQuarter]))).toBe(false);
  });
});

describe('what phase 1 leaves for phase 2', () => {
  it('leaves the centres on their pairs but neither solved nor the wings paired', () => {
    const random = createRandomSource('after phase 1');
    let unsolvedCentres = 0;
    let unpaired = 0;

    for (let trial = 0; trial < 8; trial += 1) {
      const state = randomCube444State(random);
      const opened = apply444Moves(state, phase1Search(state));
      expect(centresOnOwnAxisPair(opened)).toBe(true);
      if (!areCentresSolved(opened)) unsolvedCentres += 1;
      if (!areWingsPaired(opened)) unpaired += 1;
    }

    // Phase 1 is not accidentally doing phase 2's work: the remaining distance is
    // real, which is what makes the next milestone the expensive one.
    expect(unsolvedCentres).toBeGreaterThan(6);
    expect(unpaired).toBe(8);
  });
});

/**
 * The constraints that decide what the remaining phases can look like. Each is a
 * fact about the model, measured here, and together they pin the order the last
 * two phases must come in — which is worth establishing before writing either,
 * given that the last architectural guess cost a whole phase.
 */
describe('what each move set can and cannot preserve', () => {
  const tables = move444Tables();
  const wideHalf = tables.findIndex(
    (table) => table.move.depth === 2 && table.move.amount === 2,
  );

  it('has wide half turns break solved centres, so only outer turns may follow them', () => {
    expect(areCentresSolved(SOLVED_444_STATE)).toBe(true);
    expect(areCentresSolved(apply444Moves(SOLVED_444_STATE, [wideHalf]))).toBe(false);
    // …while keeping every centre on its own axis pair, which is why the phase
    // before may use them.
    expect(centresOnOwnAxisPair(apply444Moves(SOLVED_444_STATE, [wideHalf]))).toBe(true);
  });

  it('has wide half turns break pairing too', () => {
    // Both wings of an edge in the turned layer travel together; an edge lying
    // across the cut has one wing in the inner slice and one outside it, so the
    // pair splits.
    expect(areWingsPaired(apply444Moves(SOLVED_444_STATE, [wideHalf]))).toBe(false);
  });

  /**
   * The consequence, and the question the next milestone opens with: since a wide
   * half turn breaks both solved centres *and* pairing, the only moves available
   * after either is established are the 18 outer turns. So either the reduction
   * establishes both at once, or the outer turns alone must suffice to finish
   * whichever comes second — and which of those is true is a question for
   * computation, not for assumption.
   */
  it('leaves the outer turns as the only moves that preserve both', () => {
    const random = createRandomSource('preserve both');
    const outer = outerMoveIndices();
    for (let trial = 0; trial < 10; trial += 1) {
      const state = apply444Moves(
        SOLVED_444_STATE,
        Array.from({ length: 20 }, () => outer[random.nextUint32() % outer.length]!),
      );
      expect(areCentresSolved(state)).toBe(true);
      expect(areWingsPaired(state)).toBe(true);
    }

    for (const [index, table] of tables.entries()) {
      if (table.move.depth === 1) continue;
      const after = apply444Moves(SOLVED_444_STATE, [index]);
      expect(areCentresSolved(after) && areWingsPaired(after)).toBe(false);
    }
  });
});
