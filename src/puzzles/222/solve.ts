import type { RandomSource } from '../../random/random-source';
import { inverseMoves, movesToString } from '../../notation/move';
import { registerScrambler } from '../../core/scrambler-registry';
import { randomState222 } from './random-state';
import { solve222 } from './search';
import type { Cube222State } from './state';

/**
 * Draws a uniformly random reachable 2x2x2 state and solves it optimally
 * (see `search.ts` — the pruning table holds exact distances for this
 * puzzle, so the solution is always shortest-possible). The scramble
 * returned is the *inverse* of that solution — same convention as
 * `puzzles/333/solve.ts`.
 */
export function generate222Scramble(random: RandomSource): string {
  const state: Cube222State = randomState222(random);
  const solution = solve222(state);
  return movesToString(inverseMoves(solution));
}

/** Registers `'222'` with the core scrambler registry — called explicitly from `src/index.ts`, same reasoning as `puzzles/333/solve.ts`'s `register333Scrambler`. */
export function register222Scrambler(): void {
  registerScrambler('222', (random) => generate222Scramble(random));
}
