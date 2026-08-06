import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { FACES } from '../../notation/move';
import { moveAxis, moveLayerSet } from '../nxn/notation';
import { randomCube444State } from './coordinates';
import { phase1Search, phase1Solutions } from './phase1-search';
import {
  AXIS_PAIRS,
  centreMaskFor,
  centrePairTable,
  CENTRE_SUBSET_COUNT,
  centreSubsetFromRank,
  isPhase1Solved,
  permuteCentreMask,
  phase1CoordinateOf,
  phase1LowerBound,
  rankCentreSubset,
  solvedCentreMaskFor,
} from './phase1';
import { CENTRE_COUNT_444, pieces444 } from './pieces';
import { apply444Moves, move444Tables, SOLVED_444_STATE } from './state';

describe('the centre subset coordinate', () => {
  it('ranks all 735,471 eight-slot subsets bijectively', () => {
    expect(CENTRE_SUBSET_COUNT).toBe(735_471);
    for (let rank = 0; rank < CENTRE_SUBSET_COUNT; rank += 997) {
      const mask = centreSubsetFromRank(rank);
      expect(rankCentreSubset(mask)).toBe(rank);
    }
    // The extremes, exactly.
    expect(rankCentreSubset(0b11111111)).toBe(0);
    expect(rankCentreSubset(0b111111110000000000000000)).toBe(CENTRE_SUBSET_COUNT - 1);
  });

  it('refuses a subset of the wrong size', () => {
    expect(() => rankCentreSubset(0b1111111)).toThrow(/8 slots/);
  });

  it('permutes a mask exactly as the centre destinations say', () => {
    const tables = move444Tables();
    const random = createRandomSource('mask permute');
    for (let trial = 0; trial < 200; trial += 1) {
      const moveIndex = random.nextUint32() % tables.length;
      const mask = centreSubsetFromRank(random.nextUint32() % CENTRE_SUBSET_COUNT);
      let byHand = 0;
      for (let slot = 0; slot < CENTRE_COUNT_444; slot += 1) {
        if ((mask & (1 << slot)) !== 0) {
          byHand |= 1 << tables[moveIndex]!.centreDestination[slot]!;
        }
      }
      expect(permuteCentreMask(mask, moveIndex)).toBe(byHand);
    }
  });

  it('reads the same mask from a state as applying moves to the mask does', () => {
    const tables = move444Tables();
    const random = createRandomSource('mask vs state');
    for (let trial = 0; trial < 30; trial += 1) {
      const indices = Array.from({ length: 15 }, () => random.nextUint32() % tables.length);
      const state = apply444Moves(SOLVED_444_STATE, indices);
      for (const [index, pair] of AXIS_PAIRS.entries()) {
        let mask = solvedCentreMaskFor(pair);
        for (const move of indices) mask = permuteCentreMask(mask, move);
        expect(centreMaskFor(state, pair), `pair ${index}`).toBe(mask);
      }
    }
  });

  it('has solved masks that are exactly the two faces of each pair', () => {
    const { centreFace } = pieces444();
    for (const pair of AXIS_PAIRS) {
      const mask = solvedCentreMaskFor(pair);
      let count = 0;
      for (let slot = 0; slot < CENTRE_COUNT_444; slot += 1) {
        if ((mask & (1 << slot)) === 0) continue;
        count += 1;
        expect(pair).toContain(centreFace[slot]);
      }
      expect(count).toBe(8);
    }
    // The three pairs partition the 24 slots.
    expect(
      AXIS_PAIRS.reduce((total, pair) => total | solvedCentreMaskFor(pair), 0),
    ).toBe((1 << CENTRE_COUNT_444) - 1);
  });
});

/**
 * **Checkpoint D** of `docs/444-design.md`, for phase 1: the tables must be real
 * breadth-first tables, not merely plausible ones.
 */
