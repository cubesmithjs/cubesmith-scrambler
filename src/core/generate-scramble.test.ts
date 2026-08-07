import { afterEach, describe, expect, it } from 'vitest';
import { generateScramble } from './generate-scramble';
import { InvalidScrambleCountError, UnimplementedEventError } from './errors';
import {
  _resetRegistryForTests,
  registerMultiScrambler,
  registerScrambler,
} from './scrambler-registry';
import { MAX_SCRAMBLE_COUNT } from './types';
import type { RandomSource } from '../random/random-source';

afterEach(() => {
  _resetRegistryForTests();
});

describe('generateScramble', () => {
  it('throws UnimplementedEventError for an event with no registered scrambler', async () => {
    await expect(generateScramble('333')).rejects.toThrow(UnimplementedEventError);
    await expect(generateScramble('333')).rejects.toThrow(/333/);
  });

  it('returns the scrambler\'s moves, tagged with the event and quality', async () => {
    registerScrambler('333', () => 'R U F');
    const result = await generateScramble('333');
    expect(result).toEqual({ event: '333', moves: 'R U F', quality: 'random-state' });
  });

  it('passes a RandomSource seeded from options.seed to the scrambler', async () => {
    let received: RandomSource | undefined;
    registerScrambler('333', (random) => {
      received = random;
      return String(random.nextUint32());
    });
    const a = await generateScramble('333', { seed: 'fixed-seed' });
    const capturedFirst = received;
    const b = await generateScramble('333', { seed: 'fixed-seed' });

    expect(a.moves).toBe(b.moves);
    expect(capturedFirst).toBeDefined();
  });

  it('two unseeded calls draw from independent random sources', async () => {
    registerScrambler('333', (random) => String(random.nextUint32()));
    const a = await generateScramble('333');
    const b = await generateScramble('333');
    expect(a.moves).not.toBe(b.moves);
  });
});

describe('generateScramble — multi-scramble events', () => {
  /** A cheap stand-in for `333mbf`: one token per call, so the sequence is readable. */
  function registerCountingMulti(): void {
    let next = 0;
    registerMultiScrambler('333mbf', () => {
      next += 1;
      return `S${next}`;
    });
  }

  it('returns one scramble and a one-entry scrambles array when count is omitted', async () => {
    registerCountingMulti();
    const result = await generateScramble('333mbf');
    expect(result).toEqual({
      event: '333mbf',
      moves: 'S1',
      quality: 'random-state',
      scrambles: ['S1'],
    });
  });

  it('draws count scrambles, with moves still the first of them', async () => {
    registerCountingMulti();
    const result = await generateScramble('333mbf', { count: 4 });
    expect(result.scrambles).toEqual(['S1', 'S2', 'S3', 'S4']);
    expect(result.moves).toBe(result.scrambles![0]);
  });

  it('shares one random source across the draws, so they are independent rather than repeated', async () => {
    registerMultiScrambler('333mbf', (random) => String(random.nextUint32()));
    const result = await generateScramble('333mbf', { count: 5, seed: 'multi' });
    expect(new Set(result.scrambles).size).toBe(5);
  });

  it('does not de-duplicate — a repeat is a legitimate draw, not a bug to fix', async () => {
    // Each cube is its own uniform draw, so collisions are allowed and
    // removing them would bias the distribution. A scrambler that always
    // returns the same thing must therefore come back N times, not once.
    registerMultiScrambler('333mbf', () => 'R U F');
    const result = await generateScramble('333mbf', { count: 3 });
    expect(result.scrambles).toEqual(['R U F', 'R U F', 'R U F']);
  });

  it('is deterministic for a seed, across the whole set', async () => {
    registerMultiScrambler('333mbf', (random) => String(random.nextUint32()));
    const a = await generateScramble('333mbf', { count: 3, seed: 'same' });
    const b = await generateScramble('333mbf', { count: 3, seed: 'same' });
    expect(a.scrambles).toEqual(b.scrambles);
  });
});

describe('generateScramble — count validation', () => {
  it('rejects count on a single-scramble event rather than ignoring it', async () => {
    registerScrambler('333', () => 'R U F');
    await expect(generateScramble('333', { count: 3 })).rejects.toThrow(InvalidScrambleCountError);
    await expect(generateScramble('333', { count: 3 })).rejects.toThrow(/"333"/);
  });

  it('rejects a non-integer, a zero, a negative, and anything past the bound', async () => {
    registerMultiScrambler('333mbf', () => 'R U F');
    for (const count of [1.5, 0, -1, MAX_SCRAMBLE_COUNT + 1]) {
      await expect(generateScramble('333mbf', { count })).rejects.toThrow(
        InvalidScrambleCountError,
      );
    }
  });

  it('accepts the bound itself', async () => {
    registerMultiScrambler('333mbf', () => 'R U F');
    const result = await generateScramble('333mbf', { count: MAX_SCRAMBLE_COUNT });
    expect(result.scrambles).toHaveLength(MAX_SCRAMBLE_COUNT);
  });

  it('carries the event and the offending count on the error', async () => {
    registerScrambler('333', () => 'R U F');
    const error = await generateScramble('333', { count: 7 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidScrambleCountError);
    expect((error as InvalidScrambleCountError).event).toBe('333');
    expect((error as InvalidScrambleCountError).count).toBe(7);
  });
});
