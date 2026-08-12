import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateScramble } from './generate-scramble';
import { generateScrambles } from './generate-scrambles';
import { InvalidScrambleCountError, UnimplementedEventError } from './errors';
import {
  _resetRegistryForTests,
  registerMultiScrambler,
  registerScrambler,
} from './scrambler-registry';
import { MAX_BATCH_COUNT, MAX_SCRAMBLE_COUNT, type WcaEventId } from './types';
import { register222Scrambler } from '../puzzles/222/solve';

/**
 * Registers a spy scrambler so the assertions that are really about the *loop* —
 * how many draws happen, in what order, and whether a throw from `onProgress`
 * stops them — do not have to solve a real puzzle 500 times.
 *
 * The real events are exercised in the seed-trap and `333mbf` sections below,
 * where the puzzle actually matters.
 */
function registerSpy(event: WcaEventId, multi = false): { draws: number } {
  const record = { draws: 0 };
  const scramble = (random: { nextUint32(): number }): string => {
    record.draws += 1;
    return `draw-${record.draws}-${random.nextUint32()}`;
  };
  if (multi) registerMultiScrambler(event, scramble);
  else registerScrambler(event, scramble);
  return record;
}

describe('generateScrambles validation', () => {
  it('throws UnimplementedEventError before doing any work', async () => {
    _resetRegistryForTests();
    await expect(generateScrambles('333', 5)).rejects.toBeInstanceOf(UnimplementedEventError);
  });

  it('rejects a count that is not an integer in 1..MAX_BATCH_COUNT', async () => {
    _resetRegistryForTests();
    registerSpy('333');
    for (const bad of [0, 1.5, -1, MAX_BATCH_COUNT + 1]) {
      await expect(generateScrambles('333', bad), String(bad)).rejects.toBeInstanceOf(
        InvalidScrambleCountError,
      );
    }
  });

  it('accepts the boundaries 1 and MAX_BATCH_COUNT', async () => {
    _resetRegistryForTests();
    const spy = registerSpy('333');
    expect(await generateScrambles('333', 1)).toHaveLength(1);
    expect(await generateScrambles('333', MAX_BATCH_COUNT)).toHaveLength(MAX_BATCH_COUNT);
    expect(spy.draws).toBe(1 + MAX_BATCH_COUNT);
  });

  it('states MAX_BATCH_COUNT as its own number, not MAX_SCRAMBLE_COUNT', () => {
    // Deliberately different: one bounds a batch, the other bounds cubes per
    // multi-blind attempt. Reusing one for both would cap `555` (about 1 ms a
    // scramble) at the same 100 as `444bf` (833 ms warm).
    expect(MAX_BATCH_COUNT).toBe(500);
    expect(MAX_BATCH_COUNT).not.toBe(MAX_SCRAMBLE_COUNT);
  });
});

