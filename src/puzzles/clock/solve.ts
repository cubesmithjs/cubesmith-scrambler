import { registerScrambler } from '../../core/scrambler-registry';
import { drawStateAtLeastMovesFromSolved } from '../../core/scramble-shape';
import type { RandomSource } from '../../random/random-source';
import {
  CLOCK_CORNERS,
  clockTokensToString,
  type ClockCorner,
  type ClockToken,
} from './notation';
import { clockSolveDistanceCappedAtTwo, randomClockState } from './random-state';
import { mirrorCorner, type ClockState } from './state';
import { templateAmountsFor, templateAmountsToSolve, templateTokens } from './template';

/** WCA Regulation 4b3's baseline, which Clock takes unmodified: the state must require at least 2 moves to solve. */
export const MIN_CLOCK_SOLVE_DISTANCE = 2;

/**
 * The closing pin declaration that leaves the pins where `target` wants
 * them — the **legacy** output format, which this package no longer emits.
 *
 * A scramble ends with the puzzle turned over, so the declaration is read in
 * the flipped frame — and a pin is one piece with two ends, so "up from the
 * back" is "down from the front". Both inversions have to be applied: the
 * corners to name are the mirrors of the ones that should end up *down* at
 * the front.
 *
 * The result is listed in `CLOCK_CORNERS` order. Order carries no meaning —
 * raising pins is a set operation — but a canonical one keeps output stable
 * and matches how official scrambles read.
 *
 * 🔴 **Kept deliberately after the format change.** The parser still accepts a
 * scramble carrying these tokens — a scramble already stored in a consumer's
 * database was written that way, and rejecting it later would turn a cosmetic
 * change into data loss — so this is how a test constructs one to prove that.
 * `applyClockTokens` still has to handle a `pins` token for the same reason.
 */
export function closingPinDeclaration(
  target: Readonly<Record<ClockCorner, boolean>>,
): ClockToken {
  const up = new Set(CLOCK_CORNERS.filter((corner) => !target[corner]).map(mirrorCorner));
  return { kind: 'pins', up: CLOCK_CORNERS.filter((corner) => up.has(corner)) };
}

/** The template tokens that return `state` to all-twelves. */
export function solveClock(state: ClockState): ClockToken[] {
  return templateTokens(templateAmountsToSolve(state));
}

/**
 * The template tokens that reproduce `state`'s **dials** from solved — the
 * whole scramble, and exactly fifteen tokens: nine dial moves, `y2`, five more.
 *
 * There is no search and no inversion of a solution here, unlike every other
 * puzzle in this package. Because the Clock's group is abelian, the fourteen
 * amounts that *produce* a state are read off directly by one matrix
 * multiply, and their order is irrelevant.
 *
 * ## Why the closing pin declaration is gone
 *
 * It used to append `closingPinDeclaration(state.pinsUp)`, which made the
 * emitted string 15 to 19 tokens depending on how many pins the draw left
 * raised. **TNoodle-WCA-1.2.3 emits neither** — its clock scramble is exactly
 * fifteen tokens and ends on the second `ALLn±`, and its own `ClockState`
 * carries no pin positions at all (see `draw/clock.ts`, which already said so).
 *
 * That made this package's string differ from the official one *in kind* rather
 * than in length: a consumer parsing both had two grammars to handle. The final
 * pin position is implied by the scramble anyway — the last token raises all
 * four pins from the back, which is all four down at the front — so declaring
 * it was never an instruction, only a description.
 *
 * 🔴 The pins are still **drawn** into the state (`randomClockState`), and
 * deliberately: leaving the draw alone makes this change purely *subtractive*,
 * so a consumer's seeded fixture keeps every dial value it had and simply loses
 * its tail. Changing the draw as well would have moved fourteen numbers to
 * remove two.
 */
export function clockScrambleTokens(state: ClockState): ClockToken[] {
  return templateTokens(templateAmountsFor(state));
}

export function generateClockScramble(random: RandomSource): string {
  const state = drawStateAtLeastMovesFromSolved(
    random,
    randomClockState,
    clockSolveDistanceCappedAtTwo,
    MIN_CLOCK_SOLVE_DISTANCE,
  );
  return clockTokensToString(clockScrambleTokens(state));
}

/** Registers `'clock'` — called explicitly from `src/index.ts`. */
export function registerClockScrambler(): void {
  registerScrambler('clock', (random) => generateClockScramble(random));
}
