import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 The `./draw` entry point exists for exactly one reason: a consumer that only
 * scrambles — the app's practice timer, a results page — must not bundle the drawing
 * layer. A re-export from the main entry would defeat that silently, and nothing
 * else in the suite would notice.
 *
 * So this reads the **built** files. It is the only test here that does, and that is
 * the point: `src/index.ts` not importing `src/draw/` is a source fact, while "the
 * drawing layer is absent from what ships" is a fact about `dist/`.
 *
 * `npm run ci` runs `test:coverage` *before* `build`, so on a clean checkout `dist/`
 * may not exist yet. Skipping in that case rather than failing keeps the ordering
 * honest — the assertion that matters runs on any tree that has been built once, and
 * `task-08`'s release checklist builds from clean before publishing.
 */
const MAIN = 'dist/index.js';
const DRAW = 'dist/draw/index.js';

const built = existsSync(MAIN) && existsSync(DRAW);

describe.skipIf(!built)('the built bundles', () => {
  it('🔴 keeps the drawing layer out of the main entry', () => {
    const main = readFileSync(MAIN, 'utf8');
    // Symbols that exist only in the drawing layer. Each is a different kind of
    // evidence — a function, an error class, a colour constant, a face-name table —
    // so a partial re-export cannot slip past one of them.
    for (const symbol of [
      'scrambleImageToSvg',
      'UnimplementedDrawingError',
      'UnsupportedScrambleError',
      'InvalidColorError',
      'defaultColorScheme',
      'ffcc00', // a Megaminx colour, which appears nowhere else in the package
      'FrontTopClock',
    ]) {
      expect(main.includes(symbol), symbol).toBe(false);
    }
  });

  it('ships the scrambling layer in the drawing entry, because the drawings read the puzzle models', () => {
    const draw = readFileSync(DRAW, 'utf8');
    // Not a leak — the opposite. A drawing is a state applied from text, so it needs
    // the state models. What it must NOT need is the solvers: no pruning table, no
    // IDA*, nothing a scramble *generator* uses. `generateScramble` is absent.
    expect(draw).toContain('modelForSize');
    expect(draw).toContain('deriveFaceletPermutation');
    expect(draw).not.toContain('generateScramble');
    expect(draw).not.toContain('createRandomSource');
    expect(draw).not.toContain('mulberry32');
    // No solver reached it either: no pruning table, no search.
    expect(draw).not.toContain('buildPruningTable');
    expect(draw).not.toContain('phase1Search');
  });

  it('records both bundle sizes, so a regression is visible rather than inferred', () => {
    const sizes = Object.fromEntries(
      [MAIN, DRAW].map((file) => {
        const bytes = readFileSync(file);
        return [file, { raw: bytes.length, gzip: gzipSync(bytes).length }];
      }),
    );
    // Loose ceilings, not exact numbers: the point is to fail on a doubling, not on a
    // formatting change. The measured values at 0.13.0 are in `CHANGELOG.md`.
    expect(sizes[MAIN]!.gzip).toBeLessThan(70_000);
    expect(sizes[DRAW]!.gzip).toBeLessThan(40_000);
    // The drawing layer is genuinely smaller than the scrambling one, which is what
    // makes the split worth having for a scramble-only consumer.
    expect(sizes[DRAW]!.gzip).toBeLessThan(sizes[MAIN]!.gzip);
  });

  it('ships type declarations for both entry points', () => {
    expect(existsSync('dist/index.d.ts')).toBe(true);
    expect(existsSync('dist/draw/index.d.ts')).toBe(true);
    const drawTypes = readFileSync('dist/draw/index.d.ts', 'utf8');
    expect(drawTypes).toContain('ScrambleImage');
    expect(drawTypes).toContain('drawScramble');
  });
});
