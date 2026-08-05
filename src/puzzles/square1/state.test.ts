import { describe, expect, it } from 'vitest';
import {
  allLayerTurns,
  inverseSquare1Moves,
  isLayerTurn,
  layerTurn,
  parseSquare1Scramble,
  SLICE,
  square1MovesToString,
  type Square1Move,
} from './notation';
import {
  applySquare1LayerTurn,
  applySquare1Move,
  applySquare1Moves,
  applySquare1Slice,
  cornersPerRing,
  hasSquareLayers,
  isSliceLegal,
  isSquare1CubeShaped,
  isSquare1Solved,
  isWellFormedSquare1State,
  LOWER_RING,
  RING_SLOTS,
  sliceUnchecked,
  SOLVED_SQUARE1_STATE,
  square1Alignments,
  square1ShapeKey,
  Square1IllegalSliceError,
  square1StatesEqual,
  UPPER_RING,
  type Square1State,
} from './state';

/** Verbatim, from a Square-1 scramble tutorial. See docs/square1-design.md §2. */
const OFFICIAL =
  '(-2, 0) / (-3, -3) / (2, 5) / (0, 3) / (-3, 0) / (-5, -2) / (-4, 0) / (-3, 3) / (3, 0) / (1, 2) / (0, 2) / (-6, 0) /';

function makeRandom(seed: number): (bound: number) => number {
  let state = seed;
  return (bound) => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % bound;
  };
}

/** A random legal walk: a random pair, then a slice whenever the state allows one. */
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

describe('the solved state', () => {
  it('is a state the puzzle could actually be in', () => {
    expect(isWellFormedSquare1State(SOLVED_SQUARE1_STATE)).toBe(true);
    expect(isSquare1Solved(SOLVED_SQUARE1_STATE)).toBe(true);
    expect(cornersPerRing(SOLVED_SQUARE1_STATE)).toEqual([4, 4]);
    expect(isSquare1CubeShaped(SOLVED_SQUARE1_STATE)).toBe(true);
  });

  /** Regulation 4b3d's second clause, at the one state everybody starts from. */
  it('allows a slice with no prior layer turn', () => {
    expect(isSliceLegal(SOLVED_SQUARE1_STATE)).toBe(true);
  });
});

describe('layer turns', () => {
  it('are always legal, from every state a walk reaches', () => {
    for (const turn of allLayerTurns()) {
      expect(isWellFormedSquare1State(applySquare1LayerTurn(SOLVED_SQUARE1_STATE, turn))).toBe(
        true,
      );
    }
    for (let seed = 1; seed <= 20; seed += 1) {
      const state = applySquare1Moves(SOLVED_SQUARE1_STATE, randomWalk(seed, 12));
      for (const turn of allLayerTurns()) {
        expect(isWellFormedSquare1State(applySquare1LayerTurn(state, turn))).toBe(true);
      }
    }
  });

  /**
   * The direction convention, stated as an assertion rather than a comment:
   * `x` adds to upper-ring indices and `y` *subtracts* from lower-ring ones,
   * because both rings are indexed in one absolute frame while `y` is measured
   * from outside the lower face. `state.ts` explains why; the four-way test at
   * the bottom of this file is what proves it.
   */
  it('shift the two rings in opposite index directions', () => {
    const up = applySquare1LayerTurn(SOLVED_SQUARE1_STATE, layerTurn(1, 0));
    expect(up.slots[UPPER_RING + 1]).toBe(SOLVED_SQUARE1_STATE.slots[UPPER_RING + 0]);
    expect(up.slots.slice(LOWER_RING)).toEqual(SOLVED_SQUARE1_STATE.slots.slice(LOWER_RING));

    const down = applySquare1LayerTurn(SOLVED_SQUARE1_STATE, layerTurn(0, 1));
    expect(down.slots[LOWER_RING + RING_SLOTS - 1]).toBe(
      SOLVED_SQUARE1_STATE.slots[LOWER_RING + 0],
    );
    expect(down.slots.slice(0, RING_SLOTS)).toEqual(
      SOLVED_SQUARE1_STATE.slots.slice(0, RING_SLOTS),
    );
  });

  it('compose additively, so the pair really is one move in Z12 x Z12', () => {
    const next = makeRandom(7);
    for (let trial = 0; trial < 200; trial += 1) {
      const a = next(12);
      const b = next(12);
      const c = next(12);
      const d = next(12);
      if ((a === 0 && b === 0) || (c === 0 && d === 0)) continue;
      const stepwise = applySquare1LayerTurn(
        applySquare1LayerTurn(SOLVED_SQUARE1_STATE, layerTurn(a, b)),
        layerTurn(c, d),
      );
      const combined =
        (a + c) % 12 === 0 && (b + d) % 12 === 0
          ? SOLVED_SQUARE1_STATE
          : applySquare1LayerTurn(SOLVED_SQUARE1_STATE, layerTurn(a + c, b + d));
      expect(square1StatesEqual(stepwise, combined)).toBe(true);
    }
  });

  it('never touch the middle', () => {
    for (const turn of allLayerTurns()) {
      expect(applySquare1LayerTurn(SOLVED_SQUARE1_STATE, turn).middleFlipped).toBe(false);
    }
  });
});

