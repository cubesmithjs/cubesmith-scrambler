/**
 * Rubik's Clock notation. Nothing in `src/notation/move.ts` applies — there
 * are no faces, no layers and no turn amounts in the cube sense. A Clock
 * "move" names a *pin configuration* and how far to turn a wheel, and the
 * scramble also contains a physical flip of the puzzle and a closing
 * declaration of where the pins are left.
 *
 * The official format, as produced by the WCA scramble program, is a fixed
 * template of exactly fourteen dial amounts:
 *
 * ```
 *   UR4+ DR3+ DL5- UL3+ U2- R3- D1+ L0+ ALL4- y2 U4+ R0+ D4+ L4- ALL2- DL
 * ```
 *
 * - Each letter group names which pins are **up**; `UR4+` means "raise only
 *   the upper-right pin, then turn the upper-right wheel 4 hours clockwise".
 * - `+` is clockwise, `-` counterclockwise, and the amount is in hours.
 * - `y2` flips the puzzle over; the five tokens after it are performed from
 *   the other side.
 * - Any bare letter groups at the very end declare which pins are left up.
 *   There can be none, in which case the scramble simply ends at `ALL`.
 *
 * Fourteen amounts is not a coincidence: a Clock has exactly fourteen
 * independent dials, and `mechanics.test.ts` shows this template is a
 * *unimodular* basis for them — see `mechanics.ts`.
 */

import { ScrambleSyntaxError } from '../../core/scramble-errors';
import { tokenizeWords } from '../../notation/tokenize-words';

export type ClockCorner = 'UR' | 'DR' | 'DL' | 'UL';

/** Order matters: it's the order corners are listed in a closing pin declaration. */
export const CLOCK_CORNERS: readonly ClockCorner[] = ['UR', 'DR', 'DL', 'UL'];

/** The nine pin configurations the notation can name — four single corners, four edge pairs, and all four. */
export type ClockPinSet = ClockCorner | 'U' | 'R' | 'D' | 'L' | 'ALL';

export const CLOCK_PIN_SETS: readonly ClockPinSet[] = [
  'UR',
  'DR',
  'DL',
  'UL',
  'U',
  'R',
  'D',
  'L',
  'ALL',
];

/** Which corners a pin-set name raises. */
export const PIN_SET_CORNERS: Readonly<Record<ClockPinSet, readonly ClockCorner[]>> = {
  UR: ['UR'],
  DR: ['DR'],
  DL: ['DL'],
  UL: ['UL'],
  U: ['UL', 'UR'],
  R: ['UR', 'DR'],
  D: ['DL', 'DR'],
  L: ['UL', 'DL'],
  ALL: ['UL', 'UR', 'DL', 'DR'],
};

export const CLOCK_HOURS = 12;

export type ClockToken =
  /** Raise `pins`, turn a raised wheel `amount` hours clockwise (`amount` is in `Z12`). */
  | { readonly kind: 'dial'; readonly pins: ClockPinSet; readonly amount: number }
  /** `y2` — turn the whole puzzle over. */
  | { readonly kind: 'flip' }
  /** A closing declaration of which pins are left up, in the frame the scramble ends in. */
  | { readonly kind: 'pins'; readonly up: readonly ClockCorner[] };

/**
 * Renders an amount in `Z12` the way the notation does: `0+`, `1+`…`6+` for
 * clockwise, `1-`…`5-` for counterclockwise. That's exactly twelve distinct
 * spellings for twelve values — `6-` never appears, because a half turn is
 * already spelled `6+`.
 */
export function clockAmountToString(amount: number): string {
  const hours = ((amount % CLOCK_HOURS) + CLOCK_HOURS) % CLOCK_HOURS;
  return hours <= 6 ? `${hours}+` : `${CLOCK_HOURS - hours}-`;
}

export function parseClockAmount(text: string): number {
  const match = /^(\d+)([+-])$/.exec(text);
  if (!match) throw new Error(`clock-notation: "${text}" is not a valid amount`);
  const hours = Number(match[1]);
  if (hours > 6) throw new Error(`clock-notation: "${text}" exceeds the 0..6 hour range`);
  const signed = match[2] === '-' ? -hours : hours;
  return ((signed % CLOCK_HOURS) + CLOCK_HOURS) % CLOCK_HOURS;
}

