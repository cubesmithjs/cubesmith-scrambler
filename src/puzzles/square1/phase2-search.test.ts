import { describe, expect, it } from 'vitest';
import { isLayerTurn, SLICE, type Square1Move } from './notation';
import { phase2LowerBound, phase2Search } from './phase2-search';
import { phase2MoveTables } from './phase2-tables';
import { toPhase2Coordinate } from './phase2-coordinates';
import {
  applySquare1Move,
  applySquare1Moves,
  hasSquareLayers,
  isSliceLegal,
  isSquare1Solved,
  isWellFormedSquare1State,
  SOLVED_SQUARE1_STATE,
  type Square1State,
} from './state';

function makeRandom(seed: number): (bound: number) => number {
  let state = seed;
  return (bound) => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % bound;
  };
}

/** A state reached without ever leaving square layers, plus the moves that got there. */
function squareLayerState(seed: number, groups: number): Square1State {
  const next = makeRandom(seed);
  const { turns } = phase2MoveTables();
  let state = SOLVED_SQUARE1_STATE;
  for (let i = 0; i < groups; i += 1) {
    state = applySquare1Move(state, turns[next(turns.length)]!);
    if (!isSliceLegal(state)) continue;
    const sliced = applySquare1Move(state, SLICE);
    if (hasSquareLayers(sliced)) state = sliced;
  }
  return state;
}

const coordinateKey = (state: Square1State): string => {
  const coordinate = toPhase2Coordinate(state);
  return `${coordinate.alignment}:${coordinate.middleFlipped ? 1 : 0}:${coordinate.corners}:${coordinate.edges}`;
};

describe('phase 2', () => {
  it('solves the solved state in no moves', () => {
    expect(phase2Search(SOLVED_SQUARE1_STATE)).toEqual([]);
  });

  it('really solves: applying what it returns reaches solved, from many starts', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const state = squareLayerState(seed, 6 + (seed % 5));
      const solution = phase2Search(state)!;
      expect(solution).toBeDefined();

      // Every move is one the puzzle allows — `applySquare1Move` throws otherwise.
      let current = state;
      for (const move of solution) {
        current = applySquare1Move(current, move);
        expect(isWellFormedSquare1State(current)).toBe(true);
      }
      expect(isSquare1Solved(current)).toBe(true);
    }
  });

  it('never leaves square layers on the way', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const state = squareLayerState(seed * 7, 8);
      let current = state;
      for (const move of phase2Search(state)!) {
        current = applySquare1Move(current, move);
        expect(hasSquareLayers(current)).toBe(true);
      }
    }
  });

  it('alternates turns and slices, because anything else is redundant', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const solution = phase2Search(squareLayerState(seed * 3, 7))!;
      solution.forEach((move, index) => {
        if (index === 0) return;
        expect(isLayerTurn(move)).toBe(!isLayerTurn(solution[index - 1]!));
      });
    }
  });

  /**
   * Optimality, checked against a search that shares nothing with the solver: a
   * breadth-first sweep of the real move model, over real states, out to four
   * moves. Every state it finds at depth `d` must be solved by phase 2 in
   * exactly `d` — IDA\* with an admissible heuristic is optimal, so anything
   * else means the heuristic is not admissible after all.
   */
  it('returns optimal solutions, against a brute-force breadth-first search', () => {
    const { turns } = phase2MoveTables();
    const depthOf = new Map<string, number>([[coordinateKey(SOLVED_SQUARE1_STATE), 0]]);
    let frontier: Square1State[] = [SOLVED_SQUARE1_STATE];

    for (let depth = 1; depth <= 4; depth += 1) {
      const next: Square1State[] = [];
      for (const state of frontier) {
        const successors: Square1State[] = turns.map((turn) => applySquare1Move(state, turn));
        if (isSliceLegal(state)) {
          const sliced = applySquare1Move(state, SLICE);
          if (hasSquareLayers(sliced)) successors.push(sliced);
        }
        for (const successor of successors) {
          const key = coordinateKey(successor);
          if (depthOf.has(key)) continue;
          depthOf.set(key, depth);
          next.push(successor);
        }
      }
      frontier = next;
    }

    // Measured: 5,744 distinct states within four moves, the alternation making
    // odd depths (a turn, 143 ways) far wider than even ones (a slice, one way).
    expect(depthOf.size).toBe(5_744);

    const random = makeRandom(2024);
    const sampled = [...depthOf.entries()].filter(() => random(40) === 0);
    expect(sampled.length).toBeGreaterThan(100);

    // Re-derive a state for each sampled key by replaying the search from it is
    // not possible, so instead sample states as they are generated.
    let checked = 0;
    frontier = [SOLVED_SQUARE1_STATE];
    const seen = new Set<string>([coordinateKey(SOLVED_SQUARE1_STATE)]);
    for (let depth = 1; depth <= 4; depth += 1) {
      const next: Square1State[] = [];
      for (const state of frontier) {
        const successors: Square1State[] = turns.map((turn) => applySquare1Move(state, turn));
        if (isSliceLegal(state)) {
          const sliced = applySquare1Move(state, SLICE);
          if (hasSquareLayers(sliced)) successors.push(sliced);
        }
        for (const successor of successors) {
          const key = coordinateKey(successor);
          if (seen.has(key)) continue;
          seen.add(key);
          next.push(successor);
          if (random(400) !== 0) continue;
          expect(phase2Search(successor)!).toHaveLength(depth);
          checked += 1;
        }
      }
      frontier = next;
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('has a lower bound that never exceeds the solution it finds', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const state = squareLayerState(seed * 11, 9);
      const solution = phase2Search(state)!;
      expect(phase2LowerBound(state)).toBeLessThanOrEqual(solution.length);
    }
  });

  it('gives up rather than exceeding a length cap', () => {
    const state = squareLayerState(5, 10);
    const optimal = phase2Search(state)!.length;
    expect(optimal).toBeGreaterThan(1);
    expect(phase2Search(state, { maxLength: optimal - 1 })).toBeUndefined();
    expect(phase2Search(state, { maxLength: optimal })).toHaveLength(optimal);
  });

  it('accepts a coordinate as readily as a state', () => {
    const state = squareLayerState(77, 8);
    const viaState = phase2Search(state)!;
    const viaCoordinate = phase2Search(toPhase2Coordinate(state))!;
    expect(viaCoordinate).toHaveLength(viaState.length);
    expect(isSquare1Solved(applySquare1Moves(state, viaCoordinate))).toBe(true);
  });

  it('solves deeply scrambled square-layer states within a sane length', () => {
    const lengths: number[] = [];
    for (let seed = 1; seed <= 25; seed += 1) {
      const solution = phase2Search(squareLayerState(seed * 101, 30))! as Square1Move[];
      lengths.push(solution.length);
    }
    // Phase 2's own diameter is not known; these are all comfortably inside the
    // pruning tables' radius of 15, which is what makes the search quick.
    expect(Math.max(...lengths)).toBeLessThanOrEqual(20);
  });
});
