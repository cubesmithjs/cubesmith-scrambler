import type { Notation } from './scramble-errors';
import type { WcaEventId } from './types';

/**
 * Which grammar each WCA event's scramble is written in.
 *
 * 🔴 **Five rows, not seventeen.** Twelve of the seventeen events are written
 * in cube notation, and listing them would be a second hand-maintained copy of
 * the registry that could drift from it — exactly the failure this package
 * designs against, and the one `README.md` already suffered when it claimed
 * fifteen working events while the registry held thirteen. Anything not named
 * here is cube notation, including an event added tomorrow.
 *
 * `corpus.test.ts` derives its cube-event list from {@link NON_CUBE_EVENTS}
 * rather than keeping its own literal, so the two cannot disagree.
 */
export const BESPOKE_NOTATION_BY_EVENT = {
  minx: 'megaminx',
  clock: 'clock',
  pyram: 'pyraminx',
  skewb: 'skewb',
  sq1: 'square1',
} as const satisfies Readonly<Partial<Record<WcaEventId, Notation>>>;

/**
 * The five events `parseAlgorithm` deliberately refuses. Derived from the map
 * above rather than written twice.
 */
export const NON_CUBE_EVENTS: ReadonlySet<string> = new Set(
  Object.keys(BESPOKE_NOTATION_BY_EVENT),
);

/**
 * The grammar an event's scramble is written in.
 *
 * Total by construction: an unknown event id — one that has no scrambler, or
 * one that is not a `WcaEventId` at all at runtime — answers `'cube'` rather
 * than throwing. Validation needs a *parser*, not a scrambler, so refusing to
 * answer would be a worse answer than the default.
 */
export function notationForEvent(event: WcaEventId): Notation {
  const bespoke = (BESPOKE_NOTATION_BY_EVENT as Readonly<Record<string, Notation | undefined>>)[
    event
  ];
  return bespoke ?? 'cube';
}
