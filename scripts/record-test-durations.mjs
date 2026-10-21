#!/usr/bin/env node
/**
 * Writes `test-durations.json` — seconds per test file — for the
 * duration-balanced CI shards (`vitest.sequencer.ts`).
 *
 *   npm run test:durations     # runs the suite, then records
 *
 * The source is Vitest's own results cache (`node_modules/.vite/vitest/*\/results.json`),
 * which holds each file's real wall time, `beforeAll` work included. The JSON
 * reporter's per-file times leave that out: `move-count.test.ts` reads 0.03 s
 * there and 60 s here. The cache also keeps entries for files that no longer
 * exist, so only test files still on disk are recorded.
 *
 * The numbers only steer which shard a file lands on, so a stale entry costs
 * balance, never correctness: every file still runs exactly once. Refresh after
 * adding a slow test file, or when one shard keeps finishing last in CI.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cacheRoot = join(root, 'node_modules', '.vite', 'vitest');
const caches = existsSync(cacheRoot)
  ? readdirSync(cacheRoot).map((dir) => join(cacheRoot, dir, 'results.json')).filter(existsSync)
  : [];
if (caches.length === 0) {
  console.error('No Vitest results cache found. Run the test suite first (npm test).');
  process.exit(1);
}

const durations = {};
for (const cache of caches) {
  const { results } = JSON.parse(readFileSync(cache, 'utf8'));
  // Stored as `[key, { duration, failed }]` pairs; an object is accepted too.
  const entries = Array.isArray(results) ? results : Object.entries(results);
  for (const [key, { duration }] of entries) {
    const file = key.slice(key.indexOf(':') + 1);
    if (!file.endsWith('.test.ts') || !existsSync(join(root, file))) continue;
    durations[file] = Math.round(duration / 100) / 10;
  }
}

const sorted = Object.fromEntries(Object.entries(durations).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(join(root, 'test-durations.json'), `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`test-durations.json: ${Object.keys(sorted).length} files`);