export function clockTokenToString(token: ClockToken): string {
  if (token.kind === 'flip') return 'y2';
  if (token.kind === 'pins') return token.up.join(' ');
  return `${token.pins}${clockAmountToString(token.amount)}`;
}

export function clockTokensToString(tokens: readonly ClockToken[]): string {
  return tokens
    .map(clockTokenToString)
    .filter((text) => text.length > 0)
    .join(' ');
}

const PIN_SET_NAMES = new Set<string>(CLOCK_PIN_SETS);

/**
 * Parses a whole scramble. A bare letter group is a closing pin
 * declaration and a letter group with an amount is a dial move, which is
 * what keeps `DL` and `DL5-` unambiguous. Consecutive bare groups are
 * folded into the single declaration they represent.
 *
 * Since v0.12 it walks `tokenizeWords` rather than `text.split(/\s+/)`, purely
 * so that a rejection can say **where**. The old splitter discarded positions,
 * which is why this parser could report a bad token but never point at it. The
 * successful path is unchanged.
 *
 * @throws {ScrambleSyntaxError} carrying an `offset`, a `length` and a
 * {@link ScrambleErrorReason}. Three of the four codes it can produce are the
 * three conditions below; the fourth comes from the hour range.
 */
export function parseClockScramble(text: string): ClockToken[] {
  const tokens: ClockToken[] = [];
  const trailingPins: ClockCorner[] = [];

  for (const { text: word, offset } of tokenizeWords(text)) {
    if (word === 'y2') {
      tokens.push({ kind: 'flip' });
      continue;
    }

    const span = { length: word.length, token: word } as const;
    const match = /^([A-Z]+)(\d+[+-])?$/.exec(word);

    // Two conditions that used to share one `||` and one message, split
    // because they are different mistakes: `5+` and `UR3` are not shaped like
    // a Clock token at all, while `XY1+` is — and names a pin set that does
    // not exist. A consumer can say so.
    if (!match) {
      throw new ScrambleSyntaxError(
        'clock',
        text,
        offset,
        `"${word}" is not a valid Clock token`,
        { reason: 'clock-not-a-token', ...span },
      );
    }
    const name = match[1]!;
    if (!PIN_SET_NAMES.has(name)) {
      throw new ScrambleSyntaxError(
        'clock',
        text,
        offset,
        `"${word}" is not a valid Clock token`,
        { reason: 'clock-not-a-pin-set', ...span, pins: name },
      );
    }

    const pins = name as ClockPinSet;
    if (match[2]) {
      const amount = match[2];
      try {
        tokens.push({ kind: 'dial', pins, amount: parseClockAmount(amount) });
      } catch {
        // `parseClockAmount` has two throws, and only one is reachable from
        // here: the `\d+[+-]` this regex already matched satisfies its own,
        // so the shape can never be the complaint and the range always is.
        throw new ScrambleSyntaxError(
          'clock',
          text,
          offset,
          `"${amount}" exceeds the 0..6 hour range`,
          {
            reason: 'clock-hour-out-of-range',
            ...span,
            pins: name,
            hours: Number.parseInt(amount, 10),
          },
        );
      }
      continue;
    }

    if (!CLOCK_CORNERS.includes(pins as ClockCorner)) {
      // A *positional* rule, and the one this notation's tail turns on — which
      // is why it is worth an offset. `U` and `ALL` are legal pin sets to turn
      // and illegal ones to end with.
      throw new ScrambleSyntaxError(
        'clock',
        text,
        offset,
        `"${word}" can only close a scramble as a single corner`,
        { reason: 'clock-pin-not-a-corner', ...span, pins: name },
      );
    }
    trailingPins.push(pins as ClockCorner);
  }

  if (trailingPins.length > 0) tokens.push({ kind: 'pins', up: trailingPins });
  return tokens;
}
