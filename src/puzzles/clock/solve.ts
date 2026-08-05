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
 * them.
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
 * The template tokens that reproduce `state` from solved — the scramble for
 * it, before the closing pin declaration.
 *
 * There is no search and no inversion of a solution here, unlike every other
 * puzzle in this package. Because the Clock's group is abelian, the fourteen
 * amounts that *produce* a state are read off directly by one matrix
 * multiply, and their order is irrelevant.
 */
export function clockScrambleTokens(state: ClockState): ClockToken[] {
  return [...templateTokens(templateAmountsFor(state)), closingPinDeclaration(state.pinsUp)];
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
