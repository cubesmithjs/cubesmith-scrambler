import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../random/random-source';
import { randomInt } from './random-int';

describe('randomInt', () => {
  it('always returns a value within [0, maxExclusive)', () => {
    const random = createRandomSource('bounds-check');
    for (const max of [1, 2, 3, 7, 8, 100, 4096]) {
      for (let i = 0; i < 200; i += 1) {
        const value = randomInt(random, max);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(max);
      }
    }
  });

  it('is deterministic given a seeded source', () => {
    const a = createRandomSource('det');
    const b = createRandomSource('det');
    for (let i = 0; i < 50; i += 1) {
      expect(randomInt(a, 1000)).toBe(randomInt(b, 1000));
    }
  });

  it('covers the full range over many draws (not silently clamped to one value)', () => {
    const random = createRandomSource('coverage');
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) {
      seen.add(randomInt(random, 5));
    }
    expect(seen.size).toBe(5);
  });

  it('rejects a non-positive-integer bound', () => {
    const random = createRandomSource(1);
    expect(() => randomInt(random, 0)).toThrow();
    expect(() => randomInt(random, -1)).toThrow();
    expect(() => randomInt(random, 1.5)).toThrow();
  });

  it('the degenerate max=1 case always returns 0', () => {
    const random = createRandomSource(1);
    for (let i = 0; i < 20; i += 1) {
      expect(randomInt(random, 1)).toBe(0);
    }
  });
});
