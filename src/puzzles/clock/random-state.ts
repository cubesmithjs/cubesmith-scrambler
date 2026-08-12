import type { RandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { CLOCK_HOURS, CLOCK_CORNERS, type ClockCorner } from './notation';
import { applyClockTurn, fromClockVector, isSolvedClock, type ClockState } from './state';
import { CLOCK_DIMENSION } from './template';

/**
 * A uniformly random Clock state.
 *
 * This is the one puzzle here where uniformity needs no argument at all.
 * `template.ts` shows the official scramble template is a unimodular basis
 * for the fourteen independent dials, so drawing fourteen independent
 * uniform hours *is* a uniform draw over all `12^14` states — there is no
 * parity constraint to satisfy, no rejection, and nothing unreachable.
 *
 * Pin positions are drawn uniformly too, over all sixteen combinations.
 * They're not part of solvedness (a Clock is judged on its dials), and since
 * 0.14 they are not part of the **emitted scramble** either — `solve.ts`
 * stopped appending the closing pin declaration, because TNoodle does not emit
 * one. The draw is kept anyway, for two reasons: `ClockState` genuinely models
 * the pins, so a state with them fixed would be a less faithful state; and
 * keeping it makes the format change purely subtractive, leaving every seeded
 * scramble's fourteen dial amounts exactly where they were.
 */
export function randomClockState(random: RandomSource): ClockState {
  const dials = Array.from({ length: CLOCK_DIMENSION }, () => randomInt(random, CLOCK_HOURS));
  const pinsUp = {} as Record<ClockCorner, boolean>;
  for (const corner of CLOCK_CORNERS) pinsUp[corner] = randomInt(random, 2) === 1;
  return fromClockVector(dials, pinsUp);
}

/**
 * Every state a single turn can produce from solved — all fifteen non-empty
 * pin configurations, on both sides, at every non-zero amount.
 *
 * Enumerated over corner *sets* rather than the nine notation names, because
 * a scrambler's obligation is about what the puzzle can do, not about what
 * the notation can spell.
 */
function oneTurnStates(): ReadonlySet<string> {
  const keys = new Set<string>();
  const corners = CLOCK_CORNERS;
  const solved = fromClockVector(new Array<number>(CLOCK_DIMENSION).fill(0));

  for (let mask = 1; mask < 1 << corners.length; mask += 1) {
    const geared = corners.filter((_, i) => (mask & (1 << i)) !== 0);
    for (const flipped of [false, true]) {
      for (let amount = 1; amount < CLOCK_HOURS; amount += 1) {
        keys.add(dialKey(applyClockTurn(solved, geared, amount, flipped)));
      }
    }
  }
  return keys;
}

function dialKey(state: ClockState): string {
  return `${state.front.join(',')}|${state.back.join(',')}`;
}

let oneTurn: ReadonlySet<string> | null = null;

/**
 * How many turns `state` is from solved, **capped at 2**: exact for 0 and 1,
 * and `2` meaning "two or more".
 *
 * That's all Regulation 4b3 needs — "at least 2 moves to solve" — and it's
 * all that can honestly be offered: a Clock's real solving distance would
 * need a search over `12^14` states, and the published God's number of 12 is
 * in a metric this package doesn't compute.
 *
 * The cap is exact where it matters because "solvable in one turn" is a
 * finite, small set: fifteen pin configurations on two sides at eleven
 * amounts. Fewer than 330 states out of 1.28 x 10^15 fail the check, so it
 * effectively never rejects — but it is a real check rather than an appeal
 * to how unlikely that is.
 */
export function clockSolveDistanceCappedAtTwo(state: ClockState): 0 | 1 | 2 {
  if (isSolvedClock(state)) return 0;
  oneTurn ??= oneTurnStates();
  return oneTurn.has(dialKey(state)) ? 1 : 2;
}
