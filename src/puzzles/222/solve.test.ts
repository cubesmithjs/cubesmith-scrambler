import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { parseMove } from '../../notation/move';
import { solveDistance222 } from './search';
import {
  generate222Scramble,
  MIN_222_SCRAMBLE_LENGTH,
  MIN_222_SOLVE_DISTANCE,
} from './solve';
import { applyMoves222, isSolved222, SOLVED_222_STATE } from './state';

const scrambles = Array.from({ length: 400 }, (_, seed) =>
  generate222Scramble(createRandomSource(`222-shape-${seed}`)),
);

describe('generate222Scramble output shape', () => {
  it('uses only the U, R and F faces', () => {
    for (const scramble of scrambles) {
      expect(scramble).toMatch(/^[URF][2']?( [URF][2']?)*$/);
    }
  });

  it('never turns the same face twice in a row', () => {
    for (const scramble of scrambles) {
      const moves = scramble.split(' ').map(parseMove);
      for (let i = 1; i < moves.length; i += 1) {
        expect(moves[i]!.face).not.toBe(moves[i - 1]!.face);
      }
    }
  });

  it('is always exactly 11 moves — the length WCA scramble sheets print', () => {
    for (const scramble of scrambles) {
      expect(scramble.split(' ')).toHaveLength(MIN_222_SCRAMBLE_LENGTH);
    }
  });

  /**
   * WCA Regulation 4b3b. Without the filter a small but real fraction of
   * uniformly drawn states solve in 3 moves or fewer, which is not a legal
   * competition scramble however long the printed sequence is.
   */
  it('the state it reaches always needs at least 4 moves to solve (Regulation 4b3b)', () => {
    for (const scramble of scrambles) {
      const state = applyMoves222(SOLVED_222_STATE, scramble.split(' ').map(parseMove));
      expect(solveDistance222(state)).toBeGreaterThanOrEqual(MIN_222_SOLVE_DISTANCE);
    }
  });

  it('genuinely scrambles: none of them leaves the cube solved', () => {
    for (const scramble of scrambles) {
      const state = applyMoves222(SOLVED_222_STATE, scramble.split(' ').map(parseMove));
      expect(isSolved222(state)).toBe(false);
    }
  });

  it('is deterministic given a seed and varies without one', () => {
    expect(generate222Scramble(createRandomSource('fixed'))).toBe(
      generate222Scramble(createRandomSource('fixed')),
    );
    expect(new Set(scrambles).size).toBeGreaterThan(scrambles.length * 0.95);
  });

  it('uses all three faces and all three amounts across the sample', () => {
    const seen = new Set(scrambles.flatMap((s) => s.split(' ')));
    for (const face of ['U', 'R', 'F']) {
      expect(seen.has(face)).toBe(true);
      expect(seen.has(`${face}2`)).toBe(true);
      expect(seen.has(`${face}'`)).toBe(true);
    }
  });
});
