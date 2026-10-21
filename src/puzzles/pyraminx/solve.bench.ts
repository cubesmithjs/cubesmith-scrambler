import { describe, test } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { generatePyraminxScramble } from './solve';

describe('generatePyraminxScramble — steady state (tables already built)', () => {
  const random = createRandomSource('pyraminx-bench-warmup');
  generatePyraminxScramble(random);

  test('generatePyraminxScramble', async ({ bench }) => {
    await bench('generatePyraminxScramble', () => {
      generatePyraminxScramble(random);
    }).run();
  });
});
