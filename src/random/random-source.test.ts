import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRandomSource } from './random-source';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createRandomSource — seeded (deterministic)', () => {
  it('produces the exact same sequence for the same numeric seed', () => {
    const a = createRandomSource(42);
    const b = createRandomSource(42);
    const seqA = Array.from({ length: 20 }, () => a.nextUint32());
    const seqB = Array.from({ length: 20 }, () => b.nextUint32());
    expect(seqA).toEqual(seqB);
  });

  it('produces the exact same sequence for the same string seed', () => {
    const a = createRandomSource('my-seed');
    const b = createRandomSource('my-seed');
    expect(a.nextUint32()).toBe(b.nextUint32());
    expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it('different seeds produce different sequences', () => {
    const a = createRandomSource(1);
    const b = createRandomSource(2);
    const seqA = Array.from({ length: 10 }, () => a.nextUint32());
    const seqB = Array.from({ length: 10 }, () => b.nextUint32());
    expect(seqA).not.toEqual(seqB);
  });

  it('always returns a value in the full unsigned 32-bit range', () => {
    const source = createRandomSource('range-check');
    for (let i = 0; i < 1000; i += 1) {
      const value = source.nextUint32();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(0x1_0000_0000);
    }
  });

  it('does not repeat the first value indefinitely (regression: a bad seed mix could get stuck)', () => {
    const source = createRandomSource(0);
    const first = source.nextUint32();
    const second = source.nextUint32();
    expect(first).not.toBe(second);
  });
});

describe('createRandomSource — unseeded (random)', () => {
  it('two unseeded sources produce different sequences', () => {
    const a = createRandomSource();
    const b = createRandomSource();
    const seqA = Array.from({ length: 10 }, () => a.nextUint32());
    const seqB = Array.from({ length: 10 }, () => b.nextUint32());
    expect(seqA).not.toEqual(seqB);
  });

  it('returns values in the full unsigned 32-bit range', () => {
    const source = createRandomSource();
    for (let i = 0; i < 100; i += 1) {
      const value = source.nextUint32();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(0x1_0000_0000);
    }
  });

  it('falls back to Math.random on a runtime with no Web Crypto API', () => {
    vi.stubGlobal('crypto', undefined);
    const source = createRandomSource();
    for (let i = 0; i < 50; i += 1) {
      const value = source.nextUint32();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(0x1_0000_0000);
    }
  });
});