describe('the slice', () => {
  it('is an involution, middle bit included', () => {
    const once = applySquare1Slice(SOLVED_SQUARE1_STATE);
    expect(once.middleFlipped).toBe(true);
    const twice = applySquare1Slice(once);
    expect(square1StatesEqual(twice, SOLVED_SQUARE1_STATE)).toBe(true);

    for (let seed = 1; seed <= 30; seed += 1) {
      const state = applySquare1Moves(SOLVED_SQUARE1_STATE, randomWalk(seed, 10));
      if (!isSliceLegal(state)) continue;
      expect(square1StatesEqual(applySquare1Slice(applySquare1Slice(state)), state)).toBe(true);
    }
  });

  /**
   * `(2,0)` slides the corner that was on slots `(0,1)` onto `(2,3)`, which is
   * exactly one of the two cut boundaries — so the puzzle physically jams.
   */
  it('refuses to run when a corner straddles the cut', () => {
    const jammed = applySquare1LayerTurn(SOLVED_SQUARE1_STATE, layerTurn(2, 0));
    expect(jammed.slots[2]).toBe(jammed.slots[3]);
    expect(isSliceLegal(jammed)).toBe(false);
    expect(() => applySquare1Slice(jammed)).toThrow(Square1IllegalSliceError);
    expect(() => applySquare1Move(jammed, SLICE)).toThrow(/straddles the cut/);
  });

  /**
   * The legality predicate, checked against something that shares no code with
   * it: run the slot map anyway and see whether the result is a state the puzzle
   * could be in. Tearing a corner in half is what illegality *means*, so the two
   * must agree on every state.
   */
  it('is legal exactly when the raw slot map leaves the state well formed', () => {
    let checked = 0;
    let illegalSeen = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      let state = SOLVED_SQUARE1_STATE;
      for (const move of randomWalk(seed, 8)) {
        state = applySquare1Move(state, move);
        for (const turn of allLayerTurns()) {
          const probe = applySquare1LayerTurn(state, turn);
          const legal = isSliceLegal(probe);
          expect(legal).toBe(isWellFormedSquare1State(sliceUnchecked(probe)));
          checked += 1;
          if (!legal) illegalSeen += 1;
        }
      }
    }
    // Both branches have to be exercised for the agreement to mean anything.
    expect(checked).toBeGreaterThan(10_000);
    expect(illegalSeen).toBeGreaterThan(1_000);
  });

  it('flips the middle once per slice, so the bit is the slice parity', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const moves = randomWalk(seed, 14);
      const slices = moves.filter((move) => !isLayerTurn(move)).length;
      const state = applySquare1Moves(SOLVED_SQUARE1_STATE, moves);
      expect(state.middleFlipped).toBe(slices % 2 === 1);
    }
  });
});

