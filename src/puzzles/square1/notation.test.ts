import { describe, expect, it } from 'vitest';
import { ScrambleSyntaxError } from '../../core/scramble-errors';
import {
  allLayerTurns,
  CANONICAL_MAX,
  CANONICAL_MIN,
  inverseSquare1Move,
  inverseSquare1Moves,
  isLayerTurn,
  LAYER_TURN_COUNT,
  layerTurn,
  normalizeUnits,
  parseSquare1Amount,
  parseSquare1Scramble,
  SLICE,
  SQUARE1_UNITS,
  square1MovesToString,
  square1MoveToString,
  toCanonicalUnits,
  type Square1Move,
} from './notation';

/** Verbatim, from a Square-1 scramble tutorial. See docs/square1-design.md §2. */
const OFFICIAL =
  '(-2, 0) / (-3, -3) / (2, 5) / (0, 3) / (-3, 0) / (-5, -2) / (-4, 0) / (-3, 3) / (3, 0) / (1, 2) / (0, 2) / (-6, 0) /';

describe('unit arithmetic', () => {
  it('reduces into [0,12)', () => {
    expect(normalizeUnits(0)).toBe(0);
    expect(normalizeUnits(12)).toBe(0);
    expect(normalizeUnits(13)).toBe(1);
    expect(normalizeUnits(-1)).toBe(11);
    expect(normalizeUnits(-13)).toBe(11);
    expect(normalizeUnits(-12)).toBe(0);
  });

  it('rejects a non-integer amount', () => {
    expect(() => normalizeUnits(1.5)).toThrow(/integer/);
    expect(() => normalizeUnits(NaN)).toThrow(/integer/);
  });

  /**
   * Twelve residues, twelve spellings. `[-5, 6]` is the range that gives
   * exactly one each — which is what makes `6` and `-6` unambiguous on output
   * even though both appear in real scrambles on input.
   */
  it('canonicalises to exactly one spelling per residue in [-5, 6]', () => {
    const spellings = Array.from({ length: SQUARE1_UNITS }, (_, i) => toCanonicalUnits(i));
    expect(new Set(spellings).size).toBe(SQUARE1_UNITS);
    expect(Math.min(...spellings)).toBe(CANONICAL_MIN);
    expect(Math.max(...spellings)).toBe(CANONICAL_MAX);
    expect(spellings).toEqual([0, 1, 2, 3, 4, 5, 6, -5, -4, -3, -2, -1]);
  });

  it('treats 6 and -6 as the same move, printing 6', () => {
    expect(normalizeUnits(6)).toBe(normalizeUnits(-6));
    expect(toCanonicalUnits(-6)).toBe(6);
  });
});

describe('layerTurn', () => {
  it('normalises both amounts', () => {
    expect(layerTurn(13, -1)).toEqual({ kind: 'turn', top: 1, bottom: 11 });
  });

  /** `(0,0)` turns nothing — it is a spelling, not a move, and it would still cost a move under the metric. */
  it('rejects (0,0), however spelled', () => {
    expect(() => layerTurn(0, 0)).toThrow(/not a move/);
    expect(() => layerTurn(12, -12)).toThrow(/not a move/);
  });

  it('allows a turn of one layer only', () => {
    expect(() => layerTurn(3, 0)).not.toThrow();
    expect(() => layerTurn(0, -2)).not.toThrow();
  });
});

describe('allLayerTurns', () => {
  it('is every 12x12 pair except (0,0)', () => {
    const turns = allLayerTurns();
    expect(turns).toHaveLength(LAYER_TURN_COUNT);
    expect(LAYER_TURN_COUNT).toBe(143);
    expect(new Set(turns.map(square1MoveToString)).size).toBe(turns.length);
    expect(turns.some((t) => t.top === 0 && t.bottom === 0)).toBe(false);
  });
});

describe('rendering', () => {
  it('prints a pair with a space after the comma, and a slice as /', () => {
    expect(square1MoveToString(layerTurn(-2, 0))).toBe('(-2, 0)');
    expect(square1MoveToString(layerTurn(1, 2))).toBe('(1, 2)');
    expect(square1MoveToString(SLICE)).toBe('/');
  });

  it('joins a sequence in the official layout, trailing slash included', () => {
    expect(
      square1MovesToString([layerTurn(-2, 0), SLICE, layerTurn(-3, -3), SLICE]),
    ).toBe('(-2, 0) / (-3, -3) /');
  });

  it('normalises a non-canonical amount on output', () => {
    expect(square1MoveToString(layerTurn(-6, 7))).toBe('(6, -5)');
  });
});

