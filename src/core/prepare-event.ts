import { UnimplementedEventError } from './errors';
import { getScrambler } from './scrambler-registry';
import type { WcaEventId } from './types';

/**
 * Builds whatever `event` precomputes — lookup and pruning tables, move
 * permutations — so the one-off cost is not charged to the first scramble a user
 * is waiting for.
 *
 * The gap is large and measured on this machine (2026-08-11, Windows 11,
 * WAMP-era dev box, Node 22): a `222` scramble costs about 0 ms warm and yet the
 * *first* one costs **4403 ms**; `444` is **7054 ms** cold against 412 ms warm;
 * `sq1` **4121 ms** against 76 ms. Until now the only way to pre-pay that was to
 * generate a scramble and throw it away, which works, wastes a draw, and reads
 * like a mistake to the next person who sees it.
 *
 * 🔴 This is **not** a discarded draw. It calls the solvers' own memoised table
 * builders and touches no `RandomSource`, so a seeded sequence is byte-identical
 * with and without a preceding `prepareEvent` — a discarded draw would consume
 * entropy and shift every subsequent scramble, turning a performance helper into
 * a correctness hazard.
 *
 * Idempotent and cheap after the first call, because those builders are
 * memoised. For an event with nothing to precompute (`clock`, `minx`) it resolves
 * as soon as that event has nothing left to precompute — which is immediately,
 * and is not an error.
 *
 * `async` for the same reason `generateScramble` is: the work today is pure
 * synchronous computation, and the signature leaves room for a puzzle that
 * lazily loads table data without a breaking change.
 *
 * @throws {UnimplementedEventError} if `event` has no registered scrambler.
 */
export async function prepareEvent(event: WcaEventId): Promise<void> {
  const registration = getScrambler(event);
  if (!registration) {
    throw new UnimplementedEventError(event);
  }
  registration.prepare?.();
}
