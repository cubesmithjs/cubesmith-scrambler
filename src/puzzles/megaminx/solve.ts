import { registerScrambler } from '../../core/scrambler-registry';
import type { RandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import {
  megaminxMovesToString,
  type MegaminxDirection,
  type MegaminxMove,
} from './notation';

/**
 * Megaminx is a **random-moves** event, not random-state.
 *
 * WCA Regulation 4b3e names it explicitly, alongside 5x5x5, 6x6x6 and 7x7x7:
 *
 * > 5x5x5 Cube, 6x6x6 Cube, 7x7x7 Cube, and Megaminx: sufficiently many
 * > random moves (instead of random state), at least 2 moves to solve.
 *
 * So there is deliberately no solver here, and no pruning table — WCA's own
 * scrambler doesn't do a random-state optimal solve for this puzzle either.
 * Building one would be a large undertaking that produces something *other
 * than* an official scramble.
 *
 * Because there's no solver, the end-to-end gate in `solve.test.ts` is
 * scramble-then-invert rather than scramble-then-solve. It still exercises
 * the whole chain — generation, rendering, parsing, and the derived move
 * tables — and additionally checks the scramble genuinely scrambles.
 */

/**
 * The scramble's shape is a fixed template with only the directions random:
 * seven lines, each ten alternating `R`/`D` moves followed by a `U` or `U'`.
 *
 * That structure is the notation's whole point. `R` holds the L face and `D`
 * holds the U face, so alternating them churns the puzzle without the
 * scrambler ever having to name or find any of the twelve faces; the `U` at
 * the end of each line turns the top layer so the next line's `R`/`D` pair
 * bites somewhere new.
 */
export const MEGAMINX_LINES = 7;
export const MEGAMINX_MOVES_PER_LINE = 10;
export const MEGAMINX_SCRAMBLE_LENGTH = MEGAMINX_LINES * (MEGAMINX_MOVES_PER_LINE + 1); // 77

function randomDirection(random: RandomSource): MegaminxDirection {
  return (randomInt(random, 2) + 1) as MegaminxDirection;
}

/**
 * The 77 moves of a scramble.
 *
 * Every direction is an independent uniform coin flip, which is where all the
 * randomness lives — the token *sequence* is fixed. 77 independent bits is
 * far more than enough to put the puzzle deep in its state space (the checks
 * in `solve.test.ts` confirm essentially every piece ends up displaced),
 * which is what "sufficiently many random moves" asks for.
 */
export function megaminxScrambleMoves(random: RandomSource): MegaminxMove[] {
  const moves: MegaminxMove[] = [];
  for (let line = 0; line < MEGAMINX_LINES; line += 1) {
    for (let i = 0; i < MEGAMINX_MOVES_PER_LINE; i += 1) {
      moves.push({ kind: i % 2 === 0 ? 'R' : 'D', direction: randomDirection(random) });
    }
    moves.push({ kind: 'U', direction: randomDirection(random) });
  }
  return moves;
}

export function generateMegaminxScramble(random: RandomSource): string {
  return megaminxMovesToString(megaminxScrambleMoves(random));
}

/** Registers `'minx'` — called explicitly from `src/index.ts`. Declared `random-moves`, per Regulation 4b3e. */
export function registerMegaminxScrambler(): void {
  registerScrambler('minx', (random) => generateMegaminxScramble(random), 'random-moves');
}