describe('parsing', () => {
  it('accepts the real official scramble', () => {
    const moves = parseSquare1Scramble(OFFICIAL);
    expect(moves.filter(isLayerTurn)).toHaveLength(12);
    expect(moves.filter((m) => m.kind === 'slice')).toHaveLength(12);
    // Pairs and slices strictly alternate, starting with a pair.
    moves.forEach((move, i) => expect(move.kind).toBe(i % 2 === 0 ? 'turn' : 'slice'));
  });

  /**
   * A scramble generator's prose describes tokens as `1, 0 /` without
   * parentheses. That is explanatory writing, not a format: parentheses are
   * what delimit one pair from the next, so dropping them would make
   * `1, 0 2, 0` ambiguous between two moves and one malformed one. The
   * parenthesised forms of those same examples do parse.
   */
  it('requires parentheses, and parses the parenthesised forms of the documented examples', () => {
    expect(() => parseSquare1Scramble('1, 0 /')).toThrow();
    expect(parseSquare1Scramble('(1, 0) / (0, -2) / (-2, 3) /')).toEqual([
      layerTurn(1, 0),
      SLICE,
      layerTurn(0, -2),
      SLICE,
      layerTurn(-2, 3),
      SLICE,
    ]);
  });

  it('is tolerant about spacing and a missing trailing slash', () => {
    const spaced = parseSquare1Scramble('(1, 0) / (0, -2) /');
    const tight = parseSquare1Scramble('(1,0)/(0,-2)/');
    const noTrailing = parseSquare1Scramble('(1,0)/(0,-2)');
    expect(tight).toEqual(spaced);
    expect(noTrailing).toEqual(spaced.slice(0, 3));
  });

  it('is tolerant about which representative a value uses', () => {
    expect(parseSquare1Scramble('(-6, 0)')).toEqual(parseSquare1Scramble('(6, 0)'));
    expect(parseSquare1Scramble('(13, -13)')).toEqual(parseSquare1Scramble('(1, -1)'));
  });

  it('rejects malformed structure rather than ignoring it', () => {
    for (const bad of [
      '(1 0)',
      '(1, 0',
      '1, 0)',
      '(1, 0, 2)',
      '(1, x)',
      '(0, 0)',
      '(1, 0) x',
      '(1, 0) \\',
    ]) {
      expect(() => parseSquare1Scramble(bad), bad).toThrow();
    }
  });

  it('parses an empty scramble as no moves', () => {
    expect(parseSquare1Scramble('')).toEqual([]);
    expect(parseSquare1Scramble('   ')).toEqual([]);
  });

  it('rejects a malformed amount directly', () => {
    for (const bad of ['', 'x', '1.5', '--1', '1 2']) {
      expect(() => parseSquare1Amount(bad), bad).toThrow();
    }
  });
});

/** The requirement the plan names for this step. */
describe('round trip: parse -> render -> parse', () => {
  it('is stable on the real official scramble', () => {
    const once = parseSquare1Scramble(OFFICIAL);
    const rendered = square1MovesToString(once);
    const twice = parseSquare1Scramble(rendered);
    expect(twice).toEqual(once);
    expect(square1MovesToString(twice)).toBe(rendered);
  });

  it('renders the official scramble back to itself, up to canonical spelling', () => {
    // The only difference is `(-6, 0)` normalising to `(6, 0)`.
    expect(square1MovesToString(parseSquare1Scramble(OFFICIAL))).toBe(
      OFFICIAL.replace('(-6, 0)', '(6, 0)').replace(/ \/$/, ' /'),
    );
  });

  it('holds for every one of the 143 layer turns, and for the slice', () => {
    for (const turn of allLayerTurns()) {
      const text = square1MoveToString(turn);
      expect(parseSquare1Scramble(text)).toEqual([turn]);
      expect(square1MovesToString(parseSquare1Scramble(text))).toBe(text);
    }
    expect(parseSquare1Scramble('/')).toEqual([SLICE]);
  });

  it('holds for long random sequences', () => {
    let seed = 1;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let trial = 0; trial < 200; trial += 1) {
      const moves: Square1Move[] = [];
      for (let i = 0; i < 24; i += 1) {
        moves.push(i % 2 === 0 ? layerTurn(next(12), next(12) || 1) : SLICE);
      }
      const text = square1MovesToString(moves);
      expect(parseSquare1Scramble(text)).toEqual(moves);
    }
  });
});

