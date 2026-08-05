import type { RandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { decodeCornerOrientation222Coord, decodeCornerPerm222Coord } from './coordinates';
import { CORNER_ORIENTATION_222_STATES, CORNER_PERM_222_STATES } from './coordinates';
import type { Cube222State } from './state';

/**
 * Unlike 3x3x3, there's no parity constraint linking permutation to
 * anything else here — `pruning.ts`'s BFS already confirmed all 5040 x 729
 * combinations are reachable (0 unvisited entries), so a uniformly random
 * permutation coordinate and a uniformly random orientation coordinate,
 * decoded independently, is already a uniformly random *reachable* state —
 * no rejection or fix-up step needed (contrast `puzzles/333/random-state.ts`).
 */
export function randomState222(random: RandomSource): Cube222State {
  const permCoord = randomInt(random, CORNER_PERM_222_STATES);
  const orientationCoord = randomInt(random, CORNER_ORIENTATION_222_STATES);
  return {
    cornerPermutation: decodeCornerPerm222Coord(permCoord),
    cornerOrientation: decodeCornerOrientation222Coord(orientationCoord),
  };
}
