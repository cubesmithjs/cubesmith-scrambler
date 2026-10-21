import type { WcaEventId } from '../../core/types';
import { corpusFor } from '../__tests__/corpus';

/**
 * The fixture set: one real scramble per cube size, the two blindfolded cubes whose
 * scrambles end in a rotation, and two per bespoke puzzle.
 *
 * 🔴 **Every scramble is a literal string, taken from `__tests__/corpus.ts`** — the
 * fixtures do **not** call `generateScramble`. Two reasons, and the second is the one
 * that matters:
 *
 * - Cost. Generating eighteen scrambles under `--coverage` timed out the golden test at
 *   the 180 s per-test limit; drawing eighteen from text takes milliseconds.
 * - 🔴 Independence. A fixture whose input came from a seed is a fixture that changes
 *   when the *generator* changes. This package's 4x4x4 solver is documented as
 *   non-optimal and open to improvement; the day someone improves it, every seeded
 *   fixture here would diff — for reasons that have nothing to do with drawing, in a
 *   file whose whole job is to make a drawing change visible.
 *
 * The two hand-written entries are hand-written on purpose: one is Square-1 in the
 * **pre-0.13 comma spelling**, which must keep drawing, and one is a Clock scramble
 * that ends **flipped**, which is the frame bit `draw/clock.ts` has to recover.
 */
export interface FixtureCase {
  readonly name: string;
  readonly event: WcaEventId;
  readonly scramble: string;
}

/** `corpusFor(event)[index]`, with a name for the fixture. */
function fromCorpus(name: string, event: WcaEventId, index = 0): FixtureCase {
  const scramble = corpusFor(event)[index];
  if (scramble === undefined) {
    throw new Error(`fixtures: ${event} has no corpus entry at ${index}`);
  }
  return { name, event, scramble };
}

export const FIXTURE_CASES: readonly FixtureCase[] = [
  fromCorpus('222', '222'),
  fromCorpus('333', '333'),
  fromCorpus('444', '444'),
  fromCorpus('555', '555'),
  fromCorpus('666', '666'),
  fromCorpus('777', '777'),
  fromCorpus('333bf', '333bf'),
  fromCorpus('444bf', '444bf'),
  fromCorpus('clock', 'clock'),
  {
    name: 'clock-flipped',
    event: 'clock',
    // Ends after the `y2` with no further dial token, so the left panel is the back —
    // the case a drawing that ignored the flip count would get wrong on every real
    // scramble, since an official Clock scramble contains exactly one `y2`.
    scramble: 'UR3+ DR2- DL1+ UL4- y2 ALL2+ U1-',
  },
  fromCorpus('pyram-a', 'pyram', 0),
  fromCorpus('pyram-b', 'pyram', 1),
  fromCorpus('skewb-a', 'skewb', 0),
  fromCorpus('skewb-b', 'skewb', 1),
  fromCorpus('minx-a', 'minx', 0),
  fromCorpus('minx-b', 'minx', 1),
  fromCorpus('sq1-a', 'sq1', 0),
  {
    name: 'sq1-old-spelling',
    event: 'sq1',
    // 🔴 The `0.12.0` comma spelling. It must keep drawing, because a scramble already
    // stored in a consumer's database was written this way.
    scramble: '(-3, -4) / (6, 3) / (-5, -2) / (-1, -1) /',
  },
  fromCorpus('fto-a', 'fto', 0),
  fromCorpus('fto-b', 'fto', 1),
];
