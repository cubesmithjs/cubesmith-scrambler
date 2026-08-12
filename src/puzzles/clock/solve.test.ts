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

/**
 * The legacy closing declaration. `generateClockScramble` stopped emitting it
 * in 0.14 — TNoodle-WCA-1.2.3 does not — but every property below still has to
 * hold, because the parser goes on accepting a scramble that carries one and
 * `applyClockTokens` goes on applying it.
 */
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

  it('the scramble reproduces the drawn state\'s dials exactly', () => {
    const random = createRandomSource('clock-reproduces-state');
    for (let trial = 0; trial < 1_000; trial += 1) {
      const state = randomClockState(random);
      const reached = applyClockTokens(SOLVED_CLOCK_STATE, clockScrambleTokens(state));
      // Pins deliberately excluded: the emitted scramble no longer declares
      // them, so it reproduces the dials — which is all a Clock is judged on —
      // and leaves the pins wherever the closing `ALL` puts them.
      expect(clockStatesEqual({ ...reached, pinsUp: state.pinsUp }, state)).toBe(true);
    }
  });

  /**
   * 🔴 The compatibility half, and the reason `closingPinDeclaration` survives.
   *
   * A consumer's database holds scrambles written in the old format. Emitting
   * narrower must not mean accepting narrower: an old scramble has to keep
   * parsing, keep applying, and keep reaching exactly the state it always did —
   * pins included. Turning a cosmetic output change into data loss would be a
   * far worse bug than the format mismatch it fixes.
   */
  it('still parses and applies a scramble written in the old, pins-included format', () => {
    const random = createRandomSource('clock-legacy-format');
    let named = 0;
    for (let trial = 0; trial < 500; trial += 1) {
      const state = randomClockState(random);
      const declaration = closingPinDeclaration(state.pinsUp);
      const legacy = clockTokensToString([...clockScrambleTokens(state), declaration]);

      const tokens = parseClockScramble(legacy);
      const reached = applyClockTokens(SOLVED_CLOCK_STATE, tokens);
      // The dials always come back exactly — that is what a Clock is judged on.
      expect(clockStatesEqual({ ...reached, pinsUp: state.pinsUp }, state)).toBe(true);
      // And it re-prints byte-identically, so a stored scramble round-trips.
      expect(clockTokensToString(tokens)).toBe(legacy);

      if (declaration.kind === 'pins' && declaration.up.length > 0) {
        named += 1;
        expect(reached.pinsUp).toEqual(state.pinsUp);
      }
    }
    expect(named).toBeGreaterThan(0);
  });

  /**
   * 🔴 A limitation of the format that was **removed**, recorded because it is
   * part of why removing it was right.
   *
   * "Leave all four pins up" is the one pin target the declaration cannot spell:
   * it names the mirrors of the corners that should end up *down*, so the target
   * with none down produces an empty token, and an empty token renders as the
   * empty string and is filtered out. As a token array the intent survived —
   * `setPins` with an empty list, read in the flipped frame, raises all four —
   * but as **text**, which is the only form a competitor or a consumer's
   * database ever sees, it did not. One draw in sixteen printed a scramble whose
   * declared pin state was not the one drawn.
   */
  it('could not spell an all-pins-up declaration, which text is the only form that matters', () => {
    const allUp = { UR: true, DR: true, DL: true, UL: true };
    const declaration = closingPinDeclaration(allUp);
    expect(declaration).toEqual({ kind: 'pins', up: [] });

    // Intact as a token: applied after the scramble's `y2`, it raises all four.
    expect(
      applyClockTokens(SOLVED_CLOCK_STATE, [{ kind: 'flip' }, declaration]).pinsUp,
    ).toEqual(allUp);
    // Gone as text.
    expect(clockTokensToString([{ kind: 'dial', pins: 'ALL', amount: 1 }, declaration])).toBe(
      'ALL1+',
    );
  });
});

describe('generateClockScramble output shape', () => {
  const scrambles = Array.from({ length: 500 }, (_, seed) =>
    generateClockScramble(createRandomSource(`clock-shape-${seed}`)),
  );

  /**
   * 🔴 Anchored at both ends with nothing optional after the second `ALLn±`.
   * TNoodle-WCA-1.2.3's clock scramble is exactly fifteen tokens, and until
   * 0.14 this package appended one to four bare pin names after them — which
   * the old form of this regex permitted with a trailing `{0,4}` group.
   */
  it('matches the official token template exactly — fifteen tokens, ending on ALLn±', () => {
    for (const scramble of scrambles) {
      expect(scramble).toMatch(
        /^UR\d[+-] DR\d[+-] DL\d[+-] UL\d[+-] U\d[+-] R\d[+-] D\d[+-] L\d[+-] ALL\d[+-] y2 U\d[+-] R\d[+-] D\d[+-] L\d[+-] ALL\d[+-]$/,
      );
      expect(scramble.trim().split(/\s+/)).toHaveLength(15);
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

  it('uses every amount spelling across the sample, and never a pin declaration', () => {
    const amounts = new Set<string>();
    for (const scramble of scrambles) {
      for (const token of parseClockScramble(scramble)) {
        if (token.kind === 'dial') amounts.add(String(token.amount));
        expect(token.kind, scramble).not.toBe('pins');
      }
    }
    expect(amounts.size).toBe(12);
  });

  it('is deterministic given a seed and varies without one', () => {
    expect(generateClockScramble(createRandomSource('fixed'))).toBe(
      generateClockScramble(createRandomSource('fixed')),
    );
    expect(new Set(scrambles).size).toBe(scrambles.length);
  });
});
