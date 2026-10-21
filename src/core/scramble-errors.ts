/**
 * The error type for the **six bespoke puzzle notations** — Megaminx, Clock,
 * Pyraminx, Skewb, Square-1 and, since v0.15, the Face Turning Octahedron — and
 * the reason codes they can produce.
 *
 * Everything here mirrors what `AlgorithmSyntaxError` established in v0.11 for
 * cube notation, deliberately and one field at a time, because the alternative
 * was a public API that is localizable for twelve events and not for the rest.
 * The first five parsers existed and were tested long before v0.12, but threw a
 * bare `Error` carrying an English sentence, no offset, no span and no code; the
 * FTO's was written against this class from the start.
 */

import type { SyntaxErrorReason } from '../notation/alg/types';

/**
 * The seven grammars this package reads. Not an event id — twelve of the
 * eighteen WCA events share one grammar, and the map from event to notation
 * lives in `event-notation.ts`.
 *
 * `'cube'` names the grammar `parseAlgorithm` reads and is handled by
 * `AlgorithmSyntaxError`, not by this class; it appears in this union because
 * `validateScramble` dispatches over all seven.
 *
 * Adding `'fto'` in v0.15 widened this union: an exhaustive `switch` over it
 * needs one more arm.
 */
export type Notation = 'cube' | 'megaminx' | 'clock' | 'pyraminx' | 'skewb' | 'square1' | 'fto';

/** The six that are not cube notation — the ones this error class covers. */
export type BespokeNotation = Exclude<Notation, 'cube'>;

/**
 * Every distinct way one of the six bespoke notations can be malformed, as a
 * **stable string code**, prefixed by the notation that produces it.
 *
 * 🔴 **Deliberately a separate union from `SyntaxErrorReason`**, rather than
 * new members added to it. A consumer that switches exhaustively over cube
 * codes — a `Record<SyntaxErrorReason, Template>` message table, which is
 * exactly what the demo carries — would stop compiling on upgrade if these
 * became members of that union, even though nothing it does had changed. The
 * cost is that a consumer handling all seven grammars writes two switches, and
 * that is the honest shape of the thing: they are two grammars.
 *
 * The prefix is not decoration. A code read in a log says which grammar
 * rejected the string without needing the surrounding context.
 *
 * 🔴 **Renaming one of these is a breaking change.** Adding one is not, so a
 * consumer switching on them should keep a default arm.
 *
 * | Code | Example input |
 * |---|---|
 * | `megaminx-not-a-move` | `X++` |
 * | `megaminx-bad-direction` | `R+++` |
 * | `pyraminx-not-a-vertex` | `Z` |
 * | `pyraminx-bad-amount` | `U2` |
 * | `skewb-not-a-corner` | `F` |
 * | `skewb-bad-amount` | `R2` |
 * | `clock-not-a-token` | `5+` |
 * | `clock-not-a-pin-set` | `XY1+` |
 * | `clock-hour-out-of-range` | `UR9+` |
 * | `clock-pin-not-a-corner` | `ALL1+ U` |
 * | `square1-stray-character` | `(1, 0) x` |
 * | `square1-zero-turn` | `(0, 0)` |
 * | `fto-not-a-face` | `BX` |
 * | `fto-bad-amount` | `R2` |
 * | `unexpected-token` | — the residual; see below |
 *
 * `unexpected-token` is the **residual**, spelled the same as the cube union's
 * for the same reason and with the same meaning: it is what a
 * `ScrambleSyntaxError` constructed without a detail reports, rather than a
 * precision it does not have. Nothing any of the six parsers currently
 * produces reaches it.
 */
export type ScrambleErrorReason =
  | 'megaminx-not-a-move'
  | 'megaminx-bad-direction'
  | 'pyraminx-not-a-vertex'
  | 'pyraminx-bad-amount'
  | 'skewb-not-a-corner'
  | 'skewb-bad-amount'
  | 'clock-not-a-token'
  | 'clock-not-a-pin-set'
  | 'clock-hour-out-of-range'
  | 'clock-pin-not-a-corner'
  | 'square1-stray-character'
  | 'square1-zero-turn'
  | 'fto-not-a-face'
  | 'fto-bad-amount'
  | 'unexpected-token';