describe('inversion', () => {
  it('a slice is its own inverse — it is a 180° turn', () => {
    expect(inverseSquare1Move(SLICE)).toEqual(SLICE);
  });

  it('a layer turn negates both amounts', () => {
    expect(inverseSquare1Move(layerTurn(1, -2))).toEqual(layerTurn(-1, 2));
    expect(inverseSquare1Move(layerTurn(6, 0))).toEqual(layerTurn(6, 0));
  });

  it('is an involution on every move', () => {
    for (const turn of allLayerTurns()) {
      expect(inverseSquare1Move(inverseSquare1Move(turn))).toEqual(turn);
    }
    expect(inverseSquare1Move(inverseSquare1Move(SLICE))).toEqual(SLICE);
  });

  it('reverses a sequence as well as each move', () => {
    expect(
      square1MovesToString(inverseSquare1Moves([layerTurn(1, 2), SLICE, layerTurn(3, 0)])),
    ).toBe('(-3, 0) / (-1, -2)');
  });
});

describe('parseSquare1Scramble error reporting', () => {
  /**
   * A **generated** `sq1` scramble is validated in
   * `core/validate-scramble.test.ts` rather than here. Generating one solves a
   * random state, which builds the Square-1 pruning tables — around 14 s in
   * this file, and Vitest isolates by file, so paying it in two places buys
   * nothing. What this file covers instead is the real official scramble
   * (`OFFICIAL`, verbatim from a tutorial) and all 143 layer turns, above.
   */

  /**
   * The official layout puts a space after the comma — `(6, 2) / (-2, 4)` — and
   * a consumer will paste exactly that, so the existing `\s*` tolerance is
   * pinned rather than left to be rediscovered.
   */
  it('keeps the spaces-inside-pairs tolerance a pasted scramble depends on', () => {
    expect(parseSquare1Scramble('(6, 2) / (-2, 4)')).toEqual([
      layerTurn(6, 2),
      SLICE,
      layerTurn(-2, 4),
    ]);
    expect(parseSquare1Scramble('( 6 , 2 )')).toEqual([layerTurn(6, 2)]);
  });

  it('reports square1-stray-character at the offset match.index already knew', () => {
    const error = expectSquare1Failure('(1, 0) / x');
    expect(error.reason).toBe('square1-stray-character');
    expect(error.offset).toBe(9);
    expect(error.length).toBe(1);
    expect(error.char).toBe('x');
    expect(error.notation).toBe('square1');
  });

  /**
   * A missing comma, a third number and an unbalanced parenthesis all fail the
   * pair alternative, so the `(` is what is left over — reported as a stray at
   * the offset of the parenthesis, which is where a reader needs to look.
   */
  it('points at the parenthesis when the pair itself is malformed', () => {
    for (const [bad, offset] of [
      ['(1 0)', 0],
      ['(1, 0', 0],
      ['(1, 0, 2)', 0],
      ['(1, x)', 0],
      ['(1, 0) / (2 3)', 9],
    ] as const) {
      const error = expectSquare1Failure(bad);
      expect(error.reason, bad).toBe('square1-stray-character');
      expect(error.offset, bad).toBe(offset);
      expect(error.char, bad).toBe('(');
    }
  });

  /** `(0,0)` turns nothing: a spelling rather than a move, and it would still cost one. */
  it('reports square1-zero-turn spanning the whole pair', () => {
    const error = expectSquare1Failure('(1, 0) / (0, 0) / (2, 0)');
    expect(error.reason).toBe('square1-zero-turn');
    expect(error.offset).toBe(9);
    expect(error.length).toBe(6);
    expect(error.token).toBe('(0, 0)');

    // However spelled — the amounts are reduced before the check.
    expect(expectSquare1Failure('(12, -12)').reason).toBe('square1-zero-turn');
  });

  it('reports the offset of the offending token, not of the first one', () => {
    const scramble = '(6, 2) / (-2, 4) / (-1, -4) / % / (0, -3)';
    const error = expectSquare1Failure(scramble);
    expect(error.offset).toBe(scramble.indexOf('%'));
    expect(error.char).toBe('%');
  });
});

function expectSquare1Failure(text: string): ScrambleSyntaxError {
  try {
    parseSquare1Scramble(text);
  } catch (error) {
    expect(error).toBeInstanceOf(ScrambleSyntaxError);
    return error as ScrambleSyntaxError;
  }
  throw new Error(`expected "${text}" to be rejected`);
}
