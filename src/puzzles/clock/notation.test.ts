import { describe, expect, it } from 'vitest';
import { ScrambleSyntaxError } from '../../core/scramble-errors';
import { createRandomSource } from '../../random/random-source';
import {
  CLOCK_CORNERS,
  CLOCK_HOURS,
  CLOCK_PIN_SETS,
  clockAmountToString,
  clockTokensToString,
  clockTokenToString,
  parseClockAmount,
  parseClockScramble,
  PIN_SET_CORNERS,
  type ClockToken,
} from './notation';
import { generateClockScramble } from './solve';

describe('amount rendering', () => {
  /**
   * Twelve values need twelve spellings, and the notation gets there by
   * using `+` for 0..6 hours and `-` for the rest — so `6-` never appears,
   * because a half turn already has a spelling.
   */
  it('maps the twelve hours onto exactly twelve distinct spellings', () => {
    const spellings = Array.from({ length: CLOCK_HOURS }, (_, hours) => clockAmountToString(hours));
    expect(new Set(spellings).size).toBe(CLOCK_HOURS);
    expect(spellings).toEqual([
      '0+',
      '1+',
      '2+',
      '3+',
      '4+',
      '5+',
      '6+',
      '5-',
      '4-',
      '3-',
      '2-',
      '1-',
    ]);
    expect(spellings).not.toContain('6-');
  });

  it('round-trips every hour', () => {
    for (let hours = 0; hours < CLOCK_HOURS; hours += 1) {
      expect(parseClockAmount(clockAmountToString(hours))).toBe(hours);
    }
  });

  it('normalizes out-of-range input', () => {
    expect(clockAmountToString(12)).toBe('0+');
    expect(clockAmountToString(-1)).toBe('1-');
    expect(clockAmountToString(13)).toBe('1+');
  });

  it('rejects malformed amounts', () => {
    for (const bad of ['', '3', '+3', '7+', '12+', '3*', '-3']) {
      expect(() => parseClockAmount(bad)).toThrow();
    }
  });
});

describe('pin sets', () => {
  it('names nine of the sixteen pin configurations: four singles, four pairs, and all', () => {
    expect(CLOCK_PIN_SETS).toHaveLength(9);
    const sizes = CLOCK_PIN_SETS.map((pins) => PIN_SET_CORNERS[pins].length);
    expect(sizes.filter((n) => n === 1)).toHaveLength(4);
    expect(sizes.filter((n) => n === 2)).toHaveLength(4);
    expect(sizes.filter((n) => n === 4)).toHaveLength(1);
  });

  it('the four pairs are the edges, never the diagonals', () => {
    // U/R/D/L each name two corners sharing a side; no token names a
    // diagonal pair, which is why `applyClockTurn` takes corner sets.
    expect(PIN_SET_CORNERS.U).toEqual(['UL', 'UR']);
    expect(PIN_SET_CORNERS.R).toEqual(['UR', 'DR']);
    expect(PIN_SET_CORNERS.D).toEqual(['DL', 'DR']);
    expect(PIN_SET_CORNERS.L).toEqual(['UL', 'DL']);
  });

  it('every corner appears in exactly two of the four pairs', () => {
    for (const corner of CLOCK_CORNERS) {
      const pairs = (['U', 'R', 'D', 'L'] as const).filter((p) =>
        PIN_SET_CORNERS[p].includes(corner),
      );
      expect(pairs).toHaveLength(2);
    }
  });
});

describe('clockTokenToString / clockTokensToString', () => {
  it('renders each token kind', () => {
    expect(clockTokenToString({ kind: 'dial', pins: 'UR', amount: 4 })).toBe('UR4+');
    expect(clockTokenToString({ kind: 'dial', pins: 'ALL', amount: 8 })).toBe('ALL4-');
    expect(clockTokenToString({ kind: 'flip' })).toBe('y2');
    expect(clockTokenToString({ kind: 'pins', up: ['DL', 'UL'] })).toBe('DL UL');
  });

  it('drops an empty pin declaration rather than leaving a trailing space', () => {
    expect(
      clockTokensToString([{ kind: 'dial', pins: 'ALL', amount: 1 }, { kind: 'pins', up: [] }]),
    ).toBe('ALL1+');
  });
});

describe('parseClockScramble', () => {
  /** A real scramble as produced by the WCA scramble program. */
  const OFFICIAL = 'UR4+ DR3+ DL5- UL3+ U2- R3- D1+ L0+ ALL4- y2 U4+ R0+ D4+ L4- ALL2- DL';

  it('parses an official scramble into 14 dial tokens, a flip, and a pin declaration', () => {
    const tokens = parseClockScramble(OFFICIAL);
    expect(tokens.filter((t) => t.kind === 'dial')).toHaveLength(14);
    expect(tokens.filter((t) => t.kind === 'flip')).toHaveLength(1);
    expect(tokens.filter((t) => t.kind === 'pins')).toHaveLength(1);
    expect(tokens[9]).toEqual({ kind: 'flip' });
    expect(tokens[tokens.length - 1]).toEqual({ kind: 'pins', up: ['DL'] });
  });

  it('round-trips it back to the identical string', () => {
    expect(clockTokensToString(parseClockScramble(OFFICIAL))).toBe(OFFICIAL);
  });

  /** `DL` and `DL5-` differ only by the amount, which is what disambiguates them. */
  it('tells a closing pin declaration apart from a dial move', () => {
    const tokens = parseClockScramble('DL5- DL');
    expect(tokens).toEqual([
      { kind: 'dial', pins: 'DL', amount: 7 },
      { kind: 'pins', up: ['DL'] },
    ]);
  });

  it('folds several bare corners into one declaration', () => {
    expect(parseClockScramble('ALL1+ DL UL')).toEqual([
      { kind: 'dial', pins: 'ALL', amount: 1 },
      { kind: 'pins', up: ['DL', 'UL'] },
    ] satisfies ClockToken[]);
  });

  it('accepts a scramble with no closing declaration', () => {
    const tokens = parseClockScramble('ALL1+');
    expect(tokens.some((t) => t.kind === 'pins')).toBe(false);
  });

  it('rejects a bare group that is not a single corner — only corners can close a scramble', () => {
    expect(() => parseClockScramble('ALL1+ U')).toThrow(/can only close/);
    expect(() => parseClockScramble('ALL1+ ALL')).toThrow(/can only close/);
  });

  it('rejects unknown tokens', () => {
    for (const bad of ['XY1+', 'R1+ z2', 'UR7+', '5+']) {
      expect(() => parseClockScramble(bad)).toThrow();
    }
  });
});

