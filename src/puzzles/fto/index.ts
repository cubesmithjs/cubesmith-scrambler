/**
 * Internal barrel for the Face Turning Octahedron module.
 * `registerFtoScrambler()` is the intentional bridge to the public API;
 * everything else is an implementation detail.
 */
export {
  allMovesFto,
  ftoMovesToString,
  ftoMoveToString,
  FTO_AMOUNTS,
  FTO_FACES,
  inverseFtoMove,
  inverseFtoMoves,
  parseFtoMove,
  parseFtoScramble,
  type FtoAmount,
  type FtoFace,
  type FtoMove,
} from './notation';
export {
  applyFtoMove,
  applyFtoMoves,
  ftoStatesEqual,
  ftoStatesLookEqual,
  isSolvedFto,
  SOLVED_FTO_STATE,
  type FtoState,
} from './state';
export { randomFtoState } from './random-state';
export { solveFto } from './search';
export {
  generateFtoScramble,
  isAtLeastMovesFromSolved,
  MIN_FTO_SOLVE_DISTANCE,
  prepareFtoScrambler,
  registerFtoScrambler,
} from './solve';
