import { beforeAll, describe, expect, it } from 'vitest';
import { generateScramble, prepareEvent } from '../index';
import { implementedEvents } from './scrambler-registry';
import type { WcaEventId } from './types';
import { isRedundantMove } from '../puzzles/nxn/random-moves';
import { parseScrambleToken, type WideMove } from '../puzzles/nxn/notation';
import { FEWEST_MOVES_PREFIX, FEWEST_MOVES_SUFFIX } from '../puzzles/333/fewest-moves';

/**
 * **The per-event output-shape gate.** How long is the string this package
 * finally emits, and does it look like the one a delegate would get?
 *
 * Nothing in this package bounded that until now, and the absence is exactly why
 * a **156-move `444`** reached a printed scramble sheet in the CubeManager app
 * (2026-08-12). The 4x4x4 suite is thorough about its *parts* — `phase1.test.ts`
 * bounds a phase-1 solution under 12, `generators.test.ts` caps the library at
 * 10,000 — and none of that says anything about the length of the scramble a
 * competitor is handed.
 *
 * ## Where the numbers come from
 *
 * `tnoodle` is read off `Scrambles for 2026-08-12 - All Scrambles.pdf`, generated
 * by **TNoodle-WCA-1.2.3**: 17 event sheets, 5 scrambles plus 2 extras each (FMC
 * 3 attempts, MBLD 3 x 35). The full table and how it was produced are in
 * `cubesmith-scrambler-plans/plans/wca_conformance_plan/00-tnoodle-baseline.md`
 * §2. Nothing here is recalled — an earlier draft of that table *was*, and it
 * guessed `clock` at 1 token and `sq1` at 30, both wrong.
 *
 * ## The three verdicts, which are the baseline document's own
 *
 * | verdict | meaning |
 * |---|---|
 * | `exact` | `band` **is** TNoodle's, to the token |
 * | `in-range` | `band` is wider, and the width is a property of the event rather than a defect — a suffix that is sometimes empty, a separator count that varies |
 * | `gap` | 🔴 `band` admits lengths TNoodle would never print. A **recorded defect**, named with the task that closes it |
 *
 * 🔴 **A `gap` band is a record of the defect, not a gate.** Widening a band to
 * make a suite pass is how this shipped in the first place, so the deviating
 * events are pinned instead: their *floor* is TNoodle's own, so a fix passes
 * without editing anything, and `every recorded gap is still a gap` below fails
 * the moment a band is tightened onto TNoodle's without the `gap` being removed.
 * The pin deletes itself.
 *
 * ## Ceilings are derived, not sampled
 *
 * A gate that fails once a month on a tail draw gets deleted by the next person,
 * so no ceiling here is "the largest length I happened to see". Where the solver
 * has a structural bound the ceiling is that bound (a 3x3x3 two-phase solution
 * cannot exceed 12 + 18); where it does not, the ceiling is stated with its
 * reasoning on the entry.
 *
 * ## Runtime
 *
 * `444` costs seconds a scramble and this suite runs under `--coverage`, where
 * the solvers are roughly an order of magnitude slower again. So `draws` is
 * budgeted per event — two for the 4x4x4 pair, three for the 3x3x3 family and
 * Square-1, six for the events that cost nothing — and `prepareEvent` is called
 * once per event rather than letting the first draw pay for the tables.
 */

type Verdict = 'exact' | 'in-range' | 'gap';

interface EventBand {
  readonly event: WcaEventId;
  /** TNoodle-WCA-1.2.3's own token count, as a range where its sheet varied. */
  readonly tnoodle: readonly [number, number];
  /** What this package must produce. Inclusive at both ends. */
  readonly band: readonly [number, number];
  readonly verdict: Verdict;
  /** How many scrambles to draw. Budgeted — see the note on runtime above. */
  readonly draws: number;
  /** The plan task that closes this deviation. Required on a `gap`, absent otherwise. */
  readonly closedBy?: string;
  /** What the package actually emitted when the gap was recorded, so the size of the defect is not lost. */
  readonly measured?: string;
  /** Why a wider-than-TNoodle band is not a defect. Required on `in-range`. */
  readonly widthBecause?: string;
  /** Cube size, for the events whose notation `nxn` can parse. Absent for the five bespoke notations. */
  readonly size?: number;
  /**
   * How many **redundant** moves the scramble may contain — see
   * `puzzles/nxn/random-moves.ts` for the rule, which is the package's own and is
   * stronger than "no two consecutive tokens on the same face": within a run of
   * moves on one axis, no layer set may repeat, because same-axis moves commute
   * and could be brought together and merged. Zero everywhere it should be.
   */
  readonly maxRedundant?: number;
}

