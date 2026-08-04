import { afterEach, describe, expect, it } from 'vitest';
import { generateScramble } from './generate-scramble';
import { UnimplementedEventError } from './errors';
import { _resetRegistryForTests, registerScrambler } from './scrambler-registry';
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
