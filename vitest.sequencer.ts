import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

/**
 * Splits test files across CI shards by **measured duration**, not by count.
 *
 * Vitest's own `--shard` sorts files by a hash of their path and cuts the list
 * into equal-count slices, so it ignores how long a file takes. Here a handful
 * of files (the Square-1 solver, `index`, `validate-scramble`, `prepare-event`)
 * take minutes and most take milliseconds, so equal counts are unequal work.
 * Measured on 2026-10-21 over 119 files: the hash split's slowest of 4 shards
 * was 13% over the ideal, and of 6 shards 59% over.
 *
 * This assigns files longest first, each to the shard with the least work so
 * far (the classic LPT heuristic), from `test-durations.json`. A file missing
 * from that list counts as the median, so a new test file is still placed.
 *
 * 🔴 Splitting by file is safe because nothing is shared between files: Vitest
 * runs each file isolated (`isolate: true`, its default, which this config does
 * not change), so a file rebuilds whatever tables it uses and depends on no other
 * file having run. A file is never split, so tests that rely on an earlier test
 * in the same file stay together. Every shard computes the same assignment from
 * the same inputs (ties are broken by path), so each file runs exactly once.
 */
export class DurationShardSequencer extends BaseSequencer {
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { index, count } = this.ctx.config.shard!;
    const root = this.ctx.config.root;
    const durations = readDurations();
    const known = Object.values(durations).sort((a, b) => a - b);
    const median = known.length > 0 ? known[Math.floor(known.length / 2)]! : 1;

    const weighted = files
      .map((spec) => {
        const key = relative(root, spec.moduleId).split('\\').join('/');
        return { spec, key, weight: durations[key] ?? median };
      })
      .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));

    const load = new Array<number>(count).fill(0);
    const mine: TestSpecification[] = [];
    for (const { spec, weight } of weighted) {
      let target = 0;
      for (let shard = 1; shard < count; shard += 1) if (load[shard]! < load[target]!) target = shard;
      load[target] = load[target]! + weight;
      if (target === index - 1) mine.push(spec);
    }
    return mine;
  }
}

function readDurations(): Record<string, number> {
  try {
    return JSON.parse(readFileSync(new URL('./test-durations.json', import.meta.url), 'utf8')) as Record<
      string,
      number
    >;
  } catch {
    // No durations: every file weighs the same, which is still a valid split.
    return {};
  }
}
