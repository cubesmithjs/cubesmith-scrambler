import { bench, describe } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { generateSkewbScramble } from './solve';

describe('generateSkewbScramble — steady state (tables already built)', () => {
  const random = createRandomSource('skewb-bench-warmup');
  generateSkewbScramble(random);

  bench('generateSkewbScramble', () => {
    generateSkewbScramble(random);
  });
});
