import { bench, describe } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { generate222Scramble } from './solve';

describe('generate222Scramble — steady state (tables already built)', () => {
  const random = createRandomSource('222-bench-warmup');
  generate222Scramble(random);

  bench('generate222Scramble', () => {
    generate222Scramble(random);
  });
});
