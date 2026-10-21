import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 The unofficial events live behind their own entry points so a WCA-only
 * consumer bundles none of them, and so the main entry's answers do not change.
 * Like `draw/bundle.test.ts`, this reads the **built** files, and skips on a
 * tree that has not been built yet (`npm run ci` builds last).
 */
const MAIN = 'dist/index.js';
const DRAW = 'dist/draw/index.js';
const UNOFFICIAL = 'dist/unofficial/index.js';
const UNOFFICIAL_DRAW = 'dist/unofficial/draw/index.js';

const built = [MAIN, DRAW, UNOFFICIAL, UNOFFICIAL_DRAW].every((file) => existsSync(file));

describe.skipIf(!built)('the unofficial bundles', () => {
  it('🔴 keep every unofficial symbol out of the WCA entries', () => {
    for (const file of [MAIN, DRAW]) {
      const source = readFileSync(file, 'utf8');
      for (const symbol of [
        'generateUnofficialScramble',
        'registerUnofficialScrambler',
        'random-state-mechanism',
        'drawUnofficialScramble',
        'intersectHalfSpaces',
        'MIRROR_OFFSET',
      ]) {
        expect(source.includes(symbol), `${file}: ${symbol}`).toBe(false);
      }
    }
  });

  it('keeps the drawing layer and the geometry engine out of the unofficial scrambling entry', () => {
    const source = readFileSync(UNOFFICIAL, 'utf8');
    for (const symbol of ['drawUnofficialScramble', 'intersectHalfSpaces', 'scrambleImageToSvg', 'ffcc00']) {
      expect(source.includes(symbol), symbol).toBe(false);
    }
  });

  it('keeps every scramble generator out of the unofficial drawing entry', () => {
    const source = readFileSync(UNOFFICIAL_DRAW, 'utf8');
    expect(source).toContain('intersectHalfSpaces');
    for (const symbol of ['generateUnofficialScramble', 'createRandomSource', 'buildPruningTable', 'phase1Search']) {
      expect(source.includes(symbol), symbol).toBe(false);
    }
  });

  it('records the sizes and ships type declarations for both new entries', () => {
    for (const file of [UNOFFICIAL, UNOFFICIAL_DRAW]) {
      // Loose ceilings: the point is to fail on a doubling. Measured values are in CHANGELOG.md.
      expect(gzipSync(readFileSync(file)).length).toBeLessThan(70_000);
    }
    expect(readFileSync('dist/unofficial/index.d.ts', 'utf8')).toContain('UnofficialEventId');
    expect(readFileSync('dist/unofficial/draw/index.d.ts', 'utf8')).toContain('UnofficialScrambleImage');
  });

  it('declares both entries in package.json exports', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      exports: Record<string, { types: string; import: string }>;
    };
    expect(manifest.exports['./unofficial']).toEqual({
      types: './dist/unofficial/index.d.ts',
      import: './dist/unofficial/index.js',
    });
    expect(manifest.exports['./unofficial/draw']).toEqual({
      types: './dist/unofficial/draw/index.d.ts',
      import: './dist/unofficial/draw/index.js',
    });
  });
});
