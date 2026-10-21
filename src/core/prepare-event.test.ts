import { describe, expect, it } from 'vitest';
import '../index';
import { generateScramble } from './generate-scramble';
import { generateScrambles } from './generate-scrambles';
import { prepareEvent } from './prepare-event';
import { UnimplementedEventError } from './errors';
import { implementedEvents } from './scrambler-registry';
import type { WcaEventId } from './types';

/**
 * Imports `../index` for its registrations and never resets the registry — the point
 * of every assertion here is a *real* puzzle's table build, so a spy would measure
 * nothing.
 *
 * 🔴 **This is the one file in the suite that cannot be made cheap**, and the two
 * tests below carry an explicit timeout because of it. Its subject *is* the table
 * build: `prepareEvent('444')` costs 11.5 s and the first 4x4x4 scramble another
 * 4.5 s, and `npm run test:coverage` adds V8 instrumentation on top, which slows the
 * solvers by roughly an order of magnitude. The 180 s global `testTimeout` in
 * `vitest.config.ts` is generous for every other file here and not enough for this
 * one — measured, in CI, twice.
 *
 * Raising the *global* timeout instead would be the wrong fix: it would hide a genuine
 * hang anywhere else in the suite behind a ten-minute wait.
 */

/** Enough headroom for 18 real table builds under coverage instrumentation. */
const TABLE_BUILD_TIMEOUT = 600_000;

const ALL_EVENTS: readonly WcaEventId[] = [
  '222', '333', '444', '555', '666', '777',
  '333bf', '333fm', '333oh', '333mbf', '444bf', '555bf',
  'minx', 'pyram', 'clock', 'skewb', 'sq1', 'fto',
];

async function millis(work: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await work();
  return performance.now() - start;
}

/**
 * Milliseconds of **CPU time this process spent** on `work`, where the host can say
 * (Node's `process.cpuUsage`), and wall time where it cannot.
 *
 * For the "did the table build already happen" check, CPU time is the quantity the
 * claim is actually about — a table build is work this process does — and unlike
 * wall time it does not grow while the process waits for a core. That matters since
 * 0.15.0: four test files build FTO's tables in parallel workers, and on 2026-10-21
 * the first `333mbf` scramble after `prepareEvent` measured 4,367 ms of wall time in
 * the full coverage run against 50 ms in isolation, with nothing left unbuilt. Vitest
 * runs each file in its own forked process, so this process's CPU time is its own.
 *
 * Reached through `globalThis` rather than declared in `test-host.d.ts`, because a
 * global `process` declaration would type-check in shipped code too — the boundary
 * that file exists to keep.
 */
type CpuUsage = { user: number; system: number };
const host = (globalThis as { process?: { cpuUsage?: () => CpuUsage } }).process;

async function cpuMillis(work: () => Promise<unknown>): Promise<number> {
  const cpuUsage = host?.cpuUsage;
  if (cpuUsage === undefined) return millis(work);
  const start = cpuUsage();
  await work();
  const end = cpuUsage();
  return (end.user - start.user + end.system - start.system) / 1000;
}