describe('parseClockScramble error reporting', () => {
  it('reads a scramble the package itself generated, and round-trips it', () => {
    const scramble = generateClockScramble(createRandomSource('validate-clock'));
    const tokens = parseClockScramble(scramble);
    expect(clockTokensToString(tokens)).toBe(scramble);
    // The two constructs a hand-rolled validator gets wrong: the mid-scramble
    // flip, and the trailing pin block.
    expect(tokens.some((token) => token.kind === 'flip')).toBe(true);
    expect(scramble).toContain('y2');
  });

  it('agrees with the cube path that empty input is an empty scramble', () => {
    expect(parseClockScramble('')).toEqual([]);
    expect(parseClockScramble('   ')).toEqual([]);
  });

  it('accepts y2 mid-scramble, which is where it belongs', () => {
    expect(parseClockScramble('ALL1+ y2 ALL2-')).toEqual([
      { kind: 'dial', pins: 'ALL', amount: 1 },
      { kind: 'flip' },
      { kind: 'dial', pins: 'ALL', amount: 10 },
    ] satisfies ClockToken[]);
  });

  /** `5+` has no pin group at all, and `UR3` has no sign — neither is shaped like a token. */
  it('reports clock-not-a-token with the offset and the span', () => {
    const error = expectClockFailure('UR4+ DR3+ 5+ UL3+');
    expect(error.reason).toBe('clock-not-a-token');
    expect(error.offset).toBe(10);
    expect(error.length).toBe(2);
    expect(error.token).toBe('5+');
    expect(error.notation).toBe('clock');

    expect(expectClockFailure('UR3').reason).toBe('clock-not-a-token');
    expect(expectClockFailure('R1+ z2').reason).toBe('clock-not-a-token');
  });

  /** Shaped like a token, but `XY` is not one of the nine pin sets. */
  it('reports clock-not-a-pin-set separately, naming the group it did not recognise', () => {
    const error = expectClockFailure('UR4+ XY1+');
    expect(error.reason).toBe('clock-not-a-pin-set');
    expect(error.offset).toBe(5);
    expect(error.length).toBe(4);
    expect(error.pins).toBe('XY');
  });

  it('reports clock-hour-out-of-range with the hour that was asked for', () => {
    const error = expectClockFailure('UR4+ UR9+');
    expect(error.reason).toBe('clock-hour-out-of-range');
    expect(error.offset).toBe(5);
    expect(error.length).toBe(4);
    expect(error.hours).toBe(9);
    expect(error.pins).toBe('UR');
    // The notation spells twelve values with 0..6 and a sign, so 7 is already
    // past the range even though 7 hours is a real amount — it is spelled `5-`.
    expect(expectClockFailure('UR7+').hours).toBe(7);
  });

  /**
   * The positional rule, and the one that most needed a position: a pin set is
   * perfectly legal to *turn* and illegal to *end with* unless it is a single
   * corner. Same word, different verdict depending on where it sits.
   */
  it('reports clock-pin-not-a-corner, at the offset of the closing token', () => {
    const error = expectClockFailure('ALL1+ U');
    expect(error.reason).toBe('clock-pin-not-a-corner');
    expect(error.offset).toBe(6);
    expect(error.length).toBe(1);
    expect(error.pins).toBe('U');

    const allError = expectClockFailure('UR4+ DR3+ ALL');
    expect(allError.reason).toBe('clock-pin-not-a-corner');
    expect(allError.offset).toBe(10);
    expect(allError.length).toBe(3);

    // And the same group *with* an amount is fine, which is the distinction.
    expect(() => parseClockScramble('ALL1+ U2-')).not.toThrow();
  });

  it('reports the offset of the offending token, not of the first one', () => {
    const scramble = 'UR4+ DR3+ DL5- UL3+ U2- R3- D1+ L0+ ALL4- y2 U4+ QQ1+ D4+';
    expect(expectClockFailure(scramble).offset).toBe(scramble.indexOf('QQ1+'));
    expect(expectClockFailure('  5+').offset).toBe(2);
  });
});

function expectClockFailure(text: string): ScrambleSyntaxError {
  try {
    parseClockScramble(text);
  } catch (error) {
    expect(error).toBeInstanceOf(ScrambleSyntaxError);
    return error as ScrambleSyntaxError;
  }
  throw new Error(`expected "${text}" to be rejected`);
}
