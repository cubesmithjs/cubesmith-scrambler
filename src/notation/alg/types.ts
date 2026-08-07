/**
 * A typed tree for full WCA algorithm notation — the notation this package
 * *emits* but, until now, could not *read*.
 *
 * `src/notation/move.ts`'s `parseMove` accepts `/^([UDFBLR])(2|')?$/` and
 * nothing else, while `generateScramble('333bf')` emits `Rw2 Fw'`,
 * `generateScramble('555')` emits `3Rw` and `generateScramble('444bf')` emits
 * `x2 y'`. That is a coherence gap independent of any consumer: the package
 * could not parse its own output.
 *
 * ## What this is not
 *
 * It is **syntax only**. There is no puzzle behind it: no `simplify()`, no move
 * cancellation, no reordering. Those need a state model, which the package
 * deliberately does not have at this layer.
 *
 * It also does **not** absorb the five bespoke puzzle notations — Megaminx's
 * Pochmann tokens, Clock's pin/hour syntax, Pyraminx's and Skewb's order-3
 * turns, Square-1's `(a,b)/`. They stay in their own modules and deliberately
 * do not share this type. The temptation to unify them is the main design risk
 * here, and it is a trap: a Pyraminx `2` means *counterclockwise*, not a half
 * turn, so a shared `amount` would be actively wrong.
 *
 * ## Naming
 *
 * `Algorithm`, not `Alg`. `cubing/alg` exports `Alg`, and a consumer migrating
 * from it — the one consumer this layer exists for — would otherwise have to
 * rename one of the two in every file that imports both during the switchover.
 */

/** Every move family this notation accepts. Anything else is a syntax error rather than an unknown-but-tolerated move. */
export type MoveFamily = 'U' | 'D' | 'F' | 'B' | 'L' | 'R' | 'M' | 'E' | 'S' | 'x' | 'y' | 'z';

export const FACE_FAMILIES: readonly MoveFamily[] = ['U', 'D', 'F', 'B', 'L', 'R'];
export const SLICE_FAMILIES: readonly MoveFamily[] = ['M', 'E', 'S'];
export const ROTATION_FAMILIES: readonly MoveFamily[] = ['x', 'y', 'z'];

/**
 * A single turn.
 *
 * Layers are a **closed range counted inwards from the face**, and both ends
 * are `null` when the notation did not write them — which is not the same as
 * writing them explicitly:
 *
 * | Written | `outerLayer` | `innerLayer` |
 * |---|---|---|
 * | `R` | `null` | `null` |
 * | `Rw`, `r` | `null` | `2` |
 * | `3Rw`, `3r` | `null` | `3` |
 * | `2-3Rw` | `2` | `3` |
 * | `M`, `x` | `null` | `null` |
 *
 * Both are required-and-nullable rather than optional properties on purpose:
 * the package compiles with `exactOptionalPropertyTypes`, under which an
 * absent property and a present-but-`undefined` one are different types, and
 * structural equality over a tree is far simpler when every node has the same
 * shape.
 *
 * `amount` is **signed and never zero**: `R` is `1`, `R2` is `2`, `R'` is
 * `-1`, `R2'` is `-2`, `R3` is `3`.
 */
export interface MoveNode {
  readonly type: 'move';
  readonly family: MoveFamily;
  readonly outerLayer: number | null;
  readonly innerLayer: number | null;
  readonly amount: number;
}

/**
 * A `.` — a deliberate break in an algorithm, most often separating the stages
 * of a solution. Carries no amount: repeating a pause means nothing.
 */
export interface PauseNode {
  readonly type: 'pause';
}

/** `(R U)`, `(R U)2`, `(R U)'`, `(R U)2'` — a parenthesised body with a repetition. */
export interface GroupNode {
  readonly type: 'group';
  readonly body: Algorithm;
  readonly amount: number;
}

/** `[A, B]` — the commutator `A B A' B'`. Expansion is not this layer's job; the tree keeps both halves. */
export interface CommutatorNode {
  readonly type: 'commutator';
  readonly a: Algorithm;
  readonly b: Algorithm;
  readonly amount: number;
}

/** `[A: B]` — the conjugate `A B A'`. Same bracket as a commutator; the separator is what distinguishes them. */
export interface ConjugateNode {
  readonly type: 'conjugate';
  readonly a: Algorithm;
  readonly b: Algorithm;
  readonly amount: number;
}

export type AlgorithmNode = MoveNode | PauseNode | GroupNode | CommutatorNode | ConjugateNode;

/** An ordered sequence of nodes. The parser's output, and the body of every nested construct. */
export interface Algorithm {
  readonly nodes: readonly AlgorithmNode[];
}

/**
 * A syntax error with the **offset** it occurred at, because the main use for
 * a parser like this is validating somebody else's algorithm library — and a
 * validator that says only "invalid" is barely worth running.
 */
export class AlgorithmSyntaxError extends Error {
  readonly input: string;
  readonly offset: number;

  constructor(input: string, offset: number, message: string) {
    super(`notation: ${message} at offset ${offset} in "${input}"`);
    this.name = 'AlgorithmSyntaxError';
    this.input = input;
    this.offset = offset;
  }
}
