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
 * ## The four verdicts — three from the baseline document, one for an event it predates
 *
 * | verdict | meaning |
 * |---|---|
 * | `exact` | `band` **is** TNoodle's, to the token |
 * | `in-range` | `band` is wider, and the width is a property of the event rather than a defect — a suffix that is sometimes empty, a separator count that varies |
 * | `gap` | 🔴 `band` admits lengths TNoodle would never print. A **recorded defect**, named with the task that closes it — or, where the deviation was measured and deliberately **accepted**, with the decision that accepted it |
 * | `provisional` | there is **no official number to compare against yet** — `tnoodle` is `null`. The band is this package's own measured output, it names the stand-in it was compared with instead, and it names the task that replaces it with the official figure once one exists. Today only `fto`, which no TNoodle release scrambles |
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

type Verdict = 'exact' | 'in-range' | 'gap' | 'provisional';

interface EventBand {
  readonly event: WcaEventId;
  /**
   * TNoodle-WCA-1.2.3's own token count, as a range where its sheet varied —
   * or `null` for a `provisional` event the official program does not scramble yet.
   */
  readonly tnoodle: readonly [number, number] | null;
  /** What this package must produce. Inclusive at both ends. */
  readonly band: readonly [number, number];
  readonly verdict: Verdict;
  /** How many scrambles to draw. Budgeted — see the note on runtime above. */
  readonly draws: number;
  /**
   * The plan task that closes this deviation — or, where it was measured and
   * accepted rather than fixed, the decision that accepted it. Required on a
   * `gap`, absent otherwise. Either way the point is the same: a deviation must
   * name something, so that no band here is a number nobody owns.
   */
  readonly closedBy?: string;
  /** What the package actually emitted when the gap was recorded, so the size of the defect is not lost. */
  readonly measured?: string;
  /** What a `provisional` band was compared with in place of an official number. Required on `provisional`. */
  readonly reference?: string;
  /** Why a wider-than-TNoodle band is not a defect. Required on `in-range`. */
  readonly widthBecause?: string;
  /** Cube size, for the events whose notation `nxn` can parse. Absent for the six bespoke notations. */
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
  //
  // 🔴 **This gap is accepted, not outstanding.** Task 04 prototyped the sweep and
  // measured it over 30 states: trying up to 30 phase-1 solutions buys 1.3 moves
  // for at least 10x the time, up to 200 buys 2.1 for at least 73x — and even then
  // lands at 21.2, still outside TNoodle's 19-20. A 3x3x3 scramble is on the
  // consuming app's practice-timer hot path. These bands are therefore the number
  // this package intends to produce, and they are pinned so it cannot drift
  // further; see `docs/333-design.md` §8 rough edge 2 for the table.
  {
    event: '333',
    tnoodle: [19, 20],
    band: [19, 30],
    verdict: 'gap',
    draws: 3,
    size: 3,
    maxRedundant: 1,
    closedBy: 'wca_conformance_plan task 04 — closed 2026-08-13 as not worth doing; the gap is accepted',
    measured: '21–26 over 30 draws, mean 23.33 — phase 1 9.47, phase 2 13.87',
  },
  {
    event: '333oh',
    tnoodle: [16, 20],
    band: [16, 30],
    verdict: 'gap',
    draws: 3,
    size: 3,
    maxRedundant: 1,
    closedBy: 'wca_conformance_plan task 04 — closed 2026-08-13 as not worth doing; the gap is accepted',
    measured: '20–25 over 12 draws — the same solver as 333, with a wider TNoodle band to sit under',
  },
  {
    event: '333bf',
    tnoodle: [19, 22],
    band: [19, 32],
    verdict: 'gap',
    draws: 3,
    size: 3,
    maxRedundant: 1,
    closedBy: 'wca_conformance_plan task 04 — closed 2026-08-13 as not worth doing; the gap is accepted',
    measured: '23–26 over 12 draws — 333 plus a 0..2-token orientation suffix',
  },
  {
    event: '333mbf',
    tnoodle: [21, 23],
    band: [21, 32],
    verdict: 'gap',
    draws: 3,
    size: 3,
    maxRedundant: 1,
    closedBy: 'wca_conformance_plan task 04 — closed 2026-08-13 as not worth doing; the gap is accepted',
    measured: '22–26 over 12 draws — the same scramble as 333bf, drawn count times',
  },
  {
    event: '333fm',
    tnoodle: [24, 24],
    band: [24, 36],
    verdict: 'gap',
    draws: 3,
    size: 3,
    maxRedundant: 1,
    closedBy: 'wca_conformance_plan task 04 — closed 2026-08-13 as not worth doing; the gap is accepted',
    measured: '27–31 over 12 draws — the six wrapper tokens included, and correct',
  },
  // 🔴 The headline, and still a gap — but half what it was.
  //
  // `solve444` is reduction → parity passes → 3x3x3 hand-off.
  // `wca_conformance_plan` task 03 took the mean from 154 raw to ~100–120: it
  // cancelled across the phase joins, made the solver choose among several
  // equally-valid reductions of the same drawn state (the parity case is a
  // property of the **route**, not the state), took its gadgets shortest-first,
  // and gave the `permutation` case the two gadgets it provably needs in one pass.
  // `444_pairing_search_plan` task 01 then replaced the pairing's one-step greedy
  // with a search over the same library for the shortest total word — 46.7 → 30.3
  // moves on the pairing. A follow-up removed most of the parity work by choosing a
  // phase-1 route whose **wing parity is even**, which decides OLL parity for the
  // whole solve: **56–114, mean 73.8, median 69** over 30 states, with 23 of 30
  // needing no parity pass at all.
  //
  // 🔴 What is left is **accepted**, not outstanding. Centres (16.1) and the 3x3x3
  // hand-off (23.3) already sum to 39.4 — inside TNoodle's budget for a whole
  // scramble — so the entire gap is reduction overhead, and that follows from a
  // structural fact: every move that can pair a wing unsolves the centres, so the
  // pairing must run over centre-neutral *sequences* of about seven moves where a
  // human's slice-flip-slice runs four.
  //
  // `444_pairing_search_plan` task 02 measured the way out and closed it: the
  // 96,909,120-entry six-wing coordinate does build — 23.1 s under a verified
  // 24-fold symmetry reduction, against the design doc's "minutes to hours" — and
  // is useless, reading 6.7 on real states where the pairing spends 29.9. A 380x
  // larger table than the one already here buys +1.3 on the bound. Closing this
  // needs a different reduction architecture, which is not scheduled.
  // See `docs/444-design.md` §8.
  //
  // The ceiling is derived, not sampled: 119 was the worst of 26, and the room
  // above it is one failed doubled parity pass — a 0.8% event on the states that
  // land `permutation`.
  {
    event: '444',
    tnoodle: [42, 46],
    band: [42, 170],
    verdict: 'gap',
    draws: 2,
    size: 4,
    maxRedundant: 0,
    closedBy: 'cubesmith-scrambler-plans 444_pairing_search_plan — closed 2026-08-13, the gap is accepted',
    measured: '56–114 over 30 draws, mean 73.8, median 69 (was 94–205 mean 137.5, then 74–172, then 59–119)',
  },
  {
    event: '444bf',
    tnoodle: [42, 46],
    band: [42, 175],
    verdict: 'gap',
    draws: 2,
    size: 4,
    maxRedundant: 0,
    closedBy: 'cubesmith-scrambler-plans 444_pairing_search_plan — closed 2026-08-13, the gap is accepted',
    measured: 'the same solver plus a whole-cube rotation, so 444 + 0..2 tokens',
  },

