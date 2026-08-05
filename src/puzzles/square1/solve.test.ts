import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import {
  compressSquare1Moves,
  inverseSquare1Moves,
  isLayerTurn,
  layerTurn,
  SLICE,
  square1MovesToString,
} from './notation';
import { phase1Solutions } from './phase1-search';
import { randomSquare1State, twistableShapeKeys } from './random-state';
import { isTwistableShapeKey } from './shapes';
import { solveSquare1, square1SolutionSolves } from './solve';
import {
  applySquare1Move,
  applySquare1Moves,
  hasSquareLayers,
  isSliceLegal,
  isSquare1Solved,
  isWellFormedSquare1State,
  SOLVED_SQUARE1_STATE,
  square1ShapeKey,
  square1StatesEqual,
} from './state';

describe('phase 1', () => {
  it('reaches square layers, using moves the puzzle allows', () => {
    const random = createRandomSource(11);
    for (let trial = 0; trial < 40; trial += 1) {
      const state = randomSquare1State(random);
      const [solution] = phase1Solutions(state);
      expect(solution).toBeDefined();

      let current = state;
      for (const move of solution!) current = applySquare1Move(current, move);
      expect(hasSquareLayers(current)).toBe(true);
      expect(isWellFormedSquare1State(current)).toBe(true);
    }
  });

  it('enumerates several distinct endings, all of the same optimal length', () => {
    const random = createRandomSource(12);
    const state = randomSquare1State(random);
    const solutions = phase1Solutions(state, { maxSolutions: 8 });
    expect(solutions.length).toBeGreaterThan(1);

    const rendered = new Set(solutions.map(square1MovesToString));
    expect(rendered.size).toBe(solutions.length);
    expect(new Set(solutions.map((solution) => solution.length)).size).toBe(1);

    // Different endings really do leave the puzzle in different states — that is
    // the whole reason the solver tries more than one.
    const landed = new Set(
      solutions.map((solution) => JSON.stringify(applySquare1Moves(state, solution).slots)),
    );
    expect(landed.size).toBe(solutions.length);
  });

  it('solves an already-square state in no moves', () => {
    expect(phase1Solutions(SOLVED_SQUARE1_STATE)).toEqual([[]]);
  });
});

describe('the solver', () => {
  it('solves a uniformly random state, and the solution is a real sequence of moves', () => {
    const random = createRandomSource(2026);
    for (let trial = 0; trial < 12; trial += 1) {
      const state = randomSquare1State(random);
      const solution = solveSquare1(state);

      let current = state;
      for (const move of solution) {
        // Throws if a slice was chosen where the puzzle jams.
        current = applySquare1Move(current, move);
        expect(isWellFormedSquare1State(current)).toBe(true);
      }
      expect(isSquare1Solved(current)).toBe(true);
      expect(square1SolutionSolves(state, solution)).toBe(true);
    }
  });

  /**
   * The round trip the whole package is judged on: invert the solution to get a
   * scramble, apply it to a solved puzzle, and the state must be the one that
   * was drawn — not merely *a* scrambled state.
   */
  it('inverts to a scramble that reproduces the exact state it was drawn from', () => {
    const random = createRandomSource('square-1 round trip');
    for (let trial = 0; trial < 12; trial += 1) {
      const state = randomSquare1State(random);
      const scramble = inverseSquare1Moves(solveSquare1(state));
      const applied = applySquare1Moves(SOLVED_SQUARE1_STATE, scramble);
      expect(square1StatesEqual(applied, state)).toBe(true);
      expect(isSquare1Solved(applied)).toBe(false);
    }
  });

  it('emits nothing redundant: turns and slices alternate throughout', () => {
    const random = createRandomSource(7);
    for (let trial = 0; trial < 8; trial += 1) {
      const solution = solveSquare1(randomSquare1State(random));
      solution.forEach((move, index) => {
        if (index === 0) return;
        expect(isLayerTurn(move)).toBe(!isLayerTurn(solution[index - 1]!));
      });
      expect(compressSquare1Moves(solution)).toEqual(solution);
    }
  });

  it('solves the solved state in no moves', () => {
    expect(solveSquare1(SOLVED_SQUARE1_STATE)).toEqual([]);
  });

  it('solves a state one move from solved in one move', () => {
    for (const move of [layerTurn(3, 0), layerTurn(1, -2), SLICE]) {
      const state = applySquare1Move(SOLVED_SQUARE1_STATE, move);
      expect(solveSquare1(state)).toHaveLength(1);
    }
  });

  /**
   * Length is not a correctness property, but it is what a user sees. Two-phase
   * solutions are longer than optimal by construction; these bounds are recorded
   * so a regression that doubles them cannot pass unnoticed.
   */
  it('produces solutions of a length comparable to official scrambles', () => {
    const random = createRandomSource('lengths');
    const lengths: number[] = [];
    for (let trial = 0; trial < 20; trial += 1) {
      lengths.push(solveSquare1(randomSquare1State(random)).length);
    }
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    expect(mean).toBeLessThan(26);
    expect(Math.max(...lengths)).toBeLessThan(34);
    expect(Math.min(...lengths)).toBeGreaterThan(8);
  });

  /**
   * More endings is not a guarantee of a shorter answer — the sweep returns the
   * first ending that finishes within the current relaxation, not the best — but
   * it should not be systematically worse either, and it must never fail.
   */
  it('answers whatever the ending budget, and stays in the same length range', () => {
    const random = createRandomSource(99);
    for (let trial = 0; trial < 6; trial += 1) {
      const state = randomSquare1State(random);
      const few = solveSquare1(state, { attempts: 2 });
      const many = solveSquare1(state, { attempts: 30 });
      expect(square1SolutionSolves(state, few)).toBe(true);
      expect(square1SolutionSolves(state, many)).toBe(true);
      expect(Math.abs(many.length - few.length)).toBeLessThanOrEqual(8);
    }
  });
});

describe('the random state', () => {
  it('is always twistable, so a scramble can end where 4b3d requires', () => {
    const random = createRandomSource(5);
    for (let trial = 0; trial < 200; trial += 1) {
      const state = randomSquare1State(random);
      expect(isWellFormedSquare1State(state)).toBe(true);
      expect(isSliceLegal(state)).toBe(true);
      expect(isTwistableShapeKey(square1ShapeKey(state))).toBe(true);
    }
  });

  it('draws from all 3,678 twistable shapes and both middle orientations', () => {
    expect(twistableShapeKeys()).toHaveLength(3_678);
    const random = createRandomSource(6);
    const shapes = new Set<number>();
    const middles = new Set<boolean>();
    for (let trial = 0; trial < 20_000; trial += 1) {
      const state = randomSquare1State(random);
      shapes.add(square1ShapeKey(state));
      middles.add(state.middleFlipped);
    }
    // 20,000 draws over 3,678 shapes: seeing nearly all of them is expected,
    // seeing a small subset would mean the draw is not uniform over shapes.
    expect(shapes.size).toBeGreaterThan(3_500);
    expect(middles.size).toBe(2);
  });
});