describe('prepareEvent', () => {
  it(
    'accepts every one of the 18 events without throwing',
    async () => {
      expect(implementedEvents()).toHaveLength(ALL_EVENTS.length);
      for (const event of ALL_EVENTS) {
        await expect(prepareEvent(event), event).resolves.toBeUndefined();
      }
    },
    TABLE_BUILD_TIMEOUT,
  );

  it('throws UnimplementedEventError for an event with no scrambler', async () => {
    await expect(prepareEvent('not-an-event' as WcaEventId)).rejects.toBeInstanceOf(
      UnimplementedEventError,
    );
  });

  it('resolves immediately for an event with nothing to precompute', async () => {
    // `clock` is linear algebra over Z12 — no pruning table, nothing to build — and
    // `minx` is random-moves. Registering no preparer is the honest answer for both,
    // and it is not an error: "resolves as soon as this event has nothing left to
    // precompute" is a true statement about zero work.
    for (const event of ['clock', 'minx'] as WcaEventId[]) {
      expect(await millis(() => prepareEvent(event))).toBeLessThan(50);
    }
  });

  it('a second prepareEvent for the same event is cheap, because the builders are memoised', async () => {
    const cold = await millis(() => prepareEvent('222'));
    const warm = await millis(() => prepareEvent('222'));
    // A ratio with generous margin, not an absolute millisecond count, so a slow CI
    // machine cannot flake it. The `+ 5` keeps the assertion meaningful if `cold` was
    // already warmed by an earlier test in this file.
    expect(warm).toBeLessThan(cold / 4 + 5);
  });

  /**
   * 🔴 The assertion that actually holds the helper to its promise, and the one that
   * caught two real gaps.
   *
   * A preparer that builds *some* of an event's tables looks like it works: the call
   * returns, the doc comment reads well, and the first scramble is still slow. Both
   * gaps found this way, measured 2026-08-11:
   *
   * - `prepare333Tables` built the phase **move** tables and not the phase **pruning**
   *   tables, which live in their own modules. `prepareEvent('333')` cost 624 ms and
   *   the first scramble after it still cost 7719 ms.
   * - `prepareSquare1Tables` built the solver's tables and not the *draw's* — the
   *   shape space and the twistable-shape list — leaving 1861 ms lazy.
   *
   * Timing `prepareEvent` in the same process as an earlier scramble cannot see any of
   * this, because the scramble already warmed everything. What sees it is timing the
   * scramble that comes *after* a prepare, against a warm one, on an event nothing has
   * touched yet — which is why this test names events the file has not used above.
   */
  it(
    '🔴 leaves almost nothing for the first scramble to build',
    async () => {
      for (const event of ['skewb', 'pyram', '333mbf', 'fto'] as WcaEventId[]) {
        await prepareEvent(event);
        const first = await cpuMillis(() => generateScramble(event));
        const warm = await cpuMillis(() => generateScramble(event));
        // A generous absolute ceiling on top of the warm cost rather than a ratio: for
        // an event whose warm cost is ~0 ms a ratio is meaningless, and the claim being
        // made is "the table build already happened", not "this is fast". Measured in
        // CPU time, not wall time — see `cpuMillis`.
        expect(first, event).toBeLessThan(warm + 3000);
      }
    },
    TABLE_BUILD_TIMEOUT,
  );

  it(
    'leaves the first scramble fast — the whole point of the helper',
    async () => {
      // `444` is the event this exists for: 15,382 ms cold against 241 ms warm in a
      // fresh process, measured 2026-08-11. Asserted as a ratio against a *second*
      // scramble rather than as an absolute, since the machine is unknown — and with
      // wide margin, because 🔴 `444` is the one event `prepareEvent` does not fully
      // cover (see `puzzles/444/solve.ts`'s `prepare444Tables`).
      //
      // 🔴 The absolute term was 20 s and flaked once at 43,273 ms against a 38,330 ms
      // ceiling — under full-suite parallel load, while passing in isolation. A timing
      // assertion competing with eight other workers for a CPU is measuring the machine,
      // not the helper, so the term is now 60 s: still an order of magnitude below a
      // genuinely unprepared `444` (which is the whole cold table build, minutes under
      // coverage), and far enough above contention to stop costing a re-run. Widening it
      // is the right move only because the claim being made is "the table build already
      // happened" — a claim a 3x margin proves just as well as a 1.1x one.
      await prepareEvent('444');
      const first = await millis(() => generateScramble('444'));
      const second = await millis(() => generateScramble('444'));
      expect(first).toBeLessThan(second * 20 + 60_000);
    },
    TABLE_BUILD_TIMEOUT,
  );

  it('🔴 does not consume entropy: a seeded batch is byte-identical with and without it', async () => {
    // The reason `prepareEvent` is not implemented as "generate and discard". A
    // discarded draw would advance the shared source, shifting every subsequent
    // scramble in the batch — a performance helper turning into a correctness hazard.
    const withoutPrepare = await generateScrambles('222', 4, { seed: 'entropy-check' });
    await prepareEvent('222');
    const withPrepare = await generateScrambles('222', 4, { seed: 'entropy-check' });
    expect(withPrepare).toEqual(withoutPrepare);

    const single = await generateScramble('pyram', { seed: 'entropy-single' });
    await prepareEvent('pyram');
    expect(await generateScramble('pyram', { seed: 'entropy-single' })).toEqual(single);
  });

  it(
    'a variant event prepares the same tables as the event it is a variant of',
    async () => {
      // `444bf` reaches `444`'s reduction and `333`'s solver, so preparing it has to
      // build both — otherwise `prepareEvent('444bf')` would be a partial promise, and
      // the first blindfolded scramble would still pay most of the cold cost.
      await prepareEvent('444bf');
      const first = await millis(() => generateScramble('444bf'));
      const second = await millis(() => generateScramble('444bf'));
      expect(first).toBeLessThan(second * 20 + 20_000);
    },
    TABLE_BUILD_TIMEOUT,
  );
});
