import { describe, test } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { generateCubeNxNScramble, RANDOM_MOVE_CUBES } from './solve';

/**
 * No pruning table and no search — a random-moves scramble is a walk with a
 * redundancy check, so the only warm-up cost is deriving that size's facelet
 * permutations once.
 */
for (const { event, size, length } of RANDOM_MOVE_CUBES) {
  describe(`generateCubeNxNScramble — ${event}`, () => {
    const random = createRandomSource(`${event}-bench-warmup`);
    generateCubeNxNScramble(random, size, length);

    test(`${event} (${length} moves)`, async ({ bench }) => {
      await bench(`${event} (${length} moves)`, () => {
        generateCubeNxNScramble(random, size, length);
      }).run();
    });
  });
}
