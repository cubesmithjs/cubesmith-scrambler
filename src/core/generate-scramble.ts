import { createRandomSource } from '../random/random-source';
import { UnimplementedEventError } from './errors';
import { getScrambler } from './scrambler-registry';
import type { GenerateScrambleOptions, ScrambleResult, WcaEventId } from './types';

/**
 * Generates a WCA scramble for `event`. Deterministic given `options.seed`;
 * drawn from a cryptographically-random source otherwise. Pure computation
 * only — no Worker, no DOM — so this resolves synchronously-fast in any
 * JavaScript environment; it's `async` only so a future puzzle can lazily
 * load its own pruning-table data without changing the public signature.
 *
 * @throws {UnimplementedEventError} if `event` has no registered scrambler yet.
 */
export async function generateScramble(
  event: WcaEventId,
  options: GenerateScrambleOptions = {},
): Promise<ScrambleResult> {
  const scrambler = getScrambler(event);
  if (!scrambler) {
    throw new UnimplementedEventError(event);
  }
  const random = createRandomSource(options.seed);
  const moves = scrambler(random, options);
  return { event, moves, quality: 'random-state' };
}
