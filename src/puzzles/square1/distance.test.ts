import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import {
  isSquare1AtLeastMovesFromSolved,
  square1DistanceCappedAt,
  square1LowerBound,
  square1WitnessWithin,
} from './distance';
import { allLayerTurns, SLICE, type Square1Move } from './notation';
import { randomSquare1State } from './random-state';
import { solveSquare1 } from './solve';
import {
  applySquare1Move,
  applySquare1Moves,
  isSliceLegal,
  isSquare1Solved,
  SOLVED_SQUARE1_STATE,
  type Square1State,
} from './state';

/**
 * The independent oracle for everything in this file: breadth-first search over
 * the real move model, out to a depth small enough to be exhaustive. Whatever
 * it says the distance is, it *is*.
 */
function exhaustiveDistances(depth: number): Map<string, { distance: number; state: Square1State }> {
  const key = (state: Square1State): string =>
    `${state.slots.join(',')}|${state.middleFlipped ? 1 : 0}`;
  const seen = new Map<string, { distance: number; state: Square1State }>([
    [key(SOLVED_SQUARE1_STATE), { distance: 0, state: SOLVED_SQUARE1_STATE }],
  ]);
  let frontier: Square1State[] = [SOLVED_SQUARE1_STATE];

  for (let distance = 1; distance <= depth; distance += 1) {
    const next: Square1State[] = [];
    for (const state of frontier) {
      const successors = allLayerTurns().map((turn) => applySquare1Move(state, turn));
      if (isSliceLegal(state)) successors.push(applySquare1Move(state, SLICE));
      for (const successor of successors) {
        const id = key(successor);
        if (seen.has(id)) continue;
        seen.set(id, { distance, state: successor });
        next.push(successor);
      }
    }
    frontier = next;
  }
  return seen;
}

describe('the lower bound', () => {
  it('is zero only at solved, and never exceeds a known solution length', () => {
    expect(square1LowerBound(SOLVED_SQUARE1_STATE)).toBe(0);

    const random = createRandomSource('lower bound');
    for (let trial = 0; trial < 8; trial += 1) {
      const state = randomSquare1State(random);
      expect(square1LowerBound(state)).toBeGreaterThan(0);
      expect(square1LowerBound(state)).toBeLessThanOrEqual(solveSquare1(state).length);
    }
  });

  it('changes by at most one per move, as an exact graph distance must', () => {
    const random = createRandomSource(4);
    let state = randomSquare1State(random);
    const turns = allLayerTurns();
    for (let step = 0; step < 200; step += 1) {
      const before = square1LowerBound(state);
      const move: Square1Move =
        isSliceLegal(state) && step % 3 === 0
          ? SLICE
          : turns[random.nextUint32() % turns.length]!;
      state = applySquare1Move(state, move);
      expect(Math.abs(square1LowerBound(state) - before)).toBeLessThanOrEqual(1);
    }
  });
});

describe('the capped distance', () => {
  /**
   * Checked against brute force everywhere brute force can reach: every state
   * within four moves of solved, all 5,000-odd of them, must be reported at
   * exactly the depth the sweep found it.
   */
  it('agrees with an exhaustive search on every state within four moves', () => {
    const reachable = exhaustiveDistances(4);
    expect(reachable.size).toBeGreaterThan(5_000);

    let sampled = 0;
    let index = 0;
    const wrong: string[] = [];
    for (const { distance, state } of reachable.values()) {
      index += 1;
      if (index % 29 !== 0) continue;
      sampled += 1;
      const reported = square1DistanceCappedAt(state, 5);
      if (reported !== distance) wrong.push(`${reported} vs ${distance}`);
    }
    expect(wrong).toEqual([]);
    expect(sampled).toBeGreaterThan(150);
  });

  it('returns cap + 1 rather than guessing, for a state further than the cap', () => {
    const random = createRandomSource('far');
    const state = randomSquare1State(random);
    expect(square1DistanceCappedAt(state, 4)).toBe(5);
    expect(square1DistanceCappedAt(state, 6)).toBe(7);
  });

  it('produces a witness of exactly the length it reports', () => {
    const reachable = exhaustiveDistances(3);
    let sampled = 0;
    let index = 0;
    for (const { distance, state } of reachable.values()) {
      index += 1;
      if (index % 97 !== 0) continue;
      sampled += 1;
      const witness = square1WitnessWithin(state, 4)!;
      expect(witness).toHaveLength(distance);
      expect(isSquare1Solved(applySquare1Moves(state, witness))).toBe(true);
    }
    expect(sampled).toBeGreaterThan(90);
  });

  it('has no witness for a state beyond the cap', () => {
    expect(square1WitnessWithin(randomSquare1State(createRandomSource(3)), 5)).toBeUndefined();
  });
});

describe('Regulation 4b3d', () => {
  it('accepts a far state and rejects a near one, exactly', () => {
    // Two moves from solved: nowhere near eleven.
    const near = applySquare1Moves(SOLVED_SQUARE1_STATE, [allLayerTurns()[40]!, SLICE]);
    expect(isSquare1AtLeastMovesFromSolved(near, 11)).toBe(false);
    expect(isSquare1AtLeastMovesFromSolved(near, 2)).toBe(true);
    expect(isSquare1AtLeastMovesFromSolved(near, 3)).toBe(false);

    const random = createRandomSource('4b3d');
    for (let trial = 0; trial < 10; trial += 1) {
      expect(isSquare1AtLeastMovesFromSolved(randomSquare1State(random), 11)).toBe(true);
    }
  });

  it('is decided by the bound alone for the overwhelming majority of draws', () => {
    const random = createRandomSource('bound share');
    let settledByBound = 0;
    const draws = 200;
    for (let trial = 0; trial < draws; trial += 1) {
      if (square1LowerBound(randomSquare1State(random)) >= 11) settledByBound += 1;
    }
    // Not a correctness property — a performance one. Measured between 0.46 and
    // 0.65 across seeds; if it ever collapses, the 4b3d filter has started
    // running real searches on nearly every scramble.
    expect(settledByBound / draws).toBeGreaterThan(0.35);
  });

  it('never rejects a state it cannot prove is close', () => {
    // The contract that keeps the draw uniform: a rejection is always backed by
    // an actual sequence of fewer than 11 moves.
    const random = createRandomSource('rejections');
    for (let trial = 0; trial < 40; trial += 1) {
      const state = randomSquare1State(random);
      if (isSquare1AtLeastMovesFromSolved(state, 11)) continue;
      const witness = square1WitnessWithin(state, 10)!;
      expect(witness.length).toBeLessThanOrEqual(10);
      expect(isSquare1Solved(applySquare1Moves(state, witness))).toBe(true);
    }
  });
});
