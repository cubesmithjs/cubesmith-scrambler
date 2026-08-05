import { describe, expect, it } from 'vitest';
import { allLayerTurns, layerTurn, SLICE, type Square1Move } from './notation';
import {
  alignmentIndex,
  alignmentPair,
  canonicalPhase2State,
  cornerPositionSlots,
  edgePositionSlots,
  fromPhase2Coordinate,
  combinedParity,
  NotSquareLayersError,
  PERMUTATION_COUNT,
  permutationFromIndex,
  permutationIndex,
  permutationParityOfIndex,
  PHASE2_ALIGNMENT_COUNT,
  phase2CoordinatesEqual,
  SOLVED_PHASE2_COORDINATE,
  toPhase2Coordinate,
} from './phase2-coordinates';
import {
  applySquare1LayerTurn,
  applySquare1Moves,
  applySquare1Slice,
  hasSquareLayers,
  isSliceLegal,
  isWellFormedSquare1State,
  SOLVED_SQUARE1_STATE,
  square1Alignments,
  square1StatesEqual,
} from './state';

function makeRandom(seed: number): (bound: number) => number {
  let state = seed;
  return (bound) => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % bound;
  };
}

/** A walk that stays inside square layers, so its states are phase-2 states. */
function squareLayerWalk(seed: number, steps: number): Square1Move[] {
  const next = makeRandom(seed);
  const turns = allLayerTurns();
  const moves: Square1Move[] = [];
  let state = SOLVED_SQUARE1_STATE;
  for (let i = 0; i < steps; i += 1) {
    const turn = turns[next(turns.length)]!;
    moves.push(turn);
    state = applySquare1LayerTurn(state, turn);
    if (!isSliceLegal(state)) continue;
    const sliced = applySquare1Slice(state);
    if (!hasSquareLayers(sliced)) continue;
    moves.push(SLICE);
    state = sliced;
  }
  return moves;
}

