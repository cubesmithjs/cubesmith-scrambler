import { describe, expect, it } from 'vitest';
import { ScrambleSyntaxError } from '../../core/scramble-errors';
import { createRandomSource } from '../../random/random-source';
import {
  allMovesSkewb,
  inverseSkewbMove,
  inverseSkewbMoves,
  parseSkewbMove,
  parseSkewbScramble,
  SKEWB_AMOUNTS,
  SKEWB_CORNERS,
  skewbMovesToString,
  skewbMoveToString,
  type SkewbMove,
} from './notation';
import { generateSkewbScramble } from './solve';

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

describe('parseSkewbScramble', () => {
  it('reads a scramble the package itself generated', () => {
    const scramble = generateSkewbScramble(createRandomSource('validate-skewb'));
    const moves = parseSkewbScramble(scramble);
    expect(moves).toHaveLength(scramble.split(' ').length);
    expect(skewbMovesToString(moves)).toBe(scramble);
  });

  it('agrees with the cube path that empty input is an empty scramble', () => {
    expect(parseSkewbScramble('')).toEqual([]);
    expect(parseSkewbScramble('   ')).toEqual([]);
  });

  it('reports skewb-not-a-corner with the offset, the span and the character', () => {
    const error = expectSkewbFailure("U L' F R");
    expect(error.reason).toBe('skewb-not-a-corner');
    expect(error.offset).toBe(5);
    expect(error.length).toBe(1);
    expect(error.char).toBe('F');
    expect(error.token).toBe('F');
    expect(error.notation).toBe('skewb');
  });

  /**
   * Fixed Corner Notation has no lowercase form — where the Pyraminx uses one
   * for its tips — so `r` names no corner at all rather than naming one badly.
   */
  it('treats a lowercase letter as no corner, since FCN has no lowercase form', () => {
    const error = expectSkewbFailure('r');
    expect(error.reason).toBe('skewb-not-a-corner');
    expect(error.char).toBe('r');
  });

  /** A Skewb turn has order 3: there is no half turn to spell. */
  it('reports skewb-bad-amount for a cube-style half turn', () => {
    const error = expectSkewbFailure('U R2');
    expect(error.reason).toBe('skewb-bad-amount');
    expect(error.offset).toBe(2);
    expect(error.length).toBe(2);
    expect(error.token).toBe('R2');

    expect(expectSkewbFailure("B''").reason).toBe('skewb-bad-amount');
  });

  it('reports the offset of the offending token, not of the first one', () => {
    const scramble = "U L U B' U' B X L' R B R";
    expect(expectSkewbFailure(scramble).offset).toBe(scramble.indexOf('X'));
    expect(expectSkewbFailure('  F').offset).toBe(2);
  });
});

function expectSkewbFailure(text: string): ScrambleSyntaxError {
  try {
    parseSkewbScramble(text);
  } catch (error) {
    expect(error).toBeInstanceOf(ScrambleSyntaxError);
    return error as ScrambleSyntaxError;
  }
  throw new Error(`expected "${text}" to be rejected`);
}
