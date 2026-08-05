import { describe, expect, it } from 'vitest';
import {
  allMovesForSize,
  inverseWideMove,
  inverseWideMoves,
  maxDepthForSize,
  moveAxis,
  moveLayerSet,
  parseWideMove,
  wideMovesToString,
  wideMoveToString,
  type WideMove,
} from './notation';

describe('maxDepthForSize', () => {
  /**
   * Past halfway, a block turn is the opposite face's block turn composed with
   * a rotation of the whole puzzle — notation, not a new move. So the depth
   * cap is `floor(n/2)`: R/Rw for 4x4x4 and 5x5x5, and R/Rw/3Rw for 6x6x6 and
   * 7x7x7, which is exactly what official scrambles use.
   */
  it('is floor(n/2)', () => {
    expect(maxDepthForSize(2)).toBe(1);
    expect(maxDepthForSize(3)).toBe(1);
    expect(maxDepthForSize(4)).toBe(2);
    expect(maxDepthForSize(5)).toBe(2);
    expect(maxDepthForSize(6)).toBe(3);
    expect(maxDepthForSize(7)).toBe(3);
  });

  it('rejects a size that is not a cube size', () => {
    for (const bad of [1, 0, -3, 2.5, NaN]) {
      expect(() => maxDepthForSize(bad)).toThrow();
    }
  });
});

describe('wideMoveToString', () => {
  it('renders depth 1 bare, depth 2 with w, and deeper with a count', () => {
    expect(wideMoveToString({ face: 'R', depth: 1, amount: 1 })).toBe('R');
    expect(wideMoveToString({ face: 'R', depth: 1, amount: 2 })).toBe('R2');
    expect(wideMoveToString({ face: 'R', depth: 1, amount: 3 })).toBe("R'");
    expect(wideMoveToString({ face: 'R', depth: 2, amount: 1 })).toBe('Rw');
    expect(wideMoveToString({ face: 'U', depth: 2, amount: 3 })).toBe("Uw'");
    expect(wideMoveToString({ face: 'F', depth: 3, amount: 2 })).toBe('3Fw2');
  });

  it('never writes 2Rw, since Rw is the spelling official scrambles use', () => {
    for (const face of ['U', 'D', 'F', 'B', 'L', 'R'] as const) {
      expect(wideMoveToString({ face, depth: 2, amount: 1 })).not.toContain('2');
    }
  });

  it('joins a sequence with single spaces', () => {
    expect(
      wideMovesToString([
        { face: 'R', depth: 1, amount: 1 },
        { face: 'U', depth: 2, amount: 3 },
        { face: 'F', depth: 3, amount: 2 },
      ]),
    ).toBe("R Uw' 3Fw2");
  });
});

describe('parseWideMove', () => {
  it('round-trips every move on a 7x7x7', () => {
    for (const move of allMovesForSize(7)) {
      expect(parseWideMove(wideMoveToString(move))).toEqual(move);
    }
  });

  it('accepts 2Rw as an alias for Rw even though it is never produced', () => {
    expect(parseWideMove('2Rw')).toEqual({ face: 'R', depth: 2, amount: 1 });
    expect(parseWideMove("2Rw'")).toEqual({ face: 'R', depth: 2, amount: 3 });
  });

  it('rejects malformed tokens', () => {
    for (const bad of ['', 'r', 'R3', '3R', 'Rw3', 'X', 'RW', "R''", ' R', 'R2w']) {
      expect(() => parseWideMove(bad)).toThrow();
    }
  });

  it('rejects a layer count without a w — 3R is not wide-move notation', () => {
    expect(() => parseWideMove('3R')).toThrow(/no 'w'/);
  });
});

describe('inversion', () => {
  it('is an involution preserving face and depth', () => {
    for (const move of allMovesForSize(7)) {
      const inverted = inverseWideMove(move);
      expect(inverted.face).toBe(move.face);
      expect(inverted.depth).toBe(move.depth);
      expect(inverseWideMove(inverted)).toEqual(move);
    }
  });

  it('leaves a half turn alone', () => {
    expect(inverseWideMove({ face: 'R', depth: 2, amount: 2 })).toEqual({
      face: 'R',
      depth: 2,
      amount: 2,
    });
  });

  it('reverses a sequence as well as each move', () => {
    expect(
      wideMovesToString(
        inverseWideMoves([
          { face: 'R', depth: 1, amount: 1 },
          { face: 'U', depth: 2, amount: 2 },
          { face: 'F', depth: 3, amount: 3 },
        ] satisfies WideMove[]),
      ),
    ).toBe('3Fw Uw2 R\'');
  });
});

describe('allMovesForSize', () => {
  it('is 6 faces x depths x 3 amounts', () => {
    expect(allMovesForSize(3)).toHaveLength(18);
    expect(allMovesForSize(4)).toHaveLength(36);
    expect(allMovesForSize(5)).toHaveLength(36);
    expect(allMovesForSize(6)).toHaveLength(54);
    expect(allMovesForSize(7)).toHaveLength(54);
  });

  it('every move is distinct', () => {
    for (const size of [4, 5, 6, 7]) {
      const moves = allMovesForSize(size);
      expect(new Set(moves.map(wideMoveToString)).size).toBe(moves.length);
    }
  });
});

describe('moveAxis and moveLayerSet', () => {
  it('pair opposite faces onto one axis', () => {
    expect(moveAxis({ face: 'R', depth: 1, amount: 1 })).toBe('x');
    expect(moveAxis({ face: 'L', depth: 3, amount: 2 })).toBe('x');
    expect(moveAxis({ face: 'U', depth: 1, amount: 1 })).toBe('y');
    expect(moveAxis({ face: 'D', depth: 2, amount: 1 })).toBe('y');
    expect(moveAxis({ face: 'F', depth: 1, amount: 1 })).toBe('z');
    expect(moveAxis({ face: 'B', depth: 1, amount: 1 })).toBe('z');
  });

  it('layer sets ignore the amount but distinguish depth', () => {
    expect(moveLayerSet({ face: 'R', depth: 1, amount: 1 })).toBe(
      moveLayerSet({ face: 'R', depth: 1, amount: 3 }),
    );
    expect(moveLayerSet({ face: 'R', depth: 1, amount: 1 })).not.toBe(
      moveLayerSet({ face: 'R', depth: 2, amount: 1 }),
    );
    expect(moveLayerSet({ face: 'R', depth: 1, amount: 1 })).not.toBe(
      moveLayerSet({ face: 'L', depth: 1, amount: 1 }),
    );
  });
});
