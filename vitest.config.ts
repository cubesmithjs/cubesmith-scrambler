import { defineConfig } from 'vitest/config';
import { DurationShardSequencer } from './vitest.sequencer.ts';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Pruning-table BFS builds (a few million states for 333, 3x3M for
    // pyraminx and skewb) take seconds on first use within a test file — well
    // above Vitest's 5s default. The headroom is generous because
    // `npm run test:coverage` adds V8 instrumentation on top, which slows the
    // 3x3x3 solver by roughly an order of magnitude. Table-build performance
    // itself is tracked by `npm run bench`, not by whether a correctness test
    // times out.
    testTimeout: 180000,
    // Only consulted with `--shard` (CI): balances the shards by measured
    // duration instead of by file count. See `vitest.sequencer.ts`.
    sequence: { sequencer: DurationShardSequencer },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**'],
    },
  },
});
