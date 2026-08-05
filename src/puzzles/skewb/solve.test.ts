import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { toSkewbCoordinate } from './coordinates';
import { parseSkewbMove, SKEWB_CORNERS } from './notation';
import { distanceSkewb } from './pruning';
import { randomSkewbState } from './random-state';
import { skewbSolveDistance, solveSkewb, solveSkewbInExactly } from './search';
import { generateSkewbScramble } from './solve';
import { applySkewbMoves, isSolvedSkewb, SOLVED_SKEWB_STATE } from './state';

describe('solveSkewb', () => {
  it('returns an optimal solution — its length always equals the exact table distance', () => {
    const random = createRandomSource('skewb-optimality');
    for (let trial = 0; trial < 300; trial += 1) {
      const state = randomSkewbState(random);
      expect(solveSkewb(state)).toHaveLength(distanceSkewb(toSkewbCoordinate(state)));
    }
  });

  it('actually solves, for many random states', () => {
    const random = createRandomSource('skewb-solve');
    for (let trial = 0; trial < 300; trial += 1) {
      const state = randomSkewbState(random);
      expect(isSolvedSkewb(applySkewbMoves(state, solveSkewb(state)))).toBe(true);
    }
  });

  it('returns an empty solution for an already-solved state', () => {
    expect(solveSkewb(SOLVED_SKEWB_STATE)).toEqual([]);
  });

  it('never repeats a corner on consecutive moves', () => {
    const random = createRandomSource('skewb-no-repeats');
    for (let trial = 0; trial < 200; trial += 1) {
      const solution = solveSkewb(randomSkewbState(random));
      for (let i = 1; i < solution.length; i += 1) {
        expect(solution[i]!.corner).not.toBe(solution[i - 1]!.corner);
      }
    }
  });

  it('rejects an unreachable state', () => {
    expect(() =>
      solveSkewb({ ...SOLVED_SKEWB_STATE, centerPermutation: [1, 0, 2, 3, 4, 5] }),
    ).toThrow();
  });

  it('solveSkewbInExactly returns a solution of exactly that length, or null', () => {
    const random = createRandomSource('skewb-exact-length');
    for (let trial = 0; trial < 200; trial += 1) {
      const state = randomSkewbState(random);
      const d = skewbSolveDistance(state);

      // Shorter than optimal is impossible.
      if (d > 0) expect(solveSkewbInExactly(state, d - 1)).toBeNull();

      for (let length = d; length <= d + 3; length += 1) {
        const solution = solveSkewbInExactly(state, length);
        if (solution === null) continue;
        expect(solution).toHaveLength(length);
        expect(isSolvedSkewb(applySkewbMoves(state, solution))).toBe(true);
      }
    }
  });

  it('is still optimal under a shuffled move order', () => {
    const random = createRandomSource('skewb-move-order');
    const shuffled = [5, 1, 7, 3, 0, 6, 2, 4];
    for (let trial = 0; trial < 200; trial += 1) {
      const state = randomSkewbState(random);
      const a = solveSkewb(state);
      const b = solveSkewb(state, shuffled);
      expect(b).toHaveLength(a.length);
      expect(isSolvedSkewb(applySkewbMoves(state, b))).toBe(true);
    }
  });
});

/**
 * The gate: generate a scramble string, parse it back from text, apply it to
 * a solved Skewb, confirm it is no longer solved, then solve it and confirm
 * it returns to exactly solved.
 */
describe('end-to-end round trip', () => {
  it('every scramble scrambles, and re-solves to exactly solved', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const scramble = generateSkewbScramble(createRandomSource(`skewb-e2e-${seed}`));
      const moves = scramble.split(' ').filter(Boolean).map(parseSkewbMove);

      const scrambled = applySkewbMoves(SOLVED_SKEWB_STATE, moves);
      expect(isSolvedSkewb(scrambled)).toBe(false);

      expect(isSolvedSkewb(applySkewbMoves(scrambled, solveSkewb(scrambled)))).toBe(true);
    }
  });
});

describe('generateSkewbScramble output shape', () => {
  const scrambles = Array.from({ length: 400 }, (_, seed) =>
    generateSkewbScramble(createRandomSource(`skewb-shape-${seed}`)),
  );

  it('is a space-separated sequence of U/R/L/B turns, optionally primed', () => {
    for (const scramble of scrambles) {
      expect(scramble).toMatch(/^[URLB]'?( [URLB]'?)*$/);
    }
  });

  it('never repeats a corner on consecutive moves', () => {
    for (const scramble of scrambles) {
      const moves = scramble.split(' ').map(parseSkewbMove);
      for (let i = 1; i < moves.length; i += 1) {
        expect(moves[i]!.corner).not.toBe(moves[i - 1]!.corner);
      }
    }
  });

  it('is always exactly 11 moves — the length WCA scramble sheets print', () => {
    // A random Skewb state is usually 8 or 9 moves from solved (the
    // distribution peaks well below God's number of 11), so almost every
    // scramble here is a deliberately non-optimal 11-move route to that
    // state rather than the shortest one.
    for (const scramble of scrambles) {
      expect(scramble.split(' ')).toHaveLength(11);
    }
  });

  it('the state it reaches is always at least 7 moves from solved (Regulation 4b3c)', () => {
    for (const scramble of scrambles) {
      const state = applySkewbMoves(
        SOLVED_SKEWB_STATE,
        scramble.split(' ').map(parseSkewbMove),
      );
      expect(distanceSkewb(toSkewbCoordinate(state))).toBeGreaterThanOrEqual(7);
    }
  });

  it('uses all four corners and both directions across the sample', () => {
    const seen = new Set(scrambles.flatMap((s) => s.split(' ')));
    for (const corner of SKEWB_CORNERS) {
      expect(seen.has(corner)).toBe(true);
      expect(seen.has(`${corner}'`)).toBe(true);
    }
  });

  it('is deterministic given a seed and varies without one', () => {
    expect(generateSkewbScramble(createRandomSource('fixed'))).toBe(
      generateSkewbScramble(createRandomSource('fixed')),
    );
    const distinct = new Set(
      Array.from({ length: 50 }, (_, i) => generateSkewbScramble(createRandomSource(`vary-${i}`))),
    );
    expect(distinct.size).toBeGreaterThan(45);
  });
});
