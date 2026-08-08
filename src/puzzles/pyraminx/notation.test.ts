import { describe, expect, it } from 'vitest';
import { ScrambleSyntaxError } from '../../core/scramble-errors';
import { createRandomSource } from '../../random/random-source';
import {
  allLayerMovesPyraminx,
  inversePyraminxMove,
  inversePyraminxMoves,
  parsePyraminxMove,
  parsePyraminxScramble,
  PYRAMINX_AMOUNTS,
  PYRAMINX_VERTICES,
  pyraminxMovesToString,
  pyraminxMoveToString,
  type PyraminxMove,
} from './notation';
import { generatePyraminxScramble } from './solve';

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

describe('parsePyraminxScramble', () => {
  it('reads a scramble the package itself generated, tips included', () => {
    const scramble = generatePyraminxScramble(createRandomSource('validate-pyram'));
    const moves = parsePyraminxScramble(scramble);
    expect(moves).toHaveLength(scramble.split(' ').length);
    expect(pyraminxMovesToString(moves)).toBe(scramble);
    // An official Pyraminx scramble ends with its tip moves, so a parser that
    // only handled the uppercase layer turns would still pass a shorter test.
    expect(moves.some((move) => move.tip)).toBe(true);
  });

  it('agrees with the cube path that empty input is an empty scramble', () => {
    expect(parsePyraminxScramble('')).toEqual([]);
    expect(parsePyraminxScramble('   ')).toEqual([]);
  });

  /**
   * Tips specifically. `parsePyraminxMove`'s regex already accepts the
   * lowercase branch, so this needed no new grammar — but a lowercase letter
   * that is not a vertex must still be rejected rather than waved through by
   * the case-insensitive check that classifies the failure.
   */
  it('reads lowercase tips and uppercase layer turns side by side', () => {
    expect(parsePyraminxScramble("U' u l' B")).toEqual([
      { vertex: 'U', amount: 2, tip: false },
      { vertex: 'U', amount: 1, tip: true },
      { vertex: 'L', amount: 2, tip: true },
      { vertex: 'B', amount: 1, tip: false },
    ] satisfies PyraminxMove[]);
  });

  it('rejects a lowercase letter that is not a vertex, while keeping the four that are', () => {
    // All four tips are legal lowercase, so the rejection has to be about the
    // letter rather than about the case.
    expect(() => parsePyraminxScramble('u l r b')).not.toThrow();

    const error = expectPyraminxFailure('U f');
    expect(error.reason).toBe('pyraminx-not-a-vertex');
    expect(error.char).toBe('f');
    expect(error.offset).toBe(2);
  });

  it('reports pyraminx-not-a-vertex with the offset, the span and the character', () => {
    const error = expectPyraminxFailure('U L Z R');
    expect(error.reason).toBe('pyraminx-not-a-vertex');
    expect(error.offset).toBe(4);
    expect(error.length).toBe(1);
    expect(error.char).toBe('Z');
    expect(error.token).toBe('Z');
    expect(error.notation).toBe('pyraminx');
  });

  /**
   * A Pyraminx turn has order 3, so `2` is not a half turn and there is no
   * spelling for one — the counterclockwise turn is `'`. That is a different
   * mistake from naming a vertex that does not exist, and now says so.
   */
  it('reports pyraminx-bad-amount for a cube-style half turn on an order-3 vertex', () => {
    const error = expectPyraminxFailure('U2');
    expect(error.reason).toBe('pyraminx-bad-amount');
    expect(error.offset).toBe(0);
    expect(error.length).toBe(2);
    expect(error.token).toBe('U2');

    expect(expectPyraminxFailure("U''").reason).toBe('pyraminx-bad-amount');
    expect(expectPyraminxFailure("u2'").reason).toBe('pyraminx-bad-amount');
  });

  it('reports the offset of the offending token, not of the first one', () => {
    const scramble = "U' R' U R U' B R' X' R L' R u l'";
    expect(expectPyraminxFailure(scramble).offset).toBe(scramble.indexOf("X'"));
    expect(expectPyraminxFailure('  Z').offset).toBe(2);
  });
});

function expectPyraminxFailure(text: string): ScrambleSyntaxError {
  try {
    parsePyraminxScramble(text);
  } catch (error) {
    expect(error).toBeInstanceOf(ScrambleSyntaxError);
    return error as ScrambleSyntaxError;
  }
  throw new Error(`expected "${text}" to be rejected`);
}
