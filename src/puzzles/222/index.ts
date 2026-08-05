/**
 * Internal barrel for the 2x2x2 puzzle module — mirrors
 * `puzzles/333/index.ts`'s structure. `register222Scrambler()` is the
 * intentional bridge to the public API.
 */
export {
  allMoves222,
  applyMove222,
  applyMoves222,
  isSolved222,
  SOLVED_222_STATE,
  statesEqual222,
  CORNER_COUNT_222,
  type Cube222State,
} from './state';
export { randomState222 } from './random-state';
export { solve222 } from './search';
export { generate222Scramble, register222Scrambler } from './solve';