describe('generateScrambles order and progress', () => {
  beforeEach(() => {
    _resetRegistryForTests();
  });

  it('returns the draws in draw order, which is part of the contract', async () => {
    registerSpy('333');
    const results = await generateScrambles('333', 4);
    expect(results.map((r) => r.moves.split('-')[1])).toEqual(['1', '2', '3', '4']);
  });

  it('calls onProgress exactly count times, as (1,n) … (n,n), never before the first draw', async () => {
    const spy = registerSpy('333');
    const calls: [number, number, number][] = [];
    await generateScrambles('333', 3, {
      onProgress: (done, total) => {
        calls.push([done, total, spy.draws]);
      },
    });
    expect(calls).toEqual([
      [1, 3, 1],
      [2, 3, 2],
      [3, 3, 3],
    ]);
  });

  it('awaits onProgress, so a promise it returns is a real seam', async () => {
    registerSpy('333');
    const order: string[] = [];
    await generateScrambles('333', 2, {
      onProgress: async (done) => {
        order.push(`before-${done}`);
        await Promise.resolve();
        order.push(`after-${done}`);
      },
    });
    expect(order).toEqual(['before-1', 'after-1', 'before-2', 'after-2']);
  });

  it('🔴 propagates a throw from onProgress AND stops further draws', async () => {
    const spy = registerSpy('333');
    const onProgress = vi.fn((done: number) => {
      if (done === 2) throw new Error('cancelled');
    });
    await expect(generateScrambles('333', 10, { onProgress })).rejects.toThrow('cancelled');
    // Two draws happened, not ten: the throw is the caller's cancel path, which is
    // why no `AbortSignal` (and no DOM type) is needed.
    expect(spy.draws).toBe(2);
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('propagates a rejected promise from onProgress the same way', async () => {
    const spy = registerSpy('333');
    await expect(
      generateScrambles('333', 10, {
        onProgress: (done) => (done === 3 ? Promise.reject(new Error('nope')) : undefined),
      }),
    ).rejects.toThrow('nope');
    expect(spy.draws).toBe(3);
  });
});

describe('generateScrambles cubesPerAttempt', () => {
  beforeEach(() => {
    _resetRegistryForTests();
  });

  it('shapes each of the count results for a multi-scramble event', async () => {
    registerSpy('333mbf', true);
    const results = await generateScrambles('333mbf', 4, { cubesPerAttempt: 3 });
    expect(results).toHaveLength(4);
    for (const result of results) {
      expect(result.scrambles).toHaveLength(3);
      expect(result.moves).toBe(result.scrambles![0]);
    }
  });

  it('defaults to one cube per attempt', async () => {
    registerSpy('333mbf', true);
    const results = await generateScrambles('333mbf', 2);
    expect(results.every((r) => r.scrambles?.length === 1)).toBe(true);
  });

  it('🔴 throws for an event that is not multi-scramble, rather than ignoring it', async () => {
    registerSpy('333');
    await expect(generateScrambles('333', 2, { cubesPerAttempt: 3 })).rejects.toBeInstanceOf(
      InvalidScrambleCountError,
    );
  });

  it('validates cubesPerAttempt against MAX_SCRAMBLE_COUNT, not MAX_BATCH_COUNT', async () => {
    registerSpy('333mbf', true);
    await expect(
      generateScrambles('333mbf', 1, { cubesPerAttempt: MAX_SCRAMBLE_COUNT + 1 }),
    ).rejects.toBeInstanceOf(InvalidScrambleCountError);
    await expect(
      generateScrambles('333mbf', 1, { cubesPerAttempt: MAX_SCRAMBLE_COUNT }),
    ).resolves.toHaveLength(1);
  });
});

/**
 * 🔴 The bug this whole function exists to close, as a regression test.
 *
 * `generateScramble` creates its `RandomSource` from the seed on every call, so a
 * caller-side loop over it returns the *same* scramble N times. That is measured in
 * `00-audit-0.12.0.md` §4.1 and asserted here directly, next to the fixed
 * behaviour, so the two can never drift apart in the reader's mind.
 *
 * `222` rather than `333`: same seed semantics, a two-order-of-magnitude cheaper
 * draw once its tables are warm.
 */
describe('🔴 the seed trap', () => {
  beforeEach(() => {
    _resetRegistryForTests();
    // The real 2x2x2, registered directly rather than by importing `src/index.ts`:
    // this file resets the registry between tests, so a whole-package import would
    // be undone by the first `beforeEach` above.
    register222Scrambler();
  });

  it('a caller-side loop over generateScramble repeats itself under a seed', async () => {
    const loop = [
      (await generateScramble('222', { seed: 'trap' })).moves,
      (await generateScramble('222', { seed: 'trap' })).moves,
      (await generateScramble('222', { seed: 'trap' })).moves,
    ];
    expect(new Set(loop).size).toBe(1);
  });

  it('a seeded batch is reproducible AND its members are distinct', async () => {
    const first = await generateScrambles('222', 5, { seed: 'batch-seed' });
    const second = await generateScrambles('222', 5, { seed: 'batch-seed' });
    expect(first).toEqual(second);

    const moves = first.map((r) => r.moves);
    // Distinctness rather than "no duplicates ever": each draw is its own uniform
    // draw and a repeat is a legitimate outcome, so the claim is about these five
    // and not about the distribution. For 2x2x2 a genuine five-way repeat is not
    // reachable in practice.
    expect(new Set(moves).size).toBe(5);
  });

  it('an unseeded batch differs between calls, so no stray default seed crept in', async () => {
    const first = await generateScrambles('222', 5);
    const second = await generateScrambles('222', 5);
    expect(first.map((r) => r.moves)).not.toEqual(second.map((r) => r.moves));
  });

  it('leaves generateScramble alone — a single seeded call is unchanged', async () => {
    const direct = await generateScramble('222', { seed: 'unchanged' });
    const again = await generateScramble('222', { seed: 'unchanged' });
    expect(direct).toEqual(again);
    // And the first member of a batch on the same seed matches it, because both
    // draw first from a source built the same way.
    const batch = await generateScrambles('222', 3, { seed: 'unchanged' });
    expect(batch[0]!.moves).toBe(direct.moves);
  });
});
