/**
 * Internal barrel for the NxNxN cube family.
 * `registerRandomMoveCubeScramblers()` is the intentional bridge to the public
 * API — one call registers 555, 666 and 777.
 */
export {
  allMovesForSize,
  inverseWideMove,
  inverseWideMoves,
  maxDepthForSize,
  moveAxis,
  moveLayerSet,
  parseWideMove,
  wideMovesToString,
  wideMoveToString,
  type WideMove,
} from './notation';
export { buildFacelets, deriveFaceletPermutation, type Facelet } from './geometry';
export {
  applyWideMove,
  applyWideMoves,
  cubeNxNStatesEqual,
  faceletCount,
  faceletFace,
  isIdentityNxN,
  isSolvedNxN,
  misplacedFaceletCount,
  modelForSize,
  solvedCubeNxN,
  type CubeNxNState,
} from './state';
export { isRedundantMove, randomMoveSequence } from './random-moves';
export {
  generateCubeNxNScramble,
  RANDOM_MOVE_CUBES,
  registerRandomMoveCubeScramblers,
} from './solve';
