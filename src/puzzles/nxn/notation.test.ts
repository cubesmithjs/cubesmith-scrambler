import { describe, expect, it } from 'vitest';
import {
  allMovesForSize,
  inverseWideMove,
  inverseWideMoves,
  isWholeCubeRotation,
  maxDepthForSize,
  moveAxis,
  moveLayerSet,
  parseScrambleToken,
  parseWideMove,
  scrambleTokensToString,
  scrambleTokenToString,
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

describe('whole-cube rotations', () => {
  it('recognises a block that turns every layer', () => {
    expect(isWholeCubeRotation({ face: 'R', depth: 4, amount: 1 }, 4)).toBe(true);
    expect(isWholeCubeRotation({ face: 'R', depth: 3, amount: 1 }, 4)).toBe(false);
    expect(isWholeCubeRotation({ face: 'R', depth: 3, amount: 1 }, 3)).toBe(true);
  });

  it('spells them the way TNoodle does: R is x, U is y, F is z', () => {
    expect(scrambleTokenToString({ face: 'R', depth: 4, amount: 1 }, 4)).toBe('x');
    expect(scrambleTokenToString({ face: 'U', depth: 4, amount: 2 }, 4)).toBe('y2');
    expect(scrambleTokenToString({ face: 'F', depth: 4, amount: 3 }, 4)).toBe("z'");
  });

  it('refuses to spell a rotation about a face WCA has no name for', () => {
    // `L` at full depth is `x'`, not `x` about L. Rendering it as if it had its
    // own name would put two spellings of one rotation into a scramble.
    expect(() => scrambleTokenToString({ face: 'L', depth: 4, amount: 1 }, 4)).toThrow(
      /no WCA spelling/,
    );
  });

  it('leaves ordinary turns exactly as wideMoveToString renders them', () => {
    for (const move of allMovesForSize(5)) {
      expect(scrambleTokenToString(move, 5)).toBe(wideMoveToString(move));
    }
  });

  it('round-trips a rotation through parse and render', () => {
    for (const token of ['x', 'x2', "x'", 'y', 'y2', "y'", 'z', 'z2', "z'"]) {
      expect(scrambleTokenToString(parseScrambleToken(token, 4), 4)).toBe(token);
    }
  });

  it('resolves a rotation against the cube it is written for', () => {
    // The reason the size is required: `x` is four layers on a 4x4x4 and five
    // on a 5x5x5, so the token alone does not name a move.
    expect(parseScrambleToken('x', 4).depth).toBe(4);
    expect(parseScrambleToken('x', 5).depth).toBe(5);
  });

  it('still parses every ordinary turn token', () => {
    expect(parseScrambleToken("Rw'", 4)).toEqual({ face: 'R', depth: 2, amount: 3 });
    expect(parseScrambleToken('3Fw2', 7)).toEqual({ face: 'F', depth: 3, amount: 2 });
    expect(() => parseScrambleToken('Q', 4)).toThrow(/not a valid wide-move token/);
  });

  it('joins a mixed sequence into one scramble tail', () => {
    expect(
      scrambleTokensToString(
        [
          { face: 'R', depth: 1, amount: 1 },
          { face: 'U', depth: 4, amount: 3 },
        ],
        4,
      ),
    ).toBe("R y'");
  });
});
