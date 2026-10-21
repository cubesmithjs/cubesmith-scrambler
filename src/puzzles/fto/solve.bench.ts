import { bench, describe } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { generateFtoScramble } from './solve';

describe('generateFtoScramble — steady state (tables already built)', () => {
  const random = createRandomSource('fto-bench-warmup');
  generateFtoScramble(random);

  bench('generateFtoScramble', () => {
    generateFtoScramble(random);
  });
});
