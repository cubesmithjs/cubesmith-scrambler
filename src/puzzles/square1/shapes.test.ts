import { describe, expect, it } from 'vitest';
import { allLayerTurns, SLICE, type Square1Move } from './notation';
import {
  enumerateAllShapeKeys,
  isTwistableShapeKey,
  ringTilings,
  solveSquare1Shape,
  square1ShapeSpace,
} from './shapes';
import {
  applySquare1LayerTurn,
  applySquare1Move,
  applySquare1Moves,
  applySquare1Slice,
  isSliceLegal,
  isWellFormedSquare1State,
  RING_SLOTS,
  SOLVED_SQUARE1_STATE,
  SQUARE1_SLOT_COUNT,
  square1ShapeKey,
  type Square1State,
} from './state';

const SOLVED_SHAPE = square1ShapeKey(SOLVED_SQUARE1_STATE);

function makeRandom(seed: number): (bound: number) => number {
  let state = seed;
  return (bound) => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % bound;
  };
}

function randomWalk(seed: number, pairs: number): Square1Move[] {
  const next = makeRandom(seed);
  const turns = allLayerTurns();
  const moves: Square1Move[] = [];
  let state = SOLVED_SQUARE1_STATE;
  for (let i = 0; i < pairs; i += 1) {
    const turn = turns[next(turns.length)]!;
    moves.push(turn);
    state = applySquare1LayerTurn(state, turn);
    if (isSliceLegal(state)) {
      moves.push(SLICE);
      state = applySquare1Slice(state);
    }
  }
  return moves;
}

/** Rotation orbits of one ring's corner placements — "shapes up to turning the layer". */
function rotationOrbits(corners: number): number {
  const seen = new Set<number>();
  let orbits = 0;
  for (const mask of ringTilings(corners)) {
    if (seen.has(mask)) continue;
    orbits += 1;
    for (let shift = 0; shift < RING_SLOTS; shift += 1) {
      let rotated = 0;
      for (let slot = 0; slot < RING_SLOTS; slot += 1) {
        if ((mask & (1 << slot)) !== 0) rotated |= 1 << ((slot + shift) % RING_SLOTS);
      }
      seen.add(rotated);
    }
  }
  return orbits;
}

describe('the combinatorial enumeration', () => {
  /**
   * A ring's corner starts are an independent set of the 12-cycle, so the count
   * for `c` corners is `(12 / (12 - c)) * C(12 - c, c)`: 54, 112, 105, 36, 2.
   * Asserted against that closed form rather than against the code that
   * produced them.
   */
  it('counts one ring exactly as the closed form does', () => {
    const choose = (n: number, k: number): number => {
      let result = 1;
      for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1);
      return Math.round(result);
    };
    for (let corners = 0; corners <= 6; corners += 1) {
      const closedForm =
        corners === 0 ? 1 : (RING_SLOTS / (RING_SLOTS - corners)) * choose(RING_SLOTS - corners, corners);
      expect(ringTilings(corners)).toHaveLength(closedForm);
    }
    expect(ringTilings(4)).toHaveLength(105);
    expect(ringTilings(6)).toHaveLength(2);
    expect(ringTilings(7)).toHaveLength(0);
  });

  it('has 19,305 absolute shapes in total, all distinct', () => {
    const keys = enumerateAllShapeKeys();
    expect(new Set(keys).size).toBe(keys.length);
    // 54*2 + 112*36 + 105*105 + 36*112 + 2*54, by upper-ring corner count 2..6.
    expect(keys).toHaveLength(19_305);
  });

  /**
   * The other published cross-check: **170** (top, bottom) shape pairs once
   * layer rotations are disregarded, as `5*1 + 10*3 + 10*10 + 3*10 + 1*5`.
   */
  it('reproduces the published 170 shape pairs up to rotation', () => {
    const orbits = [2, 3, 4, 5, 6].map((corners) => rotationOrbits(corners));
    expect(orbits).toEqual([5, 10, 10, 3, 1]);
    const pairs = [2, 3, 4, 5, 6].reduce(
      (total, corners) => total + rotationOrbits(corners) * rotationOrbits(8 - corners),
      0,
    );
    expect(pairs).toBe(170);
  });
});

/**
 * The checkpoint `docs/square1-design.md` §10 sets: work stops here if these
 * numbers do not come out, because every number downstream depends on the slice
 * mapping being right and this is the first place a sign or index error in it
 * becomes visible.
 */
