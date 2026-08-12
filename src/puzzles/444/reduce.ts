import { solveCentres444 } from './centres';
import { parityOf444Handoff, to333State } from './handoff';
import { isReduced } from './orbits';
import { pairWings444 } from './pairing';
import { phase1Search, phase1Solutions } from './phase1-search';
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
  return reduceVia(state, phase1Search(state));
}

function reduceVia(state: Cube444State, toAxisPairs: readonly number[]): Reduction444 {
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

/**
 * How many parity passes a reduced cube will cost the solver — 0, 1 or 2.
 *
 * Measured over 6 mismatched states x 24 disturbers each (2026-08-12), and both
 * halves came out unanimous rather than merely likely:
 *
 * - from `flip` or `both`, one wing-odd gadget and a fresh pairing can land
 *   reachable;
 * - from `permutation`, one **never** can. All 144 attempts landed in `both`
 *   (78) or `flip` (66), never `none`. An odd gadget changes the flip parity on
 *   the way past, so from a state whose flip sum is already even, an odd number
 *   of passes cannot end reachable. The second pass is structural, not unlucky.
 */
function parityPassesFor(reduced: Cube444State): 0 | 1 | 2 {
  switch (parityOf444Handoff(to333State(reduced))) {
    case 'none':
      return 0;
    case 'permutation':
      return 2;
    default:
      return 1;
  }
}

/** How many phase-1 routes `reduce444BestRoute` will try before settling. */
export const MAX_REDUCTION_ROUTES = 4;

/**
 * The reduction that leaves the **least parity work**, chosen from several
 * equally-valid routes to the same reduced shape.
 *
 * ## Why this is the biggest lever on 4x4x4 length
 *
 * Which of the four parity cases a reduced cube lands in is a property of the
 * **route**, not of the state. Measured over 10 states reduced 12 ways each
 * (2026-08-12): the same state landed `none` on one route and `permutation` on
 * the next, and **6 of the 10 had a route that needed no parity work at all**
 * while their first route did.
 *
 * That matters because parity is the dominant term. Before this, over 12 states:
 * centres 16.2 moves, pairing 46.8, 3x3x3 hand-off 23.0 — and **parity 68.2**,
 * because a `permutation` landing costs two gadgets and two whole fresh pairings.
 * Picking a route that lands `none` replaces all of that with nothing.
 *
 * ## Why it cannot affect the distribution
 *
 * Every route reduces the **same drawn state**, and the state was drawn before any
 * of this ran. §11 of the design document is the argument in full: the solver is
 * looking for a witness, and choosing a shorter witness over a longer one says
 * nothing about which state was drawn. What would bias the output is redrawing the
 * *state* when the solver dislikes the route, which is exactly what this does not
 * do — a state whose every route lands `permutation` is solved down that route,
 * not resampled.
 *
 * ## The budget
 *
 * `phase1Solutions` is asked for `MAX_REDUCTION_ROUTES` solutions in one search,
 * so the enumeration is paid once; what each extra route costs is a centre solve
 * and a pairing. The loop stops the moment a route lands `none`, which measurement
 * says is most of them, so the average is well under the cap. Ties on parity break
 * toward the shorter reduction.
 */
export function reduce444BestRoute(
  state: Cube444State,
  maxRoutes = MAX_REDUCTION_ROUTES,
): Reduction444 {
  const routes = phase1Solutions(state, { maxSolutions: maxRoutes });
  if (routes.length === 0) {
    throw new Error('@cubesmith/scrambler: 4x4x4 phase 1 found no route to the axis pairs');
  }

  let best: { reduction: Reduction444; passes: number } | undefined;
  for (const route of routes) {
    const reduction = reduceVia(state, route);
    const passes = parityPassesFor(reduction.state);
    if (
      !best ||
      passes < best.passes ||
      (passes === best.passes && reduction.moves.length < best.reduction.moves.length)
    ) {
      best = { reduction, passes };
    }
    if (passes === 0) break;
  }
  return best!.reduction;
}
