import { describe, expect, it } from 'vitest';
import { generateScramble, isImplementedEvent, UnimplementedEventError } from './index';

/** A smoke test of the package's actual public entry point (`src/index.ts`), not an internal module. */
describe('@cube/scrambler public entry point', () => {
  it('no event is implemented yet — every call currently throws UnimplementedEventError', async () => {
    expect(isImplementedEvent('333')).toBe(false);
    await expect(generateScramble('333')).rejects.toBeInstanceOf(UnimplementedEventError);
  });
});
