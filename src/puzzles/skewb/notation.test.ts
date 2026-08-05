import { describe, expect, it } from 'vitest';
import {
  allMovesSkewb,
  inverseSkewbMove,
  inverseSkewbMoves,
  parseSkewbMove,
  SKEWB_AMOUNTS,
  SKEWB_CORNERS,
  skewbMovesToString,
  skewbMoveToString,
  type SkewbMove,
} from './notation';

const ALL: SkewbMove[] = SKEWB_CORNERS.flatMap((corner) =>
  SKEWB_AMOUNTS.map((amount): SkewbMove => ({ corner, amount })),
);

describe('skewbMoveToString / parseSkewbMove', () => {
  it('round-trips every one of the eight tokens', () => {
    for (const move of ALL) {
      expect(parseSkewbMove(skewbMoveToString(move))).toEqual(move);
    }
  });

  it('prints amount 2 as a prime, since the turn has order 3 and there is no half turn', () => {
    expect(skewbMoveToString({ corner: 'R', amount: 1 })).toBe('R');
    expect(skewbMoveToString({ corner: 'R', amount: 2 })).toBe("R'");
    expect(skewbMovesToString(ALL.slice(0, 3))).toBe("U U' R");
  });

  it('rejects tokens that are not Skewb moves — including the cube-style half turn', () => {
    for (const bad of ['', 'R2', 'F', 'D', 'r', "R''", ' R', 'RU']) {
      expect(() => parseSkewbMove(bad)).toThrow();
    }
  });
});

describe('inversion', () => {
  it('is an involution that keeps the corner', () => {
    for (const move of ALL) {
      const inverted = inverseSkewbMove(move);
      expect(inverted.corner).toBe(move.corner);
      expect(inverted.amount).not.toBe(move.amount);
      expect(inverseSkewbMove(inverted)).toEqual(move);
    }
  });

  it('reverses a sequence as well as each move', () => {
    expect(
      skewbMovesToString(
        inverseSkewbMoves([
          { corner: 'U', amount: 1 },
          { corner: 'R', amount: 2 },
          { corner: 'B', amount: 1 },
        ]),
      ),
    ).toBe("B' R U'");
  });
});

describe('allMovesSkewb', () => {
  it('is the eight turns and nothing else', () => {
    const moves = allMovesSkewb();
    expect(moves).toHaveLength(8);
    expect(new Set(moves.map(skewbMoveToString))).toEqual(
      new Set(['U', "U'", 'R', "R'", 'L', "L'", 'B', "B'"]),
    );
  });
});
