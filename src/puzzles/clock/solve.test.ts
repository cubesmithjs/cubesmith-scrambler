import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { CLOCK_CORNERS, clockTokensToString, parseClockScramble } from './notation';
import { clockSolveDistanceCappedAtTwo, randomClockState } from './random-state';
import {
  applyClockTokens,
  clockStatesEqual,
  cornerReadingsConsistent,
  isSolvedClock,
  SOLVED_CLOCK_STATE,
} from './state';
import {
  clockScrambleTokens,
  closingPinDeclaration,
  generateClockScramble,
  MIN_CLOCK_SOLVE_DISTANCE,
  solveClock,
} from './solve';

describe('solveClock', () => {
  it('returns the puzzle to all twelves, for many random states', () => {
    const random = createRandomSource('clock-solve');
    for (let trial = 0; trial < 2_000; trial += 1) {
      const state = randomClockState(random);
      expect(isSolvedClock(applyClockTokens(state, solveClock(state)))).toBe(true);
    }
  });

  it('is a no-op sequence for an already-solved puzzle', () => {
    const tokens = solveClock(SOLVED_CLOCK_STATE);
    expect(tokens.filter((t) => t.kind === 'dial').every((t) => t.kind === 'dial' && t.amount === 0)).toBe(
      true,
    );
  });
});

describe('closingPinDeclaration', () => {
  /**
   * Two inversions stack up here and both are easy to get wrong: the
   * declaration is read after `y2`, so it names mirrored corners, and a pin
   * is one piece whose two ends are always opposite, so naming it "up" from
   * the back leaves it *down* at the front.
   */
  it('leaves the pins exactly where asked, for all sixteen targets', () => {
    for (let mask = 0; mask < 16; mask += 1) {
      const target = Object.fromEntries(
        CLOCK_CORNERS.map((corner, i) => [corner, (mask & (1 << i)) !== 0]),
      ) as Record<(typeof CLOCK_CORNERS)[number], boolean>;

      const finalState = applyClockTokens(SOLVED_CLOCK_STATE, [
        { kind: 'flip' },
        closingPinDeclaration(target),
      ]);
      expect(finalState.pinsUp).toEqual(target);
    }
  });

  it('lists the corners in canonical order', () => {
    const token = closingPinDeclaration({ UR: false, DR: false, DL: false, UL: false });
    expect(token).toEqual({ kind: 'pins', up: ['UR', 'DR', 'DL', 'UL'] });
    for (let mask = 0; mask < 16; mask += 1) {
      const target = Object.fromEntries(
        CLOCK_CORNERS.map((corner, i) => [corner, (mask & (1 << i)) !== 0]),
      ) as Record<(typeof CLOCK_CORNERS)[number], boolean>;
      const declaration = closingPinDeclaration(target);
      if (declaration.kind !== 'pins') throw new Error('expected a pin declaration');
      const positions = declaration.up.map((c) => CLOCK_CORNERS.indexOf(c));
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    }
  });

  it('touches no dial', () => {
    const state = applyClockTokens(SOLVED_CLOCK_STATE, [
      { kind: 'flip' },
      closingPinDeclaration({ UR: true, DR: false, DL: true, UL: false }),
    ]);
    expect(isSolvedClock(state)).toBe(true);
  });
});

/**
 * The gate: generate a scramble string, parse it back from text, apply it to
 * a solved Clock, confirm it is no longer solved, then solve it and confirm
 * every dial is back at twelve.
 */
describe('end-to-end round trip', () => {
  it('every scramble scrambles, and re-solves to exactly solved', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const scramble = generateClockScramble(createRandomSource(`clock-e2e-${seed}`));
      const tokens = parseClockScramble(scramble);

      const scrambled = applyClockTokens(SOLVED_CLOCK_STATE, tokens);
      expect(isSolvedClock(scrambled)).toBe(false);
      expect(cornerReadingsConsistent(scrambled)).toBe(true);

      expect(isSolvedClock(applyClockTokens(scrambled, solveClock(scrambled)))).toBe(true);
    }
  });

  it('the scramble reproduces the drawn state exactly, pins included', () => {
    const random = createRandomSource('clock-reproduces-state');
    for (let trial = 0; trial < 1_000; trial += 1) {
      const state = randomClockState(random);
      const reached = applyClockTokens(SOLVED_CLOCK_STATE, clockScrambleTokens(state));
      expect(clockStatesEqual(reached, state)).toBe(true);
    }
  });
});

describe('generateClockScramble output shape', () => {
  const scrambles = Array.from({ length: 500 }, (_, seed) =>
    generateClockScramble(createRandomSource(`clock-shape-${seed}`)),
  );

  it('matches the official token template exactly', () => {
    for (const scramble of scrambles) {
      expect(scramble).toMatch(
        /^UR\d[+-] DR\d[+-] DL\d[+-] UL\d[+-] U\d[+-] R\d[+-] D\d[+-] L\d[+-] ALL\d[+-] y2 U\d[+-] R\d[+-] D\d[+-] L\d[+-] ALL\d[+-]( (UR|DR|DL|UL)){0,4}$/,
      );
    }
  });

  it('always has exactly fourteen dial tokens and one flip', () => {
    for (const scramble of scrambles) {
      const tokens = parseClockScramble(scramble);
      expect(tokens.filter((t) => t.kind === 'dial')).toHaveLength(14);
      expect(tokens.filter((t) => t.kind === 'flip')).toHaveLength(1);
    }
  });

  it('the state it reaches needs at least 2 moves to solve (Regulation 4b3)', () => {
    for (const scramble of scrambles) {
      const state = applyClockTokens(SOLVED_CLOCK_STATE, parseClockScramble(scramble));
      expect(clockSolveDistanceCappedAtTwo(state)).toBeGreaterThanOrEqual(
        MIN_CLOCK_SOLVE_DISTANCE,
      );
    }
  });

  it('re-parses and re-prints to the identical string', () => {
    for (const scramble of scrambles) {
      expect(clockTokensToString(parseClockScramble(scramble))).toBe(scramble);
    }
  });

  it('uses every amount spelling and every closing pin count across the sample', () => {
    const amounts = new Set<string>();
    const declarationSizes = new Set<number>();
    for (const scramble of scrambles) {
      for (const token of parseClockScramble(scramble)) {
        if (token.kind === 'dial') amounts.add(String(token.amount));
        if (token.kind === 'pins') declarationSizes.add(token.up.length);
      }
      if (!parseClockScramble(scramble).some((t) => t.kind === 'pins')) declarationSizes.add(0);
    }
    expect(amounts.size).toBe(12);
    expect([...declarationSizes].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('is deterministic given a seed and varies without one', () => {
    expect(generateClockScramble(createRandomSource('fixed'))).toBe(
      generateClockScramble(createRandomSource('fixed')),
    );
    expect(new Set(scrambles).size).toBe(scrambles.length);
  });
});