describe('inverse moves restore the state', () => {
  it('for every single move', () => {
    for (const turn of allLayerTurns()) {
      const there = applySquare1LayerTurn(SOLVED_SQUARE1_STATE, turn);
      const back = applySquare1Moves(there, inverseSquare1Moves([turn]));
      expect(square1StatesEqual(back, SOLVED_SQUARE1_STATE)).toBe(true);
    }
    expect(
      square1StatesEqual(
        applySquare1Moves(SOLVED_SQUARE1_STATE, [SLICE, SLICE]),
        SOLVED_SQUARE1_STATE,
      ),
    ).toBe(true);
  });

  it('for random legal walks', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const moves = randomWalk(seed, 16);
      const scrambled = applySquare1Moves(SOLVED_SQUARE1_STATE, moves);
      expect(isWellFormedSquare1State(scrambled)).toBe(true);
      expect(isSquare1Solved(scrambled)).toBe(false);
      const back = applySquare1Moves(scrambled, inverseSquare1Moves(moves));
      expect(isSquare1Solved(back)).toBe(true);
    }
  });

  /**
   * Restoring the solved state is the easy case — a bug that permutes pieces
   * consistently would still pass it. This starts somewhere arbitrary.
   *
   * The continuation has to be *grown* rather than written down: whether a slice
   * is legal depends on the state it is applied to, so a fixed sequence picked
   * in advance jams on most starting states.
   */
  it('holds from a scrambled start too, not only from solved', () => {
    const start = applySquare1Moves(SOLVED_SQUARE1_STATE, randomWalk(99, 20));
    const next = makeRandom(4242);
    const turns = allLayerTurns();
    const moves: Square1Move[] = [];
    let state = start;
    for (let i = 0; i < 6; i += 1) {
      const turn = turns[next(turns.length)]!;
      moves.push(turn);
      state = applySquare1LayerTurn(state, turn);
      if (isSliceLegal(state)) {
        moves.push(SLICE);
        state = applySquare1Slice(state);
      }
    }
    expect(moves.some((move) => !isLayerTurn(move))).toBe(true);
    expect(square1StatesEqual(state, start)).toBe(false);
    const back = applySquare1Moves(state, inverseSquare1Moves(moves));
    expect(square1StatesEqual(back, start)).toBe(true);
  });
});

