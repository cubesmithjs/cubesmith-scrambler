import { registerScrambler } from '../../core/scrambler-registry';
import type { WcaEventId } from '../../core/types';
import type { RandomSource } from '../../random/random-source';
import { wideMovesToString } from './notation';
import { randomMoveSequence } from './random-moves';

/**
 * The random-moves cube events and how long their scrambles are.
 *
 * Regulation 4b3e asks for "sufficiently many random moves" without naming a
 * number, so these are the conventional lengths WCA's own scrambler uses —
 * roughly proportional to the puzzle's piece count. `solve.test.ts` checks
 * that each length really does displace essentially every facelet, which is
 * the property "sufficiently many" is actually about.
 */
export const RANDOM_MOVE_CUBES: readonly { event: WcaEventId; size: number; length: number }[] = [
  { event: '555', size: 5, length: 60 },
  { event: '666', size: 6, length: 80 },
  { event: '777', size: 7, length: 100 },
];

export function generateCubeNxNScramble(
  random: RandomSource,
  size: number,
  length: number,
): string {
  return wideMovesToString(randomMoveSequence(random, size, length));
}

/**
 * Registers `'555'`, `'666'` and `'777'`, all declared `random-moves`.
 *
 * One function for all three rather than three near-identical ones: they
 * differ only in two numbers, and a shared registration makes it impossible
 * for one of them to drift out of step with the others.
 */
export function registerRandomMoveCubeScramblers(): void {
  for (const { event, size, length } of RANDOM_MOVE_CUBES) {
    registerScrambler(
      event,
      (random) => generateCubeNxNScramble(random, size, length),
      'random-moves',
    );
  }
}