describe('the checkpoint', () => {
  it('reproduces the published 3,678 twistable shapes', () => {
    const twistable = enumerateAllShapeKeys().filter(isTwistableShapeKey);
    expect(twistable).toHaveLength(3_678);
  });

  it('reaches every one of them by moving, from solved', () => {
    const { distance, representative } = square1ShapeSpace();

    const combinatorial = new Set(enumerateAllShapeKeys());
    for (const key of distance.keys()) expect(combinatorial.has(key)).toBe(true);

    const reachableTwistable = [...distance.keys()].filter(isTwistableShapeKey);
    expect(reachableTwistable).toHaveLength(3_678);

    // Every representative is a state the puzzle could really be in, and its
    // key is the key it is filed under.
    for (const [key, state] of representative) {
      expect(isWellFormedSquare1State(state)).toBe(true);
      expect(square1ShapeKey(state)).toBe(key);
    }
  });

  /**
   * Which shapes are *not* reachable is itself informative: the only ones the
   * move model cannot produce are those where a corner sits across a cut on one
   * ring while the other ring is arranged so no turn can ever relieve it — none,
   * as it turns out. Every combinatorially valid shape is reachable, so the
   * shape graph is the whole space and phase 1 will not need a reachability
   * filter.
   */
  it('reaches every combinatorially valid shape, twistable or not', () => {
    expect(square1ShapeSpace().distance.size).toBe(19_305);
  });

  it('reproduces the published twistable position count', () => {
    const twistableShapes = BigInt(
      [...square1ShapeSpace().distance.keys()].filter(isTwistableShapeKey).length,
    );
    const factorial8 = 40_320n;
    expect(twistableShapes * factorial8 * factorial8 * 2n).toBe(11_958_666_854_400n);
  });

  /**
   * The position count above is only the truth if shape, corner permutation,
   * edge permutation and the middle bit really are independent — the `x 8! x 8!
   * x 2` factorisation. A parity constraint linking any two of them (of the kind
   * every other puzzle in this package has) would make it an overcount.
   *
   * So: return many scrambled states to the solved *shape* and look at what
   * combinations of the three parities show up there. All eight do, which is
   * exactly the absence of such a constraint.
   */
  it('shows no parity constraint linking corners, edges and the middle', () => {
    const parityOf = (values: readonly number[]): number => {
      const seen = new Array<boolean>(values.length).fill(false);
      let transpositions = 0;
      for (let start = 0; start < values.length; start += 1) {
        if (seen[start]) continue;
        let length = 0;
        for (let at = start; !seen[at]; at = values[at]!) {
          seen[at] = true;
          length += 1;
        }
        transpositions += length - 1;
      }
      return transpositions % 2;
    };

    const readPieces = (state: Square1State, corners: boolean): number[] => {
      const pieces: number[] = [];
      for (let slot = 0; slot < SQUARE1_SLOT_COUNT; slot += 1) {
        const piece = state.slots[slot]!;
        const previous =
          state.slots[slot % RING_SLOTS === 0 ? slot + RING_SLOTS - 1 : slot - 1]!;
        if (piece === previous) continue;
        if (corners === piece < 8) pieces.push(corners ? piece : piece - 8);
      }
      return pieces;
    };

    const combinations = new Set<string>();
    for (let seed = 1; seed <= 200; seed += 1) {
      const scrambled = applySquare1Moves(SOLVED_SQUARE1_STATE, randomWalk(seed, 25));
      const state = applySquare1Moves(scrambled, solveSquare1Shape(scrambled));
      expect(square1ShapeKey(state)).toBe(SOLVED_SHAPE);
      combinations.add(
        `${parityOf(readPieces(state, true))}${parityOf(readPieces(state, false))}${state.middleFlipped ? 1 : 0}`,
      );
    }
    expect(combinations.size).toBe(8);
  });
});

describe('the shape distance table', () => {
  it('is a real BFS: every shape has a neighbour one step closer', () => {
    const { distance, representative } = square1ShapeSpace();
    const turns = allLayerTurns();
    let deepest = 0;
    for (const [key, depth] of distance) {
      deepest = Math.max(deepest, depth);
      if (depth === 0) continue;
      const state = representative.get(key)!;
      const successors = turns.map((turn) => applySquare1LayerTurn(state, turn));
      if (isSliceLegal(state)) successors.push(applySquare1Slice(state));
      expect(
        successors.some((next) => distance.get(square1ShapeKey(next)) === depth - 1),
      ).toBe(true);
    }
    // Shape alone is shallow — 14 moves reach every one of the 19,305 shapes,
    // against an estimated 25–27 for the whole puzzle. That is why shape can be
    // a phase of its own, and it bounds phase 1 exactly rather than by guess.
    expect(deepest).toBe(14);
  });

  it('descends to the solved shape from anywhere, in moves the puzzle allows', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const scrambled = applySquare1Moves(SOLVED_SQUARE1_STATE, randomWalk(seed, 18));
      const moves = solveSquare1Shape(scrambled);
      let state = scrambled;
      for (const move of moves) {
        // Throws if a slice was chosen where the puzzle would jam.
        state = applySquare1Move(state, move);
      }
      expect(square1ShapeKey(state)).toBe(SOLVED_SHAPE);
      expect(isWellFormedSquare1State(state)).toBe(true);
      expect(moves.length).toBeLessThanOrEqual(square1ShapeSpace().distance.get(
        square1ShapeKey(scrambled),
      )!);
    }
  });
});