const BANDS: readonly EventBand[] = [
  // ── Nine events that already match. Do not "improve" these. ────────────────
  { event: '222', tnoodle: [11, 11], band: [11, 11], verdict: 'exact', draws: 6, size: 2, maxRedundant: 0 },
  { event: 'skewb', tnoodle: [11, 11], band: [11, 11], verdict: 'exact', draws: 6 },
  { event: 'minx', tnoodle: [77, 77], band: [77, 77], verdict: 'exact', draws: 6 },
  { event: '555', tnoodle: [60, 60], band: [60, 60], verdict: 'exact', draws: 6, size: 5, maxRedundant: 0 },
  { event: '666', tnoodle: [80, 80], band: [80, 80], verdict: 'exact', draws: 6, size: 6, maxRedundant: 0 },
  { event: '777', tnoodle: [100, 100], band: [100, 100], verdict: 'exact', draws: 6, size: 7, maxRedundant: 0 },
  // TNoodle's own sheet ranges 11–15: eleven Pyraminx turns plus zero to four
  // tips, and a tip that is already correct contributes no token.
  { event: 'pyram', tnoodle: [11, 15], band: [11, 15], verdict: 'exact', draws: 6 },
  {
    event: '555bf',
    tnoodle: [61, 61],
    band: [60, 62],
    verdict: 'in-range',
    draws: 6,
    size: 5,
    maxRedundant: 0,
    widthBecause:
      "the 4b3a orientation suffix is one or two wide moves, and one of the 24 orientations is the identity and contributes none — so 555's fixed 60 becomes 60..62",
  },
  {
    event: 'sq1',
    tnoodle: [23, 23],
    band: [18, 32],
    verdict: 'in-range',
    draws: 3,
    widthBecause:
      'a Square-1 scramble is turn pairs interleaved with slices, and how many slices the solution needs is not fixed — TNoodle prints 12 pairs and 11 separators on the sheet read, this package 22..28 across 18 draws',
  },

  // Closed 2026-08-12 by task 02, and this row is what closing it looks like:
  // the band tightened onto TNoodle's own number and the `gap` removed. Until
  // then the package appended bare pin names (`… ALL5+ DL UL`) describing the
  // final pins-up state, which made the count vary 15..19 and made the string
  // differ from the official one *in kind* rather than in length.
  { event: 'clock', tnoodle: [15, 15], band: [15, 15], verdict: 'exact', draws: 6 },

  // ── 🔴 Recorded gaps. Each names the task that closes it. ──────────────────
  // The 3x3x3 family, all five reaching the same two-phase solver. +3 to +5
  // moves: the solver takes the *first* phase-1 solution and solves phase 2 from
  // wherever that lands, rather than trying several phase-1 solutions and keeping
  // the best total. Ceilings are the structural bound — phase 1 is optimal within
  // 12 and phase 2 within 18 — not a sampled maximum.
  {
    event: '333',
    tnoodle: [19, 20],
    band: [19, 30],
    verdict: 'gap',
    draws: 3,
    size: 3,
    maxRedundant: 1,
    closedBy: 'wca_conformance_plan task 04',
    measured: '21–25 over 12 draws',
  },
  {
    event: '333oh',
    tnoodle: [16, 20],
    band: [16, 30],
    verdict: 'gap',
    draws: 3,
    size: 3,
    maxRedundant: 1,
    closedBy: 'wca_conformance_plan task 04',
    measured: '20–25 over 12 draws',
  },
  {
    event: '333bf',
    tnoodle: [19, 22],
    band: [19, 32],
    verdict: 'gap',
    draws: 3,
    size: 3,
    maxRedundant: 1,
    closedBy: 'wca_conformance_plan task 04',
    measured: '23–26 over 12 draws',
  },
  {
    event: '333mbf',
    tnoodle: [21, 23],
    band: [21, 32],
    verdict: 'gap',
    draws: 3,
    size: 3,
    maxRedundant: 1,
    closedBy: 'wca_conformance_plan task 04',
    measured: '22–26 over 12 draws',
  },
  {
    event: '333fm',
    tnoodle: [24, 24],
    band: [24, 36],
    verdict: 'gap',
    draws: 3,
    size: 3,
    maxRedundant: 1,
    closedBy: 'wca_conformance_plan task 04',
    measured: '27–31 over 12 draws (the six wrapper tokens included, and correct)',
  },
  // 🔴 The headline. `solve444` is reduction → parity passes → 3x3x3 hand-off,
  // and the parity loop is the dominant term: measured over 8 states, centres
  // 16.4 moves, pairing 51.6, **parity 96.5**, hand-off 22.8. A pass costs a
  // ~20-move gadget plus a whole fresh pairing, and 1.75 passes were needed on
  // average. The ceiling is not a sampled maximum: 205 was the worst of 8 draws
  // and 260 leaves room for one further parity pass, which is enough to catch a
  // regression without failing on a tail draw. The real gate on this event is
  // the floor and `closedBy`.
  {
    event: '444',
    tnoodle: [42, 46],
    band: [42, 260],
    verdict: 'gap',
    draws: 2,
    size: 4,
    maxRedundant: 20,
    closedBy: 'wca_conformance_plan task 03',
    measured: '94–205 over 8 draws, mean 137.5',
  },
  {
    event: '444bf',
    tnoodle: [42, 46],
    band: [42, 265],
    verdict: 'gap',
    draws: 2,
    size: 4,
    maxRedundant: 22,
    closedBy: 'wca_conformance_plan task 03',
    measured: '87–212 over 8 draws, mean 145.5 — the same solver plus a whole-cube rotation',
  },
];

