import { bench, describe } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { generatePyraminxScramble } from './solve';

describe('generatePyraminxScramble — steady state (tables already built)', () => {
  const random = createRandomSource('pyraminx-bench-warmup');
  generatePyraminxScramble(random);

  bench('generatePyraminxScramble', () => {
    generatePyraminxScramble(random);
  });
});
