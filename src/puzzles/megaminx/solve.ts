import { registerScrambler } from '../../core/scrambler-registry';
import { isAtLeastTwoMovesFromSolved } from '../../core/scramble-shape';
import type { RandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import {
  allMovesMegaminx,
  megaminxMovesToString,
  type MegaminxDirection,
  type MegaminxMove,
} from './notation';
import {
  applyMegaminxMove,
  applyMegaminxMoves,
  isSolvedMegaminx,
  SOLVED_MEGAMINX_STATE,
} from './state';

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

/**
 * Regulation 4b3e's floor, for the one event here that has no solver.
 *
 * > 5x5x5 Cube, 6x6x6 Cube, 7x7x7 Cube, and Megaminx: sufficiently many random
 * > moves (instead of random state), **at least 2 moves to solve**.
 *
 * Two moves is the one threshold that needs no distance function — a state is
 * closer than that exactly when it is solved, or when a single move solves it
 * — which is why `core/scramble-shape.ts` can express it generically and why
 * this reuses that rather than growing a bespoke check. The neighbourhood is
 * `allMovesMegaminx()`, the puzzle's own six tokens (`R++ R-- D++ D-- U U'`),
 * not a cube's eighteen.
 */
export function megaminxScrambleIsFarEnough(moves: readonly MegaminxMove[]): boolean {
  return isAtLeastTwoMovesFromSolved(
    applyMegaminxMoves(SOLVED_MEGAMINX_STATE, moves),
    allMovesMegaminx(),
    applyMegaminxMove,
    isSolvedMegaminx,
  );
}

/**
 * Regenerates until the scramble clears the floor. 77 independent coin flips
 * landing within one move of solved is not something that will be seen — but
 * "so unlikely it cannot happen" is not "cannot happen", and the regulation
 * states a requirement rather than a likelihood. Same shape, and the same
 * reasoning, as `nxn/minimum.ts`'s `withMinimumDistance`.
 */
const MEGAMINX_DRAW_ATTEMPTS = 100;

export function generateMegaminxScramble(random: RandomSource): string {
  for (let attempt = 0; attempt < MEGAMINX_DRAW_ATTEMPTS; attempt += 1) {
    const moves = megaminxScrambleMoves(random);
    if (megaminxScrambleIsFarEnough(moves)) return megaminxMovesToString(moves);
  }
  throw new Error(
    `megaminx: ${MEGAMINX_DRAW_ATTEMPTS} scrambles in a row were within one move of solved`,
  );
}

/** Registers `'minx'` — called explicitly from `src/index.ts`. Declared `random-moves`, per Regulation 4b3e. */
export function registerMegaminxScrambler(): void {
  registerScrambler('minx', (random) => generateMegaminxScramble(random), 'random-moves');
}
