import { describe, test } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { generate333Scramble } from './solve';

/**
 * Table-build cost is a one-time, cold-start expense (the module-level
 * `??=` caches in `phase{1,2}-tables.ts`/`phase{1,2}-pruning.ts` mean
 * every later call is free) — measured once, in isolation, rather than
 * via `bench()` here, which repeats its function many times and would
 * only ever time the *cached* path after the first iteration. As of this
 * writing that cold build (all 4 move + pruning tables) takes ~11s; see
 * `docs/architecture.md` §3 for the current number.
 */

describe('generate333Scramble — steady state (tables already built)', () => {
  const random = createRandomSource('bench-warmup');
  // Warm the tables once before benchmarking, so `bench()`'s repeated
  // calls measure only search time, not the one-off build cost above.
  generate333Scramble(random);

  test('generate333Scramble', async ({ bench }) => {
    await bench('generate333Scramble', () => {
      generate333Scramble(random);
    }).run();
  });
});
