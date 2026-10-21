import { describe, expect, it } from 'vitest';
import { ScrambleSyntaxError } from '../../core/scramble-errors';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import {
  allMovesFto,
  FTO_AMOUNTS,
  FTO_FACES,
  ftoMovesToString,
  ftoMoveToString,
  inverseFtoMove,
  inverseFtoMoves,
  parseFtoMove,
  parseFtoScramble,
  type FtoMove,
} from './notation';

const ALL: FtoMove[] = FTO_FACES.flatMap((face) =>
  FTO_AMOUNTS.map((amount): FtoMove => ({ face, amount })),
);

describe('ftoMoveToString / parseFtoMove', () => {
  it('round-trips every one of the sixteen tokens', () => {
    expect(ALL).toHaveLength(16);
    for (const move of ALL) {
      expect(parseFtoMove(ftoMoveToString(move))).toEqual(move);
    }
  });

  it('prints amount 2 as a prime — a face turn has order 3, so there is no half turn', () => {
    expect(ftoMoveToString({ face: 'BR', amount: 1 })).toBe('BR');
    expect(ftoMoveToString({ face: 'BR', amount: 2 })).toBe("BR'");
    expect(ftoMovesToString(ALL.slice(0, 3))).toBe("U U' F");
  });

  it('reads the two-letter faces as one face, not two', () => {
    expect(parseFtoMove('BR')).toEqual({ face: 'BR', amount: 1 });
    expect(parseFtoMove("BL'")).toEqual({ face: 'BL', amount: 2 });
    expect(parseFtoMove('B')).toEqual({ face: 'B', amount: 1 });
  });

  it('rejects tokens that are not FTO moves — the cube half turn included', () => {
    for (const bad of ['', 'R2', "U'2", "BR''", 'X', 'BX', 'UR', 'u', 'r', ' R', 'x', 'y2']) {
      expect(() => parseFtoMove(bad), bad).toThrow();
    }
  });
});

describe('inversion', () => {
  it('is an involution that keeps the face', () => {
    for (const move of ALL) {
      const inverted = inverseFtoMove(move);
      expect(inverted.face).toBe(move.face);
      expect(inverted.amount).not.toBe(move.amount);
      expect(inverseFtoMove(inverted)).toEqual(move);
    }
  });

  it('reverses a sequence as well as each move', () => {
    expect(ftoMovesToString(inverseFtoMoves(parseFtoScramble("U BR' F")))).toBe("F' BR U'");
  });
});

describe('allMovesFto', () => {
  it('lists all sixteen turns in face order, clockwise before prime', () => {
    expect(allMovesFto()).toEqual(ALL);
  });
});

/**
 * What arrives from a text box or a paste, not from this package. Thousands of
 * random strings over an alphabet chosen to be *nearly* FTO — real faces, primes,
 * a cube `2`, lowercase, whitespace of three kinds, a typographic apostrophe — and
 * every one must either parse to tokens that print back exactly, or fail with a
 * `ScrambleSyntaxError` whose span points at text that is really there. Nothing
 * else may escape: a `TypeError` here would be a bug a user can trigger by typing.
 */
describe('parseFtoScramble — fuzzed input', () => {
  const ALPHABET = ['U', 'F', 'R', 'L', 'B', 'D', 'BR', 'BL', "'", '2', 'r', 'X', ' ', '  ', '\t', '\n', '’', 'Ü'];

  it('parses or rejects cleanly, with an honest span, on 5,000 random strings', () => {
    const random = createRandomSource('fto-fuzz');
    let valid = 0;
    for (let trial = 0; trial < 5_000; trial += 1) {
      const pieces = Array.from({ length: randomInt(random, 12) }, () => ALPHABET[randomInt(random, ALPHABET.length)]!);
      const text = pieces.join(randomInt(random, 2) === 0 ? ' ' : '');
      let moves: FtoMove[] | undefined;
      try {
        moves = parseFtoScramble(text);
      } catch (error) {
        expect(error, JSON.stringify(text)).toBeInstanceOf(ScrambleSyntaxError);
        const e = error as ScrambleSyntaxError;
        expect(e.input).toBe(text);
        expect(e.offset).toBeGreaterThanOrEqual(0);
        expect(e.offset + e.length).toBeLessThanOrEqual(text.length);
        expect(e.token, JSON.stringify(text)).toBe(text.slice(e.offset, e.offset + e.length));
        expect(['fto-not-a-face', 'fto-bad-amount']).toContain(e.reason);
        continue;
      }
      valid += 1;
      // A valid parse prints back as the same tokens, whatever the whitespace was.
      expect(ftoMovesToString(moves), JSON.stringify(text)).toBe(text.trim().split(/\s+/).filter(Boolean).join(' '));
    }
    // The alphabet is close enough to FTO that both arms are genuinely exercised.
    expect(valid).toBeGreaterThan(500);
    expect(valid).toBeLessThan(4_500);
  });

  /**
   * 🔴 A typographic apostrophe is **not** a prime — consistently with every other
   * grammar in this package. A scramble pasted from a word processor (`R’`) fails
   * here, pointing at the token, rather than being silently read as `R`. A consumer
   * accepting pasted text should normalise `’` to `'` before validating.
   */
  it("rejects a typographic apostrophe as a bad amount, pointing at the token", () => {
    const result = (() => {
      try {
        parseFtoScramble('U R’ F');
        return null;
      } catch (error) {
        return error as ScrambleSyntaxError;
      }
    })();
    expect(result).toBeInstanceOf(ScrambleSyntaxError);
    expect(result!.reason).toBe('fto-bad-amount');
    expect([result!.offset, result!.length, result!.token]).toEqual([2, 2, 'R’']);
  });
});

describe('parseFtoScramble', () => {
  it('reads a whole scramble, any amount of whitespace between tokens', () => {
    expect(parseFtoScramble("  U  BR'\tF\nBL ")).toEqual([
      { face: 'U', amount: 1 },
      { face: 'BR', amount: 2 },
      { face: 'F', amount: 1 },
      { face: 'BL', amount: 1 },
    ]);
  });

  it('treats empty input as an empty scramble', () => {
    expect(parseFtoScramble('')).toEqual([]);
    expect(parseFtoScramble('   ')).toEqual([]);
  });

  /**
   * The two reason codes, with the example inputs `scramble-errors.ts` documents
   * for them. A face followed by something that is not a letter is a bad amount;
   * letters that run on past a face name name no face.
   */
  it.each([
    ["U BX L", 'fto-not-a-face', 2, 2, 'B'],
    ['U UR', 'fto-not-a-face', 2, 2, 'U'],
    ['Q', 'fto-not-a-face', 0, 1, 'Q'],
    ['r', 'fto-not-a-face', 0, 1, 'r'],
    ['R2', 'fto-bad-amount', 0, 2, undefined],
    ["F U'2", 'fto-bad-amount', 2, 3, undefined],
    ["BR''", 'fto-bad-amount', 0, 4, undefined],
  ] as const)('%j → %s at offset %i', (text, reason, offset, length, char) => {
    let caught: unknown;
    try {
      parseFtoScramble(text);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ScrambleSyntaxError);
    const error = caught as ScrambleSyntaxError;
    expect(error.notation).toBe('fto');
    expect(error.reason).toBe(reason);
    expect(error.offset).toBe(offset);
    expect(error.length).toBe(length);
    expect(error.input).toBe(text);
    expect(error.char).toBe(char);
    expect(error.message).toMatch(/^fto-notation: /);
  });
});
