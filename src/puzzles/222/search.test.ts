import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { toCoordinate222 } from './coordinates';
import { distance222 } from './pruning';
import { solve222, solve222InExactly, solveDistance222 } from './search';
import { randomState222 } from './random-state';
import { applyMoves222, isSolved222, SOLVED_222_STATE } from './state';
import { ALL_MOVES_222 } from './tables';

describe('solve222', () => {
  it('the solved state needs no moves', () => {
    expect(solve222(SOLVED_222_STATE)).toEqual([]);
  });

  it('finds a sequence that actually solves the cube, for many random states', () => {
    const random = createRandomSource('222-search-correctness');
    for (let trial = 0; trial < 50; trial += 1) {
      const moves = Array.from(
        { length: 1 + randomInt(random, 20) },
        () => ALL_MOVES_222[randomInt(random, ALL_MOVES_222.length)]!,
      );
      const scrambled = applyMoves222(SOLVED_222_STATE, moves);
      const solution = solve222(scrambled);
      expect(isSolved222(applyMoves222(scrambled, solution))).toBe(true);
    }
  });

  it('the solution is always exactly optimal (distance222 gives the exact distance for this puzzle)', () => {
    const random = createRandomSource('222-search-optimality');
    for (let trial = 0; trial < 50; trial += 1) {
      const moves = Array.from(
        { length: 1 + randomInt(random, 15) },
        () => ALL_MOVES_222[randomInt(random, ALL_MOVES_222.length)]!,
      );
      const scrambled = applyMoves222(SOLVED_222_STATE, moves);
      const coord = toCoordinate222(scrambled);
      const solution = solve222(scrambled);
      expect(solution.length).toBe(distance222(coord.cornerPerm, coord.cornerOrientation));
    }
  });

  it('never turns the same face twice in a row', () => {
    const random = createRandomSource('222-search-no-redundant-moves');
    for (let trial = 0; trial < 50; trial += 1) {
      const moves = Array.from(
        { length: 1 + randomInt(random, 20) },
        () => ALL_MOVES_222[randomInt(random, ALL_MOVES_222.length)]!,
      );
      const scrambled = applyMoves222(SOLVED_222_STATE, moves);
      const solution = solve222(scrambled);
      for (let i = 1; i < solution.length; i += 1) {
        expect(solution[i]!.face).not.toBe(solution[i - 1]!.face);
      }
    }
  });
});

/**
 * Fixed-length solving is what lets a scramble be padded to a presentable
 * length without changing the state it reaches — see
 * `core/scramble-shape.ts`.
 */
describe('solve222InExactly', () => {
  it('returns a solution of exactly that length that still solves the cube', () => {
    const random = createRandomSource('222-exact-length');
    for (let trial = 0; trial < 200; trial += 1) {
      const state = randomState222(random);
      const d = solveDistance222(state);

      if (d > 0) expect(solve222InExactly(state, d - 1)).toBeNull();

      for (let length = d; length <= d + 3; length += 1) {
        const solution = solve222InExactly(state, length);
        if (solution === null) continue;
        expect(solution).toHaveLength(length);
        expect(isSolved222(applyMoves222(state, solution))).toBe(true);
      }
    }
  });

  it('agrees with solve222 at the optimal length', () => {
    const random = createRandomSource('222-exact-vs-optimal');
    for (let trial = 0; trial < 100; trial += 1) {
      const state = randomState222(random);
      expect(solve222InExactly(state, solveDistance222(state))).toEqual(solve222(state));
    }
  });

  it('handles the solved state at length 0', () => {
    expect(solve222InExactly(SOLVED_222_STATE, 0)).toEqual([]);
    expect(solve222InExactly(applyMoves222(SOLVED_222_STATE, [{ face: 'R', amount: 1 }]), 0)).toBeNull();
  });
});
