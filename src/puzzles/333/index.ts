/**
 * Internal barrel for the 3x3x3 puzzle module — building blocks for the
 * eventual `generateScramble('333')` support (M4/M5: pruning tables + the
 * two-phase IDA* search), not yet re-exported from the package's top-level
 * `src/index.ts`. Nothing here is registered with `core/scrambler-registry`
 * yet, so `generateScramble('333')` still throws `UnimplementedEventError`
 * until that lands — this module is real, tested code, just not yet wired
 * to the public scramble-generation contract.
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
