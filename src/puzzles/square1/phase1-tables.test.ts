import { describe, expect, it } from 'vitest';
import { allLayerTurns } from './notation';
import {
  isTwistableShape,
  sliceParityFlip,
  turnParityFlip,
  movesToPhase1Goal,
  requiredCombinedParity,
  phase1Table,
  rotateStarts,
  shapeKeyFromStarts,
  sliceShapeKey,
  SQUARE_LAYER_SHAPE_KEYS,
  squareRingStarts,
  turnShapeKey,
  upperStarts,
} from './phase1-tables';
import { enumerateAllShapeKeys, isTwistableShapeKey, square1ShapeSpace } from './shapes';
import {
  applySquare1LayerTurn,
  applySquare1Slice,
  hasSquareLayers,
  isSliceLegal,
  RING_SLOTS,
  SOLVED_SQUARE1_STATE,
  square1ShapeKey,
} from './state';

describe('bit-level shape transitions', () => {
  /**
   * The whole point of this module is that it does in two shifts what
   * `state.ts` does with a 24-element array. That is only worth having if the
   * two agree everywhere, so: every reachable shape, every one of the 143
   * turns, and the slice — checked against the state model rather than against
   * a second copy of these formulas.
   */
  it('agree with the state model on every shape and every move', () => {
    const { representative } = square1ShapeSpace();
    const turns = allLayerTurns();
    const disagreements: string[] = [];
    let checkedTurns = 0;
    let checkedSlices = 0;
    let blocked = 0;

    // Deliberately no `expect` inside the loop: 2.8M assertions cost half a
    // minute of matcher overhead to prove the same thing one assertion does.
    for (const [key, state] of representative) {
      for (const turn of turns) {
        const fast = turnShapeKey(key, turn.top, turn.bottom);
        const slow = square1ShapeKey(applySquare1LayerTurn(state, turn));
        if (fast !== slow) disagreements.push(`turn ${turn.top},${turn.bottom} on ${key}`);
        checkedTurns += 1;
      }

      const legal = isSliceLegal(state);
      if (isTwistableShape(key) !== legal) disagreements.push(`legality of ${key}`);
      if (isTwistableShape(key) !== isTwistableShapeKey(key)) {
        disagreements.push(`twistability of ${key}`);
      }
      if (legal) {
        if (sliceShapeKey(key) !== square1ShapeKey(applySquare1Slice(state))) {
          disagreements.push(`slice on ${key}`);
        }
        checkedSlices += 1;
      } else {
        if (sliceShapeKey(key) !== undefined) disagreements.push(`slice allowed on ${key}`);
        blocked += 1;
      }
    }

    expect(disagreements.slice(0, 5)).toEqual([]);
    expect(checkedTurns).toBe(19_305 * 143);
    expect(checkedSlices).toBe(3_678);
    expect(blocked).toBe(19_305 - 3_678);
  });

  it('rotate a ring the way the notation says each layer turns', () => {
    // Upper ring: `x` increases slot indices. Lower ring: `y` decreases them.
    const key = square1ShapeKey(SOLVED_SQUARE1_STATE);
    expect(upperStarts(turnShapeKey(key, 1, 0))).toBe(rotateStarts(upperStarts(key), 1));
    expect(turnShapeKey(key, 12, 12)).toBe(key);
    expect(turnShapeKey(turnShapeKey(key, 5, 7), -5, -7)).toBe(key);
  });

  it('make the slice an involution wherever it is allowed', () => {
    for (const key of enumerateAllShapeKeys()) {
      const sliced = sliceShapeKey(key);
      if (sliced === undefined) continue;
      expect(sliceShapeKey(sliced)).toBe(key);
    }
  });
});

describe('the square-layer goal set', () => {
  it('is the nine alignment pairs, and the solved shape is one of them', () => {
    expect(new Set(SQUARE_LAYER_SHAPE_KEYS).size).toBe(9);
    expect(SQUARE_LAYER_SHAPE_KEYS).toContain(square1ShapeKey(SOLVED_SQUARE1_STATE));
    for (const key of SQUARE_LAYER_SHAPE_KEYS) {
      expect(square1ShapeSpace().representative.has(key)).toBe(true);
      expect(hasSquareLayers(square1ShapeSpace().representative.get(key)!)).toBe(true);
    }
  });

  /**
   * Only alignments 0 and 1 are twistable — alignment 2 puts corners on `(2,3)`
   * and `(8,9)`, straddling both cuts — so four of the nine admit a slice at
   * all, and phase 2 will find only two of those keep the layers square.
   */
  it('has exactly four twistable members', () => {
    expect(SQUARE_LAYER_SHAPE_KEYS.filter(isTwistableShape)).toHaveLength(4);
    expect(isTwistableShape(shapeKeyFromStarts(squareRingStarts(2), squareRingStarts(0)))).toBe(
      false,
    );
  });
});

