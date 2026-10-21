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
 * It also does **not** absorb the six bespoke puzzle notations — Megaminx's
 * Pochmann tokens, Clock's pin/hour syntax, the order-3 turns of the Pyraminx,
 * the Skewb and the Face Turning Octahedron, Square-1's `(a,b)/`. They stay in their own modules and deliberately
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
 * Every distinct way notation can be malformed, as a **stable string code**.
 *
 * These are public API. `.message` is an English sentence and will always be
 * one; a consumer that wants to say anything else — a different wording, a
 * different language, a caret in a form field — needs something it can switch
 * on that is not prose. Before v0.11 the only options were string-matching the
 * message, which makes every wording change a silent breakage, or
 * reimplementing the classification.
 *
 * A string-literal union rather than an enum: an enum ships runtime code in a
 * package with a single entry point that bundles everything to every consumer,
 * and it forces a consumer to import a *value* to compare against one. Codes
 * are strings on the wire.
 *
 * 🔴 **Renaming one of these is a breaking change.** Adding one is not, so a
 * consumer switching on them should keep a default arm.
 *
 * | Code | Example input |
 * |---|---|
 * | `amount-zero` | `R0` |
 * | `layer-range-incomplete` | `2-Rw` |
 * | `layer-range-not-ascending` | `4-2Rw` |
 * | `layer-count-too-small` | `1Rw` |
 * | `layer-prefix-without-move` | `3` |
 * | `not-a-move` | `R U Q2 R` |
 * | `family-takes-no-width` | `Mw` |
 * | `layer-count-without-w` | `3R` |
 * | `repeated-prime` | `R''` |
 * | `unclosed-group` | `(R U` |
 * | `empty-group` | `()` |
 * | `bracket-missing-separator` | `[R U]` |
 * | `unclosed-bracket` | `[R, U` |
 * | `bracket-extra-separator` | `[R, U: F]` |
 * | `bracket-empty-half` | `[R: ]` |
 * | `unmatched-close-group` | `R U)` |
 * | `unmatched-close-bracket` | `R U]` |
 * | `stray-comma` | `R , U` |
 * | `stray-colon` | `R : U` |
 * | `unexpected-token` | — the residual; see below |
 *
 * `unexpected-token` is the **deliberate residual**, documented rather than
 * pretended away: it is the classification for a token the parser cannot
 * describe more precisely, and for any `AlgorithmSyntaxError` constructed
 * without a detail. Nothing this parser currently produces reaches it — the two
 * strays that used to share it, `,` and `:`, have their own codes — but a
 * default arm that cannot be reached today is cheaper than a code invented
 * under pressure later.
 */
export type SyntaxErrorReason =
  | 'amount-zero'
  | 'layer-range-incomplete'
  | 'layer-range-not-ascending'
  | 'layer-count-too-small'
  | 'layer-prefix-without-move'
  | 'not-a-move'
  | 'family-takes-no-width'
  | 'layer-count-without-w'
  | 'repeated-prime'
  | 'unclosed-group'
  | 'empty-group'
  | 'bracket-missing-separator'
  | 'unclosed-bracket'
  | 'bracket-extra-separator'
  | 'bracket-empty-half'
  | 'unmatched-close-group'
  | 'unmatched-close-bracket'
  | 'stray-comma'
  | 'stray-colon'
  | 'unexpected-token';

/**
 * What a thrown error carries beyond its offset — the code, the span, and
 * whatever a message would need to interpolate.
 *
 * Flat and optional rather than a discriminated union keyed on `reason`. A
 * union is the better *type* — a consumer would get `char` exactly where it
 * exists — but the worse *error class*: the discriminant would live on an
 * `Error` instance, so every consumer would narrow through a property on a
 * subclass rather than through a type guard, and adding a field to one arm
 * later would be breaking. The union does appear, at the level where it reads
 * naturally: `AlgorithmValidation`'s two arms.
 */
export interface AlgorithmSyntaxErrorDetail {
  readonly reason: SyntaxErrorReason;
  /**
   * How many characters at `offset` the problem covers, so a caller can
   * underline the offending *token* (`Q2`, `2-3Rw`) and not just point at its
   * first character.
   *
   * **`0` means the text is missing rather than wrong** — `2-Rw` has no second
   * layer number to underline, and the offset is the position it should have
   * been written at. Render that as a caret, not as a zero-width selection.
   */
  readonly length: number;
  /** The offending character. `not-a-move`, the strays, the unmatched closers. */
  readonly char?: string;
  /** The family that refused the width. `family-takes-no-width`. */
  readonly family?: MoveFamily;
  /** The outer end of a rejected layer range. `layer-range-not-ascending`. */
  readonly outer?: number;
  /** The inner end of a rejected layer range. `layer-range-not-ascending`. */
  readonly inner?: number;
  /** The rejected layer count. `layer-count-too-small`, `layer-count-without-w`. */
  readonly count?: number;
}

/**
 * A syntax error with the **offset** it occurred at, because the main use for
 * a parser like this is validating somebody else's algorithm library — and a
 * validator that says only "invalid" is barely worth running.
 *
 * Since v0.11 it also carries a machine-readable {@link SyntaxErrorReason} and
 * the data a localized message needs. That addition is strictly additive:
 * `.name`, `.message`, `.input` and `.offset` are byte-for-byte what 0.10.0
 * produced, and `detail` is optional so the 3-argument constructor still
 * type-checks. An error built without one reports the documented residual
 * `'unexpected-token'` rather than claiming a precision it does not have.
 *
 * 🔴 **No locale strings ship with this package, and none ever will.** It
 * exports a code and the data to interpolate; the sentence belongs to the
 * consumer. Shipping even an English message table keyed by code would invite
 * consumers to expect `fr`/`ar` next, and a scramble library is the wrong home
 * for a translation catalogue.
 */
export class AlgorithmSyntaxError extends Error {
  readonly input: string;
  readonly offset: number;
  readonly reason: SyntaxErrorReason;
  readonly length: number;
  readonly char?: string;
  readonly family?: MoveFamily;
  readonly outer?: number;
  readonly inner?: number;
  readonly count?: number;

  constructor(
    input: string,
    offset: number,
    message: string,
    detail?: AlgorithmSyntaxErrorDetail,
  ) {
    super(`notation: ${message} at offset ${offset} in "${input}"`);
    this.name = 'AlgorithmSyntaxError';
    this.input = input;
    this.offset = offset;
    this.reason = detail?.reason ?? 'unexpected-token';
    this.length = detail?.length ?? 0;
    // Assigned one by one rather than spread: the package compiles with
    // `exactOptionalPropertyTypes`, under which writing `undefined` into an
    // optional property is a different type from leaving it absent.
    if (detail?.char !== undefined) this.char = detail.char;
    if (detail?.family !== undefined) this.family = detail.family;
    if (detail?.outer !== undefined) this.outer = detail.outer;
    if (detail?.inner !== undefined) this.inner = detail.inner;
    if (detail?.count !== undefined) this.count = detail.count;
  }
}
