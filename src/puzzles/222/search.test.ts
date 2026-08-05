import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { toCoordinate222 } from './coordinates';
import { distance222 } from './pruning';
import { solve222 } from './search';
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