  // ── Provisional: no official reference exists yet. ─────────────────────────
  // FTO is official from 2027-01-02 and no TNoodle release scrambles it, so there
  // is no sheet to read a number off. The band is this package's own output:
  // 29–44 over 1,000 seeded states (median 39, p99 43), measured 2026-10-21 and
  // split 8.1 + 11.9 + 19.1 across the three phases before cancellation.
  //
  // The ceiling is derived, not sampled: phase 3 is at most 29 (the deepest
  // layer of its exact table), phases 1 and 2 never exceeded 10 and 14, and
  // cancellation only shortens — 53, plus two for a tail on the two searched
  // phases. The floor is sampled, and wide of it: nothing below 29 in 1,000.
  {
    event: 'fto',
    tnoodle: null,
    band: [20, 55],
    verdict: 'provisional',
    draws: 3,
    // 🔴 Measured against the stand-in on 2026-10-21, and the gap is real: cubing.js's
    // scrambler (xyzzy's solver) prints ~12 fewer moves for the same kind of state.
    // Both are random-state and both are correct — `fto/interop.test.ts` proves the two
    // puzzles identical turn for turn — so this is length, not validity. See
    // `docs/fto-design.md` §8.
    reference:
      'cubing.js 0.63.3 randomScrambleForEvent("fto"): 23–29 moves, median 27, over 40 scrambles — ~12 shorter than this package',
    closedBy: 'cubesmith-scrambler-plans fto_event_plan task 10 — re-baselined against the official program once it scrambles FTO',
    measured: '29–44 over 1,000 seeded states, median 39, mean 39.08, p99 43',
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
  // only raises `testTimeout`. Every draw for all eighteen events happens here,
  // and the 4x4x4 pair alone is minutes under coverage.
}, 900_000);

