import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Phase-1/phase-2 pruning-table BFS builds (~1-2M states each) take a
    // few seconds on first use within a test file — well above Vitest's
    // 5s default. Table-build performance itself is tracked separately by
    // `npm run bench`, not by whether a correctness test times out.
    testTimeout: 60000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**'],
    },
  },
});