describe('shape transitions', () => {
  it('a 90° turn of both layers keeps the absolute shape; a 30° turn moves it', () => {
    const solvedKey = square1ShapeKey(SOLVED_SQUARE1_STATE);
    expect(square1ShapeKey(applySquare1LayerTurn(SOLVED_SQUARE1_STATE, layerTurn(3, 3)))).toBe(
      solvedKey,
    );
    expect(
      square1ShapeKey(applySquare1LayerTurn(SOLVED_SQUARE1_STATE, layerTurn(1, 0))),
    ).not.toBe(solvedKey);
  });

  it('depends on where the corners are, not on which corners they are', () => {
    const slots = SOLVED_SQUARE1_STATE.slots.slice();
    // Swap two whole corners and two edges: same shape, different position.
    [slots[0], slots[1], slots[3], slots[4]] = [slots[1]!, slots[0]!, slots[4]!, slots[3]!];
    [slots[0], slots[1], slots[3], slots[4]] = [slots[3]!, slots[4]!, slots[0]!, slots[1]!];
    [slots[2], slots[5]] = [slots[5]!, slots[2]!];
    const permuted: Square1State = { slots, middleFlipped: false };
    expect(isWellFormedSquare1State(permuted)).toBe(true);
    expect(isSquare1Solved(permuted)).toBe(false);
    expect(square1ShapeKey(permuted)).toBe(square1ShapeKey(SOLVED_SQUARE1_STATE));
  });

  /**
   * The open question `docs/square1-design.md` §8 left for computation, now
   * answered — and the answer is the counter-intuitive one.
   *
   * A slice is a 180° rotation about the axis perpendicular to the cut, so it
   * brings the moving arc back **reversed**. A square layer's half always reads
   * `C E C E`, never a palindrome, so reversing it yields `E C E C` — which
   * fits only if the *receiving* ring was itself aligned the other way. From
   * solved, where both rings share one alignment, a single slice therefore
   * leaves square layers entirely. Geometrically it must: the cut of a square
   * layer runs 15° off a face normal, and a cube has no 180° symmetry about an
   * axis 15° off a face normal.
   *
   * With the lower ring shifted one unit into the complementary alignment, the
   * same slice keeps both layers square. Note what it does *not* do: the two
   * squares end up 30° out of step, which is two squares and not a cube. That
   * larger "square layers" set, not cube shape, is what phase 2 of the solver
   * moves inside — real Square-1 algorithms pass through exactly these states.
   */
  it('a single slice leaves square layers from solved, but keeps them from the complementary alignment', () => {
    const sliced = applySquare1Slice(SOLVED_SQUARE1_STATE);
    expect(isWellFormedSquare1State(sliced)).toBe(true);
    expect(hasSquareLayers(sliced)).toBe(false);
    expect(cornersPerRing(sliced)).toEqual([4, 4]);

    const complementary = applySquare1LayerTurn(SOLVED_SQUARE1_STATE, layerTurn(0, -1));
    expect(square1Alignments(complementary)).toEqual([0, 1]);
    expect(isSquare1CubeShaped(complementary)).toBe(false);
    expect(hasSquareLayers(complementary)).toBe(true);
    expect(isSliceLegal(complementary)).toBe(true);

    // And it comes back to the *same* alignment pair, not the mirrored one:
    // each ring keeps its two fixed corner starts and receives the other ring's
    // two moving ones reflected onto exactly the slots it just vacated. So a
    // slice never moves between (0,1) and (1,0) — phase 2 changes alignment
    // only by turning.
    const stillSquare = applySquare1Slice(complementary);
    expect(hasSquareLayers(stillSquare)).toBe(true);
    expect(isSquare1CubeShaped(stillSquare)).toBe(false);
    expect(square1Alignments(stillSquare)).toEqual([0, 1]);
  });

  /**
   * Cube shape is the *aligned* subset: alignment `2` is never twistable, so of
   * the nine square-layer alignment pairs only `(0,1)` and `(1,0)` admit a
   * slice that keeps the layers square, and neither of those is a cube.
   */
  it('separates "both layers square" from "the puzzle is a cube"', () => {
    expect(isSquare1CubeShaped(SOLVED_SQUARE1_STATE)).toBe(true);
    expect(square1Alignments(SOLVED_SQUARE1_STATE)).toEqual([0, 0]);
    for (const amount of [1, 2, 3]) {
      const turned = applySquare1LayerTurn(SOLVED_SQUARE1_STATE, layerTurn(amount, amount));
      expect(hasSquareLayers(turned)).toBe(true);
      // A turn of both layers the same way is *not* the same alignment shift:
      // `y` runs the other way round the ring, so (a, a) becomes (a+x, a-x).
      const alignments = square1Alignments(turned)!;
      expect(alignments).toEqual([amount % 3, (3 - (amount % 3)) % 3]);
      expect(isSquare1CubeShaped(turned)).toBe(amount % 3 === 0);
    }
    expect(square1Alignments(applySquare1Slice(SOLVED_SQUARE1_STATE))).toBeUndefined();
  });

  it('keeps every ring between two and six corners, always', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      let state = SOLVED_SQUARE1_STATE;
      for (const move of randomWalk(seed, 20)) {
        state = applySquare1Move(state, move);
        const [upper, lower] = cornersPerRing(state);
        expect(upper + lower).toBe(8);
        expect(upper).toBeGreaterThanOrEqual(2);
        expect(upper).toBeLessThanOrEqual(6);
      }
    }
  });
});