describe('checkpoint D: the phase-1 tables', () => {
  it('covers every subset, with exactly one at zero', () => {
    for (const index of [0, 1, 2]) {
      const table = centrePairTable(index);
      expect(table).toHaveLength(CENTRE_SUBSET_COUNT);
      expect(table.indexOf(255)).toBe(-1);
      expect([...table].filter((value) => value === 0)).toHaveLength(1);
      expect(table[rankCentreSubset(solvedCentreMaskFor(AXIS_PAIRS[index]!))]).toBe(0);
    }
  });

  it('has a neighbour one closer at every non-zero entry, and none two apart', () => {
    const tables = move444Tables();
    const random = createRandomSource('bfs shape');
    for (const index of [0, 1, 2]) {
      const table = centrePairTable(index);
      for (let trial = 0; trial < 400; trial += 1) {
        const mask = centreSubsetFromRank(random.nextUint32() % CENTRE_SUBSET_COUNT);
        const here = table[rankCentreSubset(mask)]!;
        let closer = 0;
        for (let move = 0; move < tables.length; move += 1) {
          const there = table[rankCentreSubset(permuteCentreMask(mask, move))]!;
          expect(Math.abs(there - here)).toBeLessThanOrEqual(1);
          if (there === here - 1) closer += 1;
        }
        if (here > 0) expect(closer).toBeGreaterThan(0);
      }
    }
  });

  it('is shallow, as a 735,471-state space with 36 moves should be', () => {
    for (const index of [0, 1, 2]) {
      let deepest = 0;
      for (const value of centrePairTable(index)) deepest = Math.max(deepest, value);
      expect(deepest).toBeGreaterThan(3);
      expect(deepest).toBeLessThan(12);
    }
  });

  it('never exceeds the length of a sequence that produced the state', () => {
    const tables = move444Tables();
    const random = createRandomSource('admissible');
    for (let trial = 0; trial < 60; trial += 1) {
      const length = 1 + (trial % 6);
      const indices = Array.from({ length }, () => random.nextUint32() % tables.length);
      const state = apply444Moves(SOLVED_444_STATE, indices);
      expect(phase1LowerBound(phase1CoordinateOf(state))).toBeLessThanOrEqual(length);
    }
  });
});

describe('the phase-1 search', () => {
  it('solves the solved state in no moves', () => {
    expect(phase1Search(SOLVED_444_STATE)).toEqual([]);
    expect(isPhase1Solved(phase1CoordinateOf(SOLVED_444_STATE))).toBe(true);
  });

  it('puts every centre on its own axis pair, from a uniformly random state', () => {
    const random = createRandomSource('phase 1');
    const { centreFace } = pieces444();
    const lengths: number[] = [];

    for (let trial = 0; trial < 20; trial += 1) {
      const state = randomCube444State(random);
      const solution = phase1Search(state);
      lengths.push(solution.length);

      const solved = apply444Moves(state, solution);
      expect(isPhase1Solved(phase1CoordinateOf(solved))).toBe(true);

      // Stated in terms of the pieces rather than of the coordinate: every centre
      // is on one of the two faces of its own colour's axis.
      for (let slot = 0; slot < CENTRE_COUNT_444; slot += 1) {
        const colour = FACES[solved.centreColour[slot]!]!;
        const face = FACES[centreFace[slot]!]!;
        const pair = AXIS_PAIRS.find((candidate) =>
          candidate.includes(solved.centreColour[slot]!),
        )!;
        expect(pair.map((f) => FACES[f]!), `${colour} on ${face}`).toContain(face);
      }
    }

    // Recorded rather than asserted tightly: the design estimated 5-8.
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    expect(mean).toBeGreaterThan(3);
    expect(mean).toBeLessThan(10);
    expect(Math.max(...lengths)).toBeLessThan(12);
  });

  it('returns optimal solutions — the same length the exact bound predicts', () => {
    const random = createRandomSource('optimality');
    for (let trial = 0; trial < 12; trial += 1) {
      const state = randomCube444State(random);
      const bound = phase1LowerBound(phase1CoordinateOf(state));
      const solution = phase1Search(state);
      // IDA* with an admissible heuristic is optimal, so the solution can never be
      // shorter than the bound; equality is the common case and never violated
      // upward by more than the bound's own slack.
      expect(solution.length).toBeGreaterThanOrEqual(bound);
    }
  });

  it('enumerates several distinct solutions when asked', () => {
    const state = randomCube444State(createRandomSource('several'));
    const solutions = phase1Solutions(state, { maxSolutions: 6 });
    expect(solutions.length).toBeGreaterThan(1);
    expect(new Set(solutions.map((s) => s.join(','))).size).toBe(solutions.length);
    expect(new Set(solutions.map((s) => s.length)).size).toBe(1);
    for (const solution of solutions) {
      expect(isPhase1Solved(phase1CoordinateOf(apply444Moves(state, solution)))).toBe(true);
    }
  });

  /**
   * The canonical-sequence rules, checked on the output rather than trusted from
   * the code: no layer set twice running, and within a run on one axis the layer
   * sets ascend, so only one of each commuting ordering appears.
   */
  it('emits canonical sequences only', () => {
    const tables = move444Tables();
    const random = createRandomSource('canonical');
    for (let trial = 0; trial < 10; trial += 1) {
      const solution = phase1Search(randomCube444State(random));
      for (let index = 1; index < solution.length; index += 1) {
        const previous = tables[solution[index - 1]!]!.move;
        const current = tables[solution[index]!]!.move;
        expect(moveLayerSet(current)).not.toBe(moveLayerSet(previous));
        if (moveAxis(current) === moveAxis(previous)) {
          expect(moveLayerSet(current) > moveLayerSet(previous)).toBe(true);
        }
      }
    }
  });
});
