import { solveCentres444 } from './centres';
import { isReduced } from './orbits';
import { pairWings444 } from './pairing';
import { phase1Search } from './phase1-search';
import { apply444Moves, type Cube444State } from './state';

/**
 * **The reduction**: from any position to one that a 3x3x3 solver can finish —
 * centres solved, and both wings of every edge together.
 *
 * Three stages, in an order forced by what each one is allowed to disturb:
 *
 * 1. **`phase1Search`** brings every centre onto its own axis pair, over all 36
 *    moves. Free to wreck anything, because nothing has been established yet.
 * 2. **`solveCentres444`** finishes the centres exactly, over the 24 moves that keep
 *    them on their pairs — so it cannot undo stage 1.
 * 3. **`pairWings444`** pairs the wings using only verified centre-neutral
 *    sequences, so it cannot undo stage 2.
 *
 * Each stage's move set is a subset of the previous one's, which is what makes the
 * order sound: a later stage physically cannot reach the invariant an earlier one
 * established. Corners are untouched by all three and are the next phase's problem.
 *
 * The result is a witness, not an optimum. It runs around fifty moves where an
 * optimal reduction would run far fewer, and §11 of the design document is the
 * argument that this costs nothing in distribution: the state was drawn before any
 * of this ran, and a longer witness encodes it just as exactly as a short one.
 */
export interface Reduction444 {
  /** Move indices into `move444Tables()`, in order. */
  readonly moves: number[];
  /** The reduced position the sequence arrives at. */
  readonly state: Cube444State;
  readonly centreMoves: number;
  readonly pairingMoves: number;
}

export function reduce444(state: Cube444State): Reduction444 {
  const toAxisPairs = phase1Search(state);
  const afterPhase1 = apply444Moves(state, toAxisPairs);

  const centres = solveCentres444(afterPhase1);
  const withCentres = apply444Moves(afterPhase1, centres);

  const pairing = pairWings444(withCentres);
  const reduced = apply444Moves(withCentres, pairing.moves);

  if (!isReduced(reduced)) {
    // Not a defensive nicety: a reduction that silently came up short would be
    // handed to a 3x3x3 phase that cannot represent the position, and the failure
    // would surface as a wrong scramble rather than as an error.
    throw new Error('@cubesmith/scrambler: 4x4x4 reduction did not reduce');
  }

  return {
    moves: [...toAxisPairs, ...centres, ...pairing.moves],
    state: reduced,
    centreMoves: toAxisPairs.length + centres.length,
    pairingMoves: pairing.moves.length,
  };
}