/**
 * The sources define `y` as "the bottom twisted clockwise" and stop there,
 * without naming the viewpoint, and they do not fix which of the two twistable
 * cube alignments is the solved one. Both are settled here against external
 * data rather than by preference.
 *
 * A real official scramble is a sequence somebody physically applied, so every
 * `/` in it must be legal at the moment it appears, and — Regulation 4b3d — its
 * end state must itself allow a `/`. That is a demanding test: a slice is
 * blocked roughly half the time, so twelve of them surviving in a row is not
 * something a wrong model gets away with.
 *
 * The applier below is written from scratch, sharing nothing with `state.ts`
 * except the notation parser, and is parameterised over both open choices.
 */
describe('conventions, pinned against an official scramble', () => {
  const MOVING = [9, 10, 11, 0, 1, 2];
  const BOUNDARIES: readonly (readonly [number, number])[] = [
    [2, 3],
    [8, 9],
  ];

  /** Corners on `(a, a+1) (a+3, a+4) (a+6, a+7) (a+9, a+10)`, edges between. */
  function solvedWithAlignment(alignment: number): number[] {
    const ring = (cornerBase: number, edgeBase: number): number[] => {
      const slots = new Array<number>(RING_SLOTS).fill(-1);
      for (let k = 0; k < 4; k += 1) {
        const start = (alignment + 3 * k) % RING_SLOTS;
        slots[start] = cornerBase + k;
        slots[(start + 1) % RING_SLOTS] = cornerBase + k;
        slots[(start + 2) % RING_SLOTS] = edgeBase + k;
      }
      return slots;
    };
    return [...ring(0, 8), ...ring(4, 12)];
  }

  const sliceable = (slots: readonly number[]): boolean =>
    [0, RING_SLOTS].every((ring) =>
      BOUNDARIES.every(([a, b]) => slots[ring + a] !== slots[ring + b]),
    );

  function trace(
    text: string,
    alignment: number,
    lowerSign: 1 | -1,
  ): { readonly jammedAt: number; readonly endsTwistable: boolean; readonly slots: number[] } {
    let slots = solvedWithAlignment(alignment);
    for (const [index, move] of parseSquare1Scramble(text).entries()) {
      if (isLayerTurn(move)) {
        const next = slots.slice();
        for (let i = 0; i < RING_SLOTS; i += 1) {
          next[(i + move.top) % RING_SLOTS] = slots[i]!;
          next[RING_SLOTS + ((i + lowerSign * move.bottom + 2 * RING_SLOTS) % RING_SLOTS)] =
            slots[RING_SLOTS + i]!;
        }
        slots = next;
        continue;
      }
      if (!sliceable(slots)) return { jammedAt: index, endsTwistable: false, slots };
      const next = slots.slice();
      for (const i of MOVING) {
        const landing = RING_SLOTS - 1 - i;
        next[landing] = slots[RING_SLOTS + i]!;
        next[RING_SLOTS + landing] = slots[i]!;
      }
      slots = next;
    }
    return { jammedAt: -1, endsTwistable: sliceable(slots), slots };
  }

  it('leaves exactly one of the four candidate models standing', () => {
    const survivors: string[] = [];
    for (const alignment of [0, 1]) {
      for (const lowerSign of [-1, 1] as const) {
        const result = trace(OFFICIAL, alignment, lowerSign);
        if (result.jammedAt === -1 && result.endsTwistable) {
          survivors.push(`alignment=${alignment} lowerSign=${lowerSign}`);
        }
      }
    }
    expect(survivors).toEqual(['alignment=0 lowerSign=-1']);
  });

  it('and that survivor is the model this package implements', () => {
    const independent = trace(OFFICIAL, 0, -1);
    expect(independent.jammedAt).toBe(-1);

    const moves = parseSquare1Scramble(OFFICIAL);
    const mine = applySquare1Moves(SOLVED_SQUARE1_STATE, moves);
    expect(mine.slots).toEqual(independent.slots);
    expect(isWellFormedSquare1State(mine)).toBe(true);
    expect(isSliceLegal(mine)).toBe(true);
    expect(isSquare1Solved(mine)).toBe(false);
    // Twelve slices: an even number, so the middle comes back the right way up.
    expect(mine.middleFlipped).toBe(false);
    expect(square1MovesToString(moves)).toContain('/');
  });
});
