import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { CLOCK_CORNERS, CLOCK_HOURS } from './notation';
import { clockSolveDistanceCappedAtTwo, randomClockState } from './random-state';
import {
  applyClockTurn,
  cornerReadingsConsistent,
  fromClockVector,
  isSolvedClock,
  SOLVED_CLOCK_STATE,
  toClockVector,
} from './state';
import { CLOCK_DIMENSION } from './template';

describe('randomClockState', () => {
  it('produces a mechanically consistent state every time', () => {
    const random = createRandomSource('clock-random-consistency');
    for (let trial = 0; trial < 5_000; trial += 1) {
      const state = randomClockState(random);
      expect(cornerReadingsConsistent(state)).toBe(true);
      expect(state.front.every((v) => v >= 0 && v < CLOCK_HOURS)).toBe(true);
      expect(state.back.every((v) => v >= 0 && v < CLOCK_HOURS)).toBe(true);
    }
  });

  /**
   * Uniformity needs no rejection or repair here: `template.test.ts` shows
   * the fourteen amounts are a bijection onto the state space, so fourteen
   * independent uniform hours *is* a uniform state. These checks confirm the
   * marginals rather than establishing the argument.
   */
  it('every dial is uniform over the twelve hours', () => {
    const random = createRandomSource('clock-uniform-dials');
    const DRAWS = 120_000;
    const counts = Array.from({ length: CLOCK_DIMENSION }, () =>
      new Array<number>(CLOCK_HOURS).fill(0),
    );
    for (let trial = 0; trial < DRAWS; trial += 1) {
      toClockVector(randomClockState(random)).forEach((hours, i) => {
        counts[i]![hours]! += 1;
      });
    }
    const expected = DRAWS / CLOCK_HOURS;
    for (const dial of counts) {
      for (const count of dial) {
        expect(count).toBeGreaterThan(expected * 0.9);
        expect(count).toBeLessThan(expected * 1.1);
      }
    }
  });

  it('all sixteen pin configurations occur, roughly evenly', () => {
    const random = createRandomSource('clock-uniform-pins');
    const DRAWS = 60_000;
    const counts = new Map<string, number>();
    for (let trial = 0; trial < DRAWS; trial += 1) {
      const { pinsUp } = randomClockState(random);
      const key = CLOCK_CORNERS.map((c) => (pinsUp[c] ? 'U' : 'd')).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(16);
    const expected = DRAWS / 16;
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.85);
      expect(count).toBeLessThan(expected * 1.15);
    }
  });

  it('is deterministic given a seed', () => {
    expect(randomClockState(createRandomSource('same'))).toEqual(
      randomClockState(createRandomSource('same')),
    );
  });
});

describe('clockSolveDistanceCappedAtTwo', () => {
  it('is 0 for solved, whatever the pins are doing', () => {
    expect(clockSolveDistanceCappedAtTwo(SOLVED_CLOCK_STATE)).toBe(0);
    expect(
      clockSolveDistanceCappedAtTwo({
        ...SOLVED_CLOCK_STATE,
        pinsUp: { UR: true, DR: true, DL: false, UL: true },
      }),
    ).toBe(0);
  });

  /**
   * The exhaustive half of the check: every state a single turn can reach
   * must score 1. That covers all fifteen non-empty pin configurations on
   * both sides at all eleven non-zero amounts, including the six
   * configurations the notation has no token for.
   */
  it('is 1 for every state one turn can reach — all 15 configurations, both sides', () => {
    for (let mask = 1; mask < 16; mask += 1) {
      const geared = CLOCK_CORNERS.filter((_, i) => (mask & (1 << i)) !== 0);
      for (const flipped of [false, true]) {
        for (let amount = 1; amount < CLOCK_HOURS; amount += 1) {
          const state = applyClockTurn(SOLVED_CLOCK_STATE, geared, amount, flipped);
          expect(isSolvedClock(state)).toBe(false);
          expect(clockSolveDistanceCappedAtTwo(state)).toBe(1);
        }
      }
    }
  });

  it('is 2 for a state that needs two turns', () => {
    // One front turn and one back turn on disjoint dial sets cannot be a
    // single turn: no configuration drives both a front and a back
    // non-corner dial.
    const twoTurns = applyClockTurn(
      applyClockTurn(SOLVED_CLOCK_STATE, ['UL'], 3, false),
      ['DR'],
      5,
      true,
    );
    expect(clockSolveDistanceCappedAtTwo(twoTurns)).toBe(2);
  });

  it('is 2 for essentially every random state', () => {
    // Fewer than 330 of the 1.28 x 10^15 states fail, so this is what the
    // Regulation 4b3 filter does in practice: nothing.
    const random = createRandomSource('clock-capped-distance');
    for (let trial = 0; trial < 5_000; trial += 1) {
      expect(clockSolveDistanceCappedAtTwo(randomClockState(random))).toBe(2);
    }
  });

  it('the one-turn set is small, which is why the cap can be exact', () => {
    // 15 configurations x 2 sides x 11 amounts, before de-duplication.
    const keys = new Set<string>();
    for (let mask = 1; mask < 16; mask += 1) {
      const geared = CLOCK_CORNERS.filter((_, i) => (mask & (1 << i)) !== 0);
      for (const flipped of [false, true]) {
        for (let amount = 1; amount < CLOCK_HOURS; amount += 1) {
          const s = applyClockTurn(SOLVED_CLOCK_STATE, geared, amount, flipped);
          keys.add(toClockVector(s).join(','));
        }
      }
    }
    expect(keys.size).toBeLessThanOrEqual(15 * 2 * 11);
    expect(keys.has(toClockVector(fromClockVector(new Array<number>(14).fill(0))).join(','))).toBe(
      false,
    );
  });
});
