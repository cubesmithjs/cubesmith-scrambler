import { describe, test } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { generateFtoScramble } from './solve';

describe('generateFtoScramble — steady state (tables already built)', () => {
  const random = createRandomSource('fto-bench-warmup');
  generateFtoScramble(random);

  test('generateFtoScramble', async ({ bench }) => {
    await bench('generateFtoScramble', () => {
      generateFtoScramble(random);
    }).run();
  });
});
