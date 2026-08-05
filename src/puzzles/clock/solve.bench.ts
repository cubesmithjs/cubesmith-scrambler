import { bench, describe } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { generateClockScramble } from './solve';

/**
 * No pruning table to warm up here — a Clock scramble is fourteen random
 * draws and one matrix multiply, so there is no cold-start cost at all
 * beyond inverting a 14x14 matrix once.
 */
describe('generateClockScramble', () => {
  const random = createRandomSource('clock-bench-warmup');
  generateClockScramble(random);

  bench('generateClockScramble', () => {
    generateClockScramble(random);
  });
});