function tokensOf(scramble: string): string[] {
  const trimmed = scramble.trim();
  return trimmed.length === 0 ? [] : trimmed.split(/\s+/);
}

/** How many tokens are redundant given everything before them. See `isRedundantMove`. */
function redundantCount(scramble: string, size: number): number {
  const history: WideMove[] = [];
  let redundant = 0;
  for (const token of tokensOf(scramble)) {
    const move = parseScrambleToken(token, size);
    if (isRedundantMove(history, move)) redundant += 1;
    history.push(move);
  }
  return redundant;
}

const drawn = new Map<WcaEventId, string[]>();

beforeAll(async () => {
  for (const entry of BANDS) {
    // Once per event, so the table build is not charged to the first draw —
    // which for `444` is the difference between 15 s and 4 s.
    await prepareEvent(entry.event);
    const scrambles: string[] = [];
    for (let draw = 0; draw < entry.draws; draw += 1) {
      const result = await generateScramble(entry.event);
      scrambles.push(result.moves);
    }
    drawn.set(entry.event, scrambles);
  }
  // An explicit timeout, because `hookTimeout` is 10 s and `vitest.config.ts`
  // only raises `testTimeout`. Every draw for all seventeen events happens here,
  // and the 4x4x4 pair alone is minutes under coverage.
}, 900_000);

describe('the band table itself', () => {
  it('covers every implemented event, and claims no event that is not', () => {
    expect([...BANDS].map((entry) => entry.event).sort()).toEqual([...implementedEvents()].sort());
  });

  it('gives an `exact` verdict exactly when the band is TNoodle\'s own', () => {
    for (const entry of BANDS) {
      const identical = entry.band[0] === entry.tnoodle[0] && entry.band[1] === entry.tnoodle[1];
      expect(identical, `${entry.event} is ${entry.verdict}`).toBe(entry.verdict === 'exact');
    }
  });

  it('makes an `in-range` band overlap TNoodle\'s, and say why it is wider', () => {
    for (const entry of BANDS.filter((band) => band.verdict === 'in-range')) {
      expect(entry.band[0], entry.event).toBeLessThanOrEqual(entry.tnoodle[1]);
      expect(entry.band[1], entry.event).toBeGreaterThanOrEqual(entry.tnoodle[0]);
      expect(entry.widthBecause, entry.event).toBeTruthy();
      expect(entry.closedBy, `${entry.event} is not a defect and must name no task`).toBeUndefined();
    }
  });

  /**
   * 🔴 The pin's self-destruct. A gap entry must admit lengths TNoodle would
   * never print — that is what makes it a *record* rather than a gate. Tighten a
   * band onto TNoodle's without removing its `gap`, and this fails and says so.
   */
  it('keeps every recorded gap a real gap, named with the task that closes it', () => {
    for (const entry of BANDS.filter((band) => band.verdict === 'gap')) {
      expect(
        entry.band[1],
        `${entry.event} no longer admits anything TNoodle would not print — promote it to 'exact'/'in-range' and drop closedBy`,
      ).toBeGreaterThan(entry.tnoodle[1]);
      expect(entry.closedBy, entry.event).toBeTruthy();
      expect(entry.measured, `${entry.event} must record what it actually emitted`).toBeTruthy();
      // The floor stays TNoodle's own, so the fix passes without editing anything.
      expect(entry.band[0], entry.event).toBeLessThanOrEqual(entry.tnoodle[0]);
    }
  });
});

