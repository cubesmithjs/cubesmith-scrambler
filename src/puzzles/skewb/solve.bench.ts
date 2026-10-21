import { describe, test } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { generateSkewbScramble } from './solve';

describe('generateSkewbScramble — steady state (tables already built)', () => {
  const random = createRandomSource('skewb-bench-warmup');
  generateSkewbScramble(random);

  test('generateSkewbScramble', async ({ bench }) => {
    await bench('generateSkewbScramble', () => {
      generateSkewbScramble(random);
    }).run();
  });
});
