import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { integerDeterminant } from '../../utils/mod-matrix';
import { randomInt } from '../../utils/random-int';
import { CLOCK_HOURS, clockTokensToString } from './notation';
import { randomClockState } from './random-state';
import {
  applyClockTokens,
  CLOCK_DIMENSION,
  fromClockVector,
  isSolvedClock,
  SOLVED_CLOCK_STATE,
  toClockVector,
} from './state';
import {
  BACK_TEMPLATE,
  FRONT_TEMPLATE,
  TEMPLATE_DETERMINANT,
  TEMPLATE_LENGTH,
  TEMPLATE_MATRIX,
  templateAmountsFor,
  templateAmountsToSolve,
  templateTokens,
} from './template';

describe('the official scramble template', () => {
  it('is nine tokens, a flip, then five more — fourteen amounts for fourteen dials', () => {
    expect(FRONT_TEMPLATE).toEqual(['UR', 'DR', 'DL', 'UL', 'U', 'R', 'D', 'L', 'ALL']);
    expect(BACK_TEMPLATE).toEqual(['U', 'R', 'D', 'L', 'ALL']);
    expect(TEMPLATE_LENGTH).toBe(14);
    expect(TEMPLATE_LENGTH).toBe(CLOCK_DIMENSION);
  });

  it('omits the four corner tokens after the flip, because corner clocks are shared', () => {
    // A corner clock runs through the puzzle, so the first four tokens
    // already fixed all four of them. Repeating them from the back would be
    // a redundant coordinate and the template would no longer be a basis.
    expect(BACK_TEMPLATE).not.toContain('UR');
    expect(BACK_TEMPLATE).not.toContain('DR');
    expect(BACK_TEMPLATE).not.toContain('DL');
    expect(BACK_TEMPLATE).not.toContain('UL');
    expect(FRONT_TEMPLATE.length - BACK_TEMPLATE.length).toBe(4);
  });

  /**
   * The claim the whole module rests on. The template's effect matrix is
   * measured by applying each token to a solved puzzle, so this is a check on
   * the mechanical model in `state.ts` — and a determinant of ±1 is much
   * stronger than "invertible mod 12": it makes the template a basis over the
   * *integers*, so every one of the 12^14 states is produced by exactly one
   * choice of the fourteen amounts.
   */
  it('is unimodular: its effect matrix has determinant ±1', () => {
    expect(TEMPLATE_MATRIX).toHaveLength(14);
    for (const row of TEMPLATE_MATRIX) expect(row).toHaveLength(14);
    expect(Math.abs(TEMPLATE_DETERMINANT)).toBe(1);
    expect(Math.abs(integerDeterminant(TEMPLATE_MATRIX))).toBe(1);
  });

  it('so the number of reachable states is exactly 12^14', () => {
    // Unimodular means the fourteen amounts are a bijection onto the state
    // space, and there are 12 choices for each.
    expect(CLOCK_HOURS ** CLOCK_DIMENSION).toBe(1_283_918_464_548_864);
  });

  it('the front tokens leave every non-corner back dial alone', () => {
    // Columns 9..13 are the non-corner back dials; only the post-flip tokens
    // can touch them, which is exactly why the template needs a y2.
    for (let i = 0; i < FRONT_TEMPLATE.length; i += 1) {
      expect(TEMPLATE_MATRIX[i]!.slice(9)).toEqual([0, 0, 0, 0, 0]);
    }
  });

  it('the back tokens do reach the front, but only through the shared corners', () => {
    const cornerColumns = [0, 2, 6, 8];
    for (let i = FRONT_TEMPLATE.length; i < TEMPLATE_LENGTH; i += 1) {
      const row = TEMPLATE_MATRIX[i]!;
      for (let column = 0; column < 9; column += 1) {
        if (cornerColumns.includes(column)) continue;
        expect(row[column]).toBe(0);
      }
    }
  });
});

describe('templateAmountsFor', () => {
  it('recovers the exact amounts a scramble was built from', () => {
    const random = createRandomSource('clock-amount-recovery');
    for (let trial = 0; trial < 2_000; trial += 1) {
      const amounts = Array.from({ length: TEMPLATE_LENGTH }, () => randomInt(random, CLOCK_HOURS));
      const state = applyClockTokens(SOLVED_CLOCK_STATE, templateTokens(amounts));
      expect(templateAmountsFor(state)).toEqual(amounts);
    }
  });

  it('is the inverse of applying the template, for random states too', () => {
    const random = createRandomSource('clock-amount-round-trip');
    for (let trial = 0; trial < 2_000; trial += 1) {
      const state = randomClockState(random);
      const rebuilt = applyClockTokens(SOLVED_CLOCK_STATE, templateTokens(templateAmountsFor(state)));
      expect(toClockVector(rebuilt)).toEqual(toClockVector(state));
    }
  });

  it('gives all-zero amounts for a solved puzzle', () => {
    expect(templateAmountsFor(SOLVED_CLOCK_STATE)).toEqual(new Array<number>(14).fill(0));
  });

  it('every one of the fourteen basis states maps back to a single unit amount', () => {
    for (let i = 0; i < TEMPLATE_LENGTH; i += 1) {
      const state = fromClockVector(TEMPLATE_MATRIX[i]!);
      const amounts = templateAmountsFor(state);
      expect(amounts).toEqual(new Array<number>(14).fill(0).map((_, j) => (j === i ? 1 : 0)));
    }
  });
});

describe('templateAmountsToSolve', () => {
  it('returns the puzzle to all twelves, for many random states', () => {
    const random = createRandomSource('clock-solve-amounts');
    for (let trial = 0; trial < 2_000; trial += 1) {
      const state = randomClockState(random);
      const solved = applyClockTokens(state, templateTokens(templateAmountsToSolve(state)));
      expect(isSolvedClock(solved)).toBe(true);
    }
  });
});

describe('templateTokens', () => {
  it('places the flip between the ninth and tenth amounts', () => {
    const tokens = templateTokens(new Array<number>(14).fill(0).map((_, i) => i % CLOCK_HOURS));
    expect(tokens).toHaveLength(15);
    expect(tokens[9]).toEqual({ kind: 'flip' });
    expect(clockTokensToString(tokens)).toBe(
      'UR0+ DR1+ DL2+ UL3+ U4+ R5+ D6+ L5- ALL4- y2 U3- R2- D1- L0+ ALL1+',
    );
  });

  it('rejects the wrong number of amounts', () => {
    expect(() => templateTokens([1, 2, 3])).toThrow(/expected 14/);
  });

  it('normalizes amounts outside 0..11', () => {
    const tokens = templateTokens(new Array<number>(14).fill(-1));
    expect(tokens[0]).toEqual({ kind: 'dial', pins: 'UR', amount: 11 });
  });
});