describe('the emitted scramble length', () => {
  for (const entry of BANDS) {
    it(`${entry.event} lands in ${entry.band[0]}..${entry.band[1]} (TNoodle ${entry.tnoodle[0]}..${entry.tnoodle[1]})`, () => {
      const scrambles = drawn.get(entry.event)!;
      expect(scrambles).toHaveLength(entry.draws);
      for (const scramble of scrambles) {
        const count = tokensOf(scramble).length;
        expect(count, `${entry.event}: ${scramble}`).toBeGreaterThanOrEqual(entry.band[0]);
        expect(count, `${entry.event}: ${scramble}`).toBeLessThanOrEqual(entry.band[1]);
      }
    });
  }
});

/**
 * The shape invariants the baseline found, which are the same class of bug as
 * the length: a string that differs *in kind* from the official one.
 */
describe('the emitted scramble shape', () => {
  it('wraps every 333fm scramble in R\' U\' F at both ends', () => {
    for (const scramble of drawn.get('333fm')!) {
      expect(scramble.startsWith(`${FEWEST_MOVES_PREFIX} `)).toBe(true);
      expect(scramble.endsWith(` ${FEWEST_MOVES_SUFFIX}`)).toBe(true);
    }
  });

  /**
   * A clock scramble is the fourteen-amount template with `y2` in its place,
   * and **nothing after it**. It used to append bare pin names describing the
   * final pins-up state; TNoodle-WCA-1.2.3 does not, and since task 02 neither
   * does this. The parser still accepts the old form — see
   * `puzzles/clock/solve.test.ts`, which is where that is proved.
   */
  it('emits the clock template and stops on the second ALLn±', () => {
    for (const scramble of drawn.get('clock')!) {
      expect(scramble).toMatch(
        /^UR\d[+-] DR\d[+-] DL\d[+-] UL\d[+-] U\d[+-] R\d[+-] D\d[+-] L\d[+-] ALL\d[+-] y2 U\d[+-] R\d[+-] D\d[+-] L\d[+-] ALL\d[+-]$/,
      );
    }
  });

  for (const entry of BANDS.filter((band) => band.size !== undefined)) {
    it(`${entry.event} contains at most ${entry.maxRedundant} redundant move${entry.maxRedundant === 1 ? '' : 's'}`, () => {
      for (const scramble of drawn.get(entry.event)!) {
        expect(redundantCount(scramble, entry.size!), scramble).toBeLessThanOrEqual(
          entry.maxRedundant!,
        );
      }
    });
  }

  /**
   * 🔴 The redundancy allowances above are pinned the same way the bands are: a
   * non-zero one is a defect with an owner, not a tolerance. The 3x3x3 family's
   * single allowed redundancy is the seam between phase 1 and phase 2 — each
   * search prunes a repeated face inside its own path and neither looks across
   * the join — and the 4x4x4's twenty is `solve.ts` concatenating each phase's
   * sub-solution with no merge at all.
   */
  it('allows a redundant move only where a task owns it', () => {
    for (const entry of BANDS.filter((band) => (band.maxRedundant ?? 0) > 0)) {
      expect(entry.closedBy, `${entry.event} tolerates redundancy with no task to fix it`).toBeTruthy();
    }
  });
});
