import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../random/random-source';
import { randomInt } from '../utils/random-int';
import { drawStateAtLeastMovesFromSolved, solveAtLeastLength } from './scramble-shape';

describe('drawStateAtLeastMovesFromSolved', () => {
  it('only ever returns states at or beyond the minimum', () => {
    const random = createRandomSource('shape-minimum');
    for (let trial = 0; trial < 1_000; trial += 1) {
      const state = drawStateAtLeastMovesFromSolved(
        random,
        (r) => randomInt(r, 10),
        (n) => n,
        7,
      );
      expect(state).toBeGreaterThanOrEqual(7);
    }
  });

  /**
   * The regulation's parenthetical — "equal probability for each state" —
   * is the whole point, and rejection sampling is what preserves it: the
   * conditional distribution of a uniform draw is uniform on the condition.
   * A "clamp to the minimum" or "re-roll only the failing part" approach
   * would pile probability mass onto the boundary instead, which is exactly
   * what this checks against.
   */
  it('stays uniform over the states that qualify, rather than piling up at the boundary', () => {
    const random = createRandomSource('shape-uniformity');
    const DRAWS = 120_000;
    const counts = new Map<number, number>();
    for (let trial = 0; trial < DRAWS; trial += 1) {
      const state = drawStateAtLeastMovesFromSolved(random, (r) => randomInt(r, 10), (n) => n, 7);
      counts.set(state, (counts.get(state) ?? 0) + 1);
    }

    expect([...counts.keys()].sort()).toEqual([7, 8, 9]);
    const expected = DRAWS / 3;
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.95);
      expect(count).toBeLessThan(expected * 1.05);
    }
  });
});

describe('solveAtLeastLength', () => {
  it('returns the requested minimum length when a solution of that length exists', () => {
    const solution = solveAtLeastLength(5, 11, (length) => new Array<string>(length).fill('X'));
    expect(solution).toHaveLength(11);
  });

  it('never returns something shorter than the optimal solution', () => {
    const solution = solveAtLeastLength(20, 11, (length) => new Array<string>(length).fill('X'));
    expect(solution).toHaveLength(20);
  });

  it('steps up when no sequence of exactly the requested length exists', () => {
    const attempted: number[] = [];
    const solution = solveAtLeastLength(4, 11, (length) => {
      attempted.push(length);
      return length >= 13 ? new Array<string>(length).fill('X') : null;
    });
    expect(attempted).toEqual([11, 12, 13]);
    expect(solution).toHaveLength(13);
  });

  it('searches upward from the optimal length when that already exceeds the minimum', () => {
    const attempted: number[] = [];
    const solution = solveAtLeastLength(20, 11, (length) => {
      attempted.push(length);
      return length >= 22 ? new Array<string>(length).fill('X') : null;
    });
    expect(attempted).toEqual([20, 21, 22]);
    expect(solution).toHaveLength(22);
  });

  it('gives up rather than looping forever when no length works', () => {
    expect(() => solveAtLeastLength(4, 11, () => null)).toThrow(/no solution of length 11\.\.19/);
  });
});