describe('the band table itself', () => {
  it('covers every implemented event, and claims no event that is not', () => {
    expect([...BANDS].map((entry) => entry.event).sort()).toEqual([...implementedEvents()].sort());
  });

  it('gives an `exact` verdict exactly when the band is TNoodle\'s own', () => {
    for (const entry of BANDS) {
      const identical =
        entry.tnoodle !== null &&
        entry.band[0] === entry.tnoodle[0] &&
        entry.band[1] === entry.tnoodle[1];
      expect(identical, `${entry.event} is ${entry.verdict}`).toBe(entry.verdict === 'exact');
    }
  });

  it('makes an `in-range` band overlap TNoodle\'s, and say why it is wider', () => {
    for (const entry of BANDS.filter((band) => band.verdict === 'in-range')) {
      const tnoodle = entry.tnoodle!;
      expect(entry.band[0], entry.event).toBeLessThanOrEqual(tnoodle[1]);
      expect(entry.band[1], entry.event).toBeGreaterThanOrEqual(tnoodle[0]);
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
      const tnoodle = entry.tnoodle!;
      expect(
        entry.band[1],
        `${entry.event} no longer admits anything TNoodle would not print — promote it to 'exact'/'in-range' and drop closedBy`,
      ).toBeGreaterThan(tnoodle[1]);
      expect(entry.closedBy, entry.event).toBeTruthy();
      expect(entry.measured, `${entry.event} must record what it actually emitted`).toBeTruthy();
      // The floor stays TNoodle's own, so the fix passes without editing anything.
      expect(entry.band[0], entry.event).toBeLessThanOrEqual(tnoodle[0]);
    }
  });

  /**
   * A `provisional` band has nothing official to sit under, so it must say what
   * it was compared with instead and which task replaces it — and only an event
   * with no official number may be provisional at all.
   */
  it('lets an event be provisional only while there is no official number, and names its way out', () => {
    for (const entry of BANDS) {
      expect(entry.tnoodle === null, entry.event).toBe(entry.verdict === 'provisional');
    }
    for (const entry of BANDS.filter((band) => band.verdict === 'provisional')) {
      expect(entry.reference, entry.event).toBeTruthy();
      expect(entry.closedBy, entry.event).toBeTruthy();
      expect(entry.measured, entry.event).toBeTruthy();
    }
  });
});

describe('the emitted scramble length', () => {
  for (const entry of BANDS) {
    const official =
      entry.tnoodle === null ? 'no official number yet' : `TNoodle ${entry.tnoodle[0]}..${entry.tnoodle[1]}`;
    it(`${entry.event} lands in ${entry.band[0]}..${entry.band[1]} (${official})`, () => {
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
