import { describe, expect, it } from 'vitest';
import {
  allLayerMovesPyraminx,
  inversePyraminxMove,
  inversePyraminxMoves,
  parsePyraminxMove,
  PYRAMINX_AMOUNTS,
  PYRAMINX_VERTICES,
  pyraminxMovesToString,
  pyraminxMoveToString,
  type PyraminxMove,
} from './notation';

const ALL_MOVES: PyraminxMove[] = PYRAMINX_VERTICES.flatMap((vertex) =>
  PYRAMINX_AMOUNTS.flatMap((amount) =>
    [false, true].map((tip): PyraminxMove => ({ vertex, amount, tip })),
  ),
);

describe('pyraminxMoveToString', () => {
  it('uses uppercase for layer turns and lowercase for tips', () => {
    expect(pyraminxMoveToString({ vertex: 'U', amount: 1, tip: false })).toBe('U');
    expect(pyraminxMoveToString({ vertex: 'U', amount: 2, tip: false })).toBe("U'");
    expect(pyraminxMoveToString({ vertex: 'B', amount: 1, tip: true })).toBe('b');
    expect(pyraminxMoveToString({ vertex: 'B', amount: 2, tip: true })).toBe("b'");
  });

  it('joins a sequence with single spaces', () => {
    expect(
      pyraminxMovesToString([
        { vertex: 'U', amount: 1, tip: false },
        { vertex: 'L', amount: 2, tip: false },
        { vertex: 'R', amount: 1, tip: true },
      ]),
    ).toBe("U L' r");
  });
});

describe('parsePyraminxMove', () => {
  it('round-trips every one of the 16 tokens', () => {
    for (const move of ALL_MOVES) {
      expect(parsePyraminxMove(pyraminxMoveToString(move))).toEqual(move);
    }
  });

  it('rejects tokens that are not Pyraminx moves', () => {
    for (const bad of ['', 'U2', 'F', 'x', "U''", 'Uu', ' U', 'D']) {
      expect(() => parsePyraminxMove(bad)).toThrow();
    }
  });
});

describe('inversion', () => {
  it('is an involution on every move, preserving vertex and tip-ness', () => {
    for (const move of ALL_MOVES) {
      const inverted = inversePyraminxMove(move);
      expect(inverted.vertex).toBe(move.vertex);
      expect(inverted.tip).toBe(move.tip);
      expect(inverted.amount).not.toBe(move.amount);
      expect(inversePyraminxMove(inverted)).toEqual(move);
    }
  });

  it('reverses a sequence as well as each move', () => {
    const sequence: PyraminxMove[] = [
      { vertex: 'U', amount: 1, tip: false },
      { vertex: 'L', amount: 2, tip: false },
      { vertex: 'B', amount: 1, tip: true },
    ];
    expect(pyraminxMovesToString(inversePyraminxMoves(sequence))).toBe("b' L U'");
  });
});

describe('allLayerMovesPyraminx', () => {
  it('is the eight uppercase turns and nothing else', () => {
    const moves = allLayerMovesPyraminx();
    expect(moves).toHaveLength(8);
    expect(moves.every((m) => !m.tip)).toBe(true);
    expect(new Set(moves.map(pyraminxMoveToString))).toEqual(
      new Set(['U', "U'", 'L', "L'", 'R', "R'", 'B', "B'"]),
    );
  });
});
