import type { RandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { skewbCoordinateStates, unpackSkewbState } from './coordinates';
import { distanceSkewbByIndex, UNVISITED_DISTANCE_SKEWB } from './pruning';
import type { SkewbState } from './state';

/**
 * A uniformly random reachable Skewb state.
 *
 * There is no constraint to satisfy by construction here, because the
 * coordinate space *is* the reachable space: both projections were built by
 * BFS from solved (see `coordinates.ts`), so drawing a uniform index and
 * decoding it is already uniform over real Skewb positions. That sidesteps
 * the usual "draw, then repair the parity" dance entirely — there is nothing
 * to repair.
 *
 * The rejection loop is a guard, not a mechanism: the pruning table's BFS
 * reaches all 3,149,280 entries (asserted in `pruning.test.ts`), so it never
 * actually rejects. It's kept so that this function stays correct — still
 * uniform over the reachable set — rather than silently wrong, if the two
 * projections ever stopped being independent.
 */
export function randomSkewbState(random: RandomSource): SkewbState {
  const states = skewbCoordinateStates();
  for (;;) {
    const index = randomInt(random, states);
    if (distanceSkewbByIndex(index) !== UNVISITED_DISTANCE_SKEWB) {
      return unpackSkewbState(index);
    }
  }
}
