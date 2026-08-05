/**
 * Internal barrel for the 3x3x3 puzzle module. `register333Scrambler()` is
 * the intentional bridge to the public API — `src/index.ts` calls it
 * explicitly so `generateScramble('333')` actually produces a scramble;
 * everything else here is internal building blocks not re-exported from
 * the package's top-level entry point.
 */
export {
  applyMove,
  applyMoves,
  isSolved,
  SOLVED_STATE,
  statesEqual,
  CORNER_COUNT,
  EDGE_COUNT,
  type CubeState,
} from './state';
export { getMoveTable, allFaceMoves, moveKey, type MoveTable } from './move-tables';
export { randomState } from './random-state';
export { solve333, generate333Scramble, register333Scrambler } from './solve';