describe('permutation ranking', () => {
  it('round-trips every index for n = 8 at the edges, and a dense sample throughout', () => {
    for (const index of [0, 1, 2, 40_318, PERMUTATION_COUNT - 1]) {
      expect(permutationIndex(permutationFromIndex(index, 8))).toBe(index);
    }
    for (let index = 0; index < PERMUTATION_COUNT; index += 7) {
      expect(permutationIndex(permutationFromIndex(index, 8))).toBe(index);
    }
    expect(permutationFromIndex(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(permutationFromIndex(PERMUTATION_COUNT - 1, 8)).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it('is a bijection: every index is hit exactly once', () => {
    const seen = new Set<number>();
    for (let index = 0; index < PERMUTATION_COUNT; index += 1) {
      seen.add(permutationIndex(permutationFromIndex(index, 8)));
    }
    expect(seen.size).toBe(PERMUTATION_COUNT);
  });

  it('rejects an index past the end', () => {
    expect(() => permutationFromIndex(PERMUTATION_COUNT, 8)).toThrow(/out of range/);
  });

  it('agrees with a transposition count on parity', () => {
    // A single swap away from the identity is odd; the identity is even.
    expect(permutationParityOfIndex(0)).toBe(0);
    expect(permutationParityOfIndex(permutationIndex([1, 0, 2, 3, 4, 5, 6, 7]))).toBe(1);
    expect(permutationParityOfIndex(permutationIndex([1, 2, 0, 3, 4, 5, 6, 7]))).toBe(0);
    let odd = 0;
    for (let index = 0; index < PERMUTATION_COUNT; index += 1) {
      odd += permutationParityOfIndex(index);
    }
    expect(odd).toBe(PERMUTATION_COUNT / 2);
  });
});

describe('alignment indexing', () => {
  it('round-trips all nine pairs', () => {
    for (let index = 0; index < PHASE2_ALIGNMENT_COUNT; index += 1) {
      const [upper, lower] = alignmentPair(index);
      expect(alignmentIndex(upper, lower)).toBe(index);
    }
  });

  it('places the eight corner and eight edge slots without overlap', () => {
    for (let index = 0; index < PHASE2_ALIGNMENT_COUNT; index += 1) {
      const corners = cornerPositionSlots(index);
      const edges = edgePositionSlots(index);
      expect(corners).toHaveLength(8);
      expect(edges).toHaveLength(8);
      expect(new Set([...corners, ...edges]).size).toBe(16);
      // Ascending, upper ring first — the ordering the parity argument needs.
      expect([...corners]).toEqual([...corners].sort((a, b) => a - b));
      expect([...edges]).toEqual([...edges].sort((a, b) => a - b));
    }
  });
});

describe('the coordinate', () => {
  it('round-trips the solved state', () => {
    expect(toPhase2Coordinate(SOLVED_SQUARE1_STATE)).toEqual(SOLVED_PHASE2_COORDINATE);
    expect(
      square1StatesEqual(fromPhase2Coordinate(SOLVED_PHASE2_COORDINATE), SOLVED_SQUARE1_STATE),
    ).toBe(true);
  });

  it('round-trips every canonical alignment', () => {
    for (let index = 0; index < PHASE2_ALIGNMENT_COUNT; index += 1) {
      const state = canonicalPhase2State(index);
      expect(isWellFormedSquare1State(state)).toBe(true);
      expect(hasSquareLayers(state)).toBe(true);
      expect(square1Alignments(state)).toEqual([...alignmentPair(index)]);
      expect(toPhase2Coordinate(state)).toEqual({
        alignment: index,
        middleFlipped: false,
        corners: 0,
        edges: 0,
      });
    }
  });

  /** state → coordinate → state, over states a real walk produces. */
  it('round-trips states reached by staying inside square layers', () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      let state = SOLVED_SQUARE1_STATE;
      for (const move of squareLayerWalk(seed, 12)) {
        state = applySquare1Moves(state, [move]);
        if (!hasSquareLayers(state)) continue;
        const coordinate = toPhase2Coordinate(state);
        const rebuilt = fromPhase2Coordinate(coordinate);
        expect(square1StatesEqual(rebuilt, state)).toBe(true);
        expect(phase2CoordinatesEqual(toPhase2Coordinate(rebuilt), coordinate)).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('refuses a state whose layers are not square', () => {
    const sliced = applySquare1Slice(SOLVED_SQUARE1_STATE);
    expect(hasSquareLayers(sliced)).toBe(false);
    expect(() => toPhase2Coordinate(sliced)).toThrow(NotSquareLayersError);
  });

  /**
   * The classic Square-1 decomposition makes phase 1 deliver an *even*
   * permutation, which is only necessary if phase 2 cannot change parity. It
   * can: a walk that never leaves square layers reaches **both** values of
   * `parity(corners) XOR parity(edges)`.
   *
   * This test exists because the opposite was asserted first, on the plausible
   * but false argument that a turn shifts a ring's corners and edges together.
   * It does not — corners on `a, a+3, a+6, a+9` and edges on `a+2, a+5, a+8,
   * a+11` wrap past slot 11 at different amounts — and `(1,0)` is a one-move
   * counterexample.
   */
  it('reaches both combined parities without leaving square layers', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed += 1) {
      let state = SOLVED_SQUARE1_STATE;
      for (const move of squareLayerWalk(seed, 14)) {
        state = applySquare1Moves(state, [move]);
        if (!hasSquareLayers(state)) continue;
        seen.add(combinedParity(toPhase2Coordinate(state)));
      }
    }
    expect([...seen].sort()).toEqual([0, 1]);

    const oneTurn = applySquare1LayerTurn(SOLVED_SQUARE1_STATE, layerTurn(1, 0));
    expect(hasSquareLayers(oneTurn)).toBe(true);
    expect(combinedParity(toPhase2Coordinate(oneTurn))).toBe(1);
    expect(combinedParity(SOLVED_PHASE2_COORDINATE)).toBe(0);
  });
});
