/**
 * Internal barrel for the algorithm-notation layer.
 *
 * A subset of this — `parseAlgorithm`, `serializeAlgorithm`,
 * `invertAlgorithm`, `AlgorithmSyntaxError` and the AST types — is re-exported
 * from `src/index.ts`. The tokenizer and the structural helpers are not: they
 * are how the parser is built, not what it is for.
 */
export { parseAlgorithm, validateAlgorithm, type AlgorithmValidation } from './parse';
export { serializeAlgorithm, serializeNode } from './serialize';
export { invertAlgorithm, invertNode } from './invert';
export { tokenize, type Token, type TokenKind } from './tokenize';
export { algorithmsEqual, collectMoves, nodesEqual } from './equality';
export {
  AlgorithmSyntaxError,
  FACE_FAMILIES,
  ROTATION_FAMILIES,
  SLICE_FAMILIES,
  type Algorithm,
  type AlgorithmNode,
  type AlgorithmSyntaxErrorDetail,
  type CommutatorNode,
  type ConjugateNode,
  type GroupNode,
  type MoveFamily,
  type MoveNode,
  type PauseNode,
  type SyntaxErrorReason,
} from './types';
