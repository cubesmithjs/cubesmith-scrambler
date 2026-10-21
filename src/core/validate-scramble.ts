import { parseAlgorithm } from '../notation/alg/parse';
import { AlgorithmSyntaxError } from '../notation/alg/types';
import { parseClockScramble } from '../puzzles/clock/notation';
import { parseMegaminxScramble } from '../puzzles/megaminx/notation';
import { parsePyraminxScramble } from '../puzzles/pyraminx/notation';
import { parseFtoScramble } from '../puzzles/fto/notation';
import { parseSkewbScramble } from '../puzzles/skewb/notation';
import { parseSquare1Scramble } from '../puzzles/square1/notation';
import { notationForEvent } from './event-notation';
import { ScrambleSyntaxError, type BespokeNotation, type Notation } from './scramble-errors';
import type { WcaEventId } from './types';

/**
 * The result of {@link validateScramble} — three arms rather than two, because
 * the two grammars' errors are two classes on purpose.
 *
 * A caller narrows on `valid`, and then, if it wants the error's payload, on
 * `notation`:
 *
 * ```ts
 * const result = validateScramble('minx', input);
 * if (!result.valid) {
 *   if (result.notation === 'cube') translateCubeCode(result.error.reason);
 *   else translateScrambleCode(result.error.reason);
 * }
 * ```
 *
 * ## Why the valid arm carries no parsed form
 *
 * There is no shared tree to hand back. `validateAlgorithm` returns its
 * `Algorithm` so a caller does not parse twice, and that works because there is
 * one type. Here there are six, and the package is emphatic that merging them
 * would be **wrong** rather than merely awkward — a Pyraminx `2` means
 * *counterclockwise*, so a shared `amount` field would carry a false meaning.
 *
 * The alternative was publishing all six internal AST shapes, and publishing
 * them means freezing them: `Square1Move`, `ClockToken` and friends were
 * written for a solver's convenience and have never had to survive a consumer.
 * So this ships **validity only**, and the payload is reserved: adding one
 * later is additive and non-breaking, removing one would not be.
 *
 * `notation` is not that payload. It says which of the seven grammars ran — a
 * fact about the dispatch, derivable from the event, and committing to nothing
 * about any tree.
 */
export type ScrambleValidation =
  | { readonly valid: true; readonly notation: Notation }
  | { readonly valid: false; readonly notation: 'cube'; readonly error: AlgorithmSyntaxError }
  | {
      readonly valid: false;
      readonly notation: BespokeNotation;
      readonly error: ScrambleSyntaxError;
    };

/**
 * Ask whether a string is valid scramble notation **for a given event**, for
 * all eighteen WCA events, without a `try`/`catch`.
 *
 * This is the door onto seven grammars. Twelve events are cube notation and go to
 * `parseAlgorithm`; the other six each have their own parser — five of which existed
 * and were tested inside this package long before they were reachable from outside
 * it. A consumer picks an event rather than guessing which of seven parsers
 * applies.
 *
 * ```ts
 * validateScramble('minx', 'R++ D-- U').valid;  // true
 * validateScramble('333', "R U R' U'").valid;   // true
 * ```
 *
 * Four things worth knowing:
 *
 * - **It answers a question about *notation*, not about a scramble being good.**
 *   Whether a scramble is WCA-legal (Regulation 4b3 floors, orientation
 *   suffixes, shape distributions) is a different question, and whether
 *   `(13, 0)` is reachable on a real Square-1 is a question about a puzzle.
 *   Neither is asked here.
 * - **Empty input is valid**, agreeing with `validateAlgorithm` and with all
 *   six bespoke parsers: empty means no scramble, not a malformed one.
 * - **An unknown event validates as cube notation** rather than throwing
 *   `UnimplementedEventError`. Every one of the eighteen is implemented, so
 *   this is currently unreachable — but a parser needs no scrambler, so
 *   validating is the coherent answer if that ever changes.
 * - 🔴 **Anything that is not a syntax error is re-thrown**, exactly as
 *   `validateAlgorithm` does. A `TypeError` from inside a parser is a bug in
 *   this package, and reporting one as a user's typo would make it
 *   undebuggable.
 *
 * There is deliberately no throwing sibling. The six parsers already throw,
 * and a consumer who wants that shape writes a two-line wrapper whose behaviour
 * they choose — doubling the public surface, the docs and the README's executed
 * examples to ship a wrapper was not worth it.
 */
export function validateScramble(event: WcaEventId, text: string): ScrambleValidation {
  const notation = notationForEvent(event);

  try {
    parseForNotation(notation, text);
    return { valid: true, notation };
  } catch (error) {
    if (notation === 'cube') {
      if (error instanceof AlgorithmSyntaxError) return { valid: false, notation, error };
      throw error;
    }
    if (error instanceof ScrambleSyntaxError) return { valid: false, notation, error };
    throw error;
  }
}

/**
 * Runs the right parser and discards its result.
 *
 * The result is discarded rather than returned because of the decision above:
 * the six trees stay private. Should that change, this is the one place that
 * has to start keeping them.
 */
function parseForNotation(notation: Notation, text: string): void {
  switch (notation) {
    case 'cube':
      parseAlgorithm(text);
      return;
    case 'megaminx':
      parseMegaminxScramble(text);
      return;
    case 'clock':
      parseClockScramble(text);
      return;
    case 'pyraminx':
      parsePyraminxScramble(text);
      return;
    case 'skewb':
      parseSkewbScramble(text);
      return;
    case 'square1':
      parseSquare1Scramble(text);
      return;
    case 'fto':
      parseFtoScramble(text);
      return;
  }
}