/**
 * What a bespoke-notation error carries beyond its offset — the code, the span,
 * and whatever a message would need to interpolate.
 *
 * Flat and optional rather than a discriminated union keyed on `reason`, for
 * the reason `AlgorithmSyntaxErrorDetail` gives: the discriminant would live on
 * an `Error` instance, so a consumer would narrow through a property on a
 * subclass rather than a type guard, and adding a field to one arm later would
 * be breaking.
 */
export interface ScrambleSyntaxErrorDetail {
  readonly reason: ScrambleErrorReason;
  /**
   * How many characters at `offset` the problem covers, so a caller can
   * underline the offending *token* (`R+++`, `(0, 0)`) rather than pointing at
   * its first character.
   *
   * **`0` means the text is missing rather than wrong** — the same contract
   * v0.11 set for `AlgorithmSyntaxError.length`. Render that as a caret, not as
   * a zero-width selection.
   */
  readonly length: number;
  /** The whole offending word or match. Carried by every code that rejects a token rather than a character. */
  readonly token?: string;
  /** The single offending character, where there is exactly one. */
  readonly char?: string;
  /** The pin-set name a Clock token named. `clock-not-a-pin-set`, `clock-pin-not-a-corner`. */
  readonly pins?: string;
  /** The hour count a Clock amount asked for. `clock-hour-out-of-range`. */
  readonly hours?: number;
}

/**
 * A syntax error from one of the six bespoke notations, carrying the **offset**
 * it occurred at, the **span** it covers, a machine-readable
 * {@link ScrambleErrorReason} and the data a localized message needs.
 *
 * 🔴 **Deliberately not a subclass of `AlgorithmSyntaxError`.** Subclassing
 * would make `error instanceof AlgorithmSyntaxError` true for a Clock failure,
 * so an existing consumer's catch-and-classify table would silently start
 * receiving codes it has never heard of and fall through its own exhaustive
 * switch. Two sibling classes, both extending `Error`, keep the two grammars'
 * failures distinguishable by construction rather than by convention.
 *
 * The three contracts v0.11 established carry over unchanged:
 *
 * - **`length: 0` means text is missing** at `offset` rather than wrong.
 * - **`.message` is English and stays so.** It is the right thing to log and
 *   the wrong thing to show a user.
 * - 🔴 **No locale strings ship with this package, and none ever will.** It
 *   exports a code and the data to interpolate; the sentence belongs to the
 *   consumer, in the consumer's language.
 */
export class ScrambleSyntaxError extends Error {
  /** Which of the seven grammars rejected the input. Never `'cube'` — that path throws `AlgorithmSyntaxError`. */
  readonly notation: BespokeNotation;
  readonly input: string;
  readonly offset: number;
  readonly reason: ScrambleErrorReason;
  readonly length: number;
  readonly token?: string;
  readonly char?: string;
  readonly pins?: string;
  readonly hours?: number;

  constructor(
    notation: BespokeNotation,
    input: string,
    offset: number,
    message: string,
    detail?: ScrambleSyntaxErrorDetail,
  ) {
    // The `<notation>-notation:` prefix is what the first five parsers already
    // printed before they carried any structure, kept byte-for-byte so a
    // consumer or test matching on it does not break on the upgrade.
    super(`${notation}-notation: ${message} at offset ${offset} in "${input}"`);
    this.name = 'ScrambleSyntaxError';
    this.notation = notation;
    this.input = input;
    this.offset = offset;
    this.reason = detail?.reason ?? 'unexpected-token';
    this.length = detail?.length ?? 0;
    // Assigned one by one rather than spread: the package compiles with
    // `exactOptionalPropertyTypes`, under which writing `undefined` into an
    // optional property is a different type from leaving it absent.
    if (detail?.token !== undefined) this.token = detail.token;
    if (detail?.char !== undefined) this.char = detail.char;
    if (detail?.pins !== undefined) this.pins = detail.pins;
    if (detail?.hours !== undefined) this.hours = detail.hours;
  }
}

/**
 * The residual code, exported as a value so the two unions can be compared in
 * a test rather than by eye.
 *
 * `SyntaxErrorReason` and `ScrambleErrorReason` are separate types on purpose
 * (see the doc comment above), and this is the one member they share: the same
 * spelling for the same meaning, so a consumer merging the two default arms
 * does not have to learn a second name for "could not be classified".
 */
export const SHARED_RESIDUAL_REASON: SyntaxErrorReason & ScrambleErrorReason = 'unexpected-token';