describe('the phase-1 distance table', () => {
  it('covers every shape, and only the goal set is at distance zero', () => {
    const { keys, distance } = phase1Table();
    expect(keys).toHaveLength(19_305);
    expect(distance).toHaveLength(19_305 * 2);
    expect([...distance].filter((value) => value === 255)).toHaveLength(0);
    expect([...distance].filter((value) => value === 0)).toHaveLength(9);
    for (const key of SQUARE_LAYER_SHAPE_KEYS) {
      // Square layers with the *wrong* parity is not the goal — one of the two
      // parities is at distance 0 and the other is not.
      const parities = [0, 1].map((parity) => movesToPhase1Goal(key, parity));
      expect(parities.filter((value) => value === 0)).toHaveLength(1);
    }
  });

  /**
   * Having nine goal shapes instead of one buys **almost nothing**, and it is
   * worth recording why rather than assuming otherwise: a single turn moves
   * between any two alignment pairs (`(a,b) → (a+x, b−y)` covers all nine), so
   * the nine goals sit within one move of each other and the radius can only
   * drop by that one. It does not even drop by that — 14 to reach one specific
   * shape, 14 to reach the nearest of all nine.
   *
   * The mean is what actually matters for solution length, and it is 9.26
   * moves — about 4.6 turn-slice groups. The effective branching toward *new*
   * shapes is therefore only ~7 per group, far below the 143 turns available,
   * because a slice only ever exchanges two five-bit moving halves.
   */
  it('is as deep as the shape space, and every shape has a neighbour one step closer', () => {
    const { keys, distance, indexOf } = phase1Table();
    const turns = allLayerTurns();
    let deepest = 0;
    let stuck = 0;

    for (const [index, key] of keys.entries()) {
      for (const parity of [0, 1]) {
        const depth = distance[index * 2 + parity]!;
        deepest = Math.max(deepest, depth);
        if (depth === 0) continue;

        const successors = turns.map(
          (turn) =>
            indexOf.get(turnShapeKey(key, turn.top, turn.bottom))! * 2 +
            (parity ^ turnParityFlip(key, turn.top, turn.bottom)),
        );
        const sliced = sliceShapeKey(key);
        if (sliced !== undefined) {
          successors.push(indexOf.get(sliced)! * 2 + (parity ^ sliceParityFlip(key)));
        }
        if (!successors.some((next) => distance[next] === depth - 1)) stuck += 1;
      }
    }
    expect(stuck).toBe(0);

    const mean = [...distance].reduce((a, b) => a + b, 0) / distance.length;
    expect(deepest).toBeGreaterThan(9);
    expect(mean).toBeGreaterThan(8);
    expect(mean).toBeLessThan(13);
  });

  it('rejects a key that is not a shape at all', () => {
    expect(() => movesToPhase1Goal(0, 0)).toThrow(/not a shape/);
    // Corners on adjacent starts would have to overlap.
    expect(() => movesToPhase1Goal(shapeKeyFromStarts(0b11, 0b11), 0)).toThrow();
  });

  /**
   * The goal parity comes out of phase 2's class table, so it is a fact about
   * the puzzle rather than a constant written here — but it is worth pinning,
   * because it is what a wrong position ordering would silently change.
   */
  it('requires the parity phase 2 can actually finish from', () => {
    const required = Array.from({ length: 9 }, (_, alignment) =>
      requiredCombinedParity(alignment),
    );
    expect(required).toEqual([0, 1, 1, 1, 0, 0, 1, 0, 0]);
  });
});

describe('the ring helpers', () => {
  it('rotate cyclically within 12 slots', () => {
    expect(rotateStarts(0b1, 1)).toBe(0b10);
    expect(rotateStarts(1 << (RING_SLOTS - 1), 1)).toBe(1);
    expect(rotateStarts(0b101, RING_SLOTS)).toBe(0b101);
    expect(rotateStarts(0b101, -1)).toBe(rotateStarts(0b101, RING_SLOTS - 1));
  });

  it('describe square rings as corners every third slot', () => {
    expect(squareRingStarts(0)).toBe((1 << 0) | (1 << 3) | (1 << 6) | (1 << 9));
    expect(squareRingStarts(1)).toBe((1 << 1) | (1 << 4) | (1 << 7) | (1 << 10));
    expect(squareRingStarts(3)).toBe(squareRingStarts(0));
  });
});
