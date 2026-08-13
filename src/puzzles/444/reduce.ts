import { solveCentres444 } from './centres';
import { parityOf444Handoff, to333State } from './handoff';
import { isReduced } from './orbits';
import { pairWings444 } from './pairing';
import { wingParityOf } from './parity';
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

/** How many phase-1 routes `reduce444BestRoute` will fully reduce before settling. */
export const MAX_REDUCTION_ROUTES = 4;

/**
 * How much longer than optimal a phase-1 route may be, when the shorter ones all
 * carry OLL parity.
 *
 * 🔴 **Measured, and the reason this is not zero.** At the optimal length a state
 * may have *no* even route at all — over 8 states enumerated 4,000 routes deep
 * (2026-08-13), one had 0 even of 72 at length 9 and 336 even at length 10. Every
 * one of the 8 had both parities available *somewhere*, and paying **one extra
 * phase-1 move** to reach an even route buys back a parity pass of about 35.
 */
const MAX_EXTRA_PHASE1_LENGTH = 2;

/**
 * How many phase-1 routes may be *examined* while hunting for even ones, before the
 * hunt gives up and the parity loop takes over. A bound on the worst case, not a
 * target — measurement says an even route turns up within a handful.
 */
const MAX_ROUTES_EXAMINED = 3_000;

/**
 * 🔴 **Whether the hand-off will have OLL parity is decided at the end of phase 1,
 * and nothing after it can change the answer.** So it is chosen here rather than
 * repaired later.
 *
 * Three measured facts compose into that (2026-08-13, on the shipped move tables):
 *
 * 1. Of the 36 moves, **only the 12 wide quarter turns are odd** on the 24 wings —
 *    all 12 outer quarters, all 6 outer halves and all 6 wide halves are even.
 * 2. So the whole 24-move centre-preserving set `G2` is **even**, and everything
 *    after phase 1 lives in it: the centre solve is over those 24 moves, and a
 *    pairing generator is a conjugate `A X A'` whose two odd wide quarters cancel.
 *    Wing-permutation parity is therefore **invariant** from the end of phase 1.
 * 3. On a reduced cube the **flip sum's parity equals the wing permutation's**
 *    (`parity.ts`), and an odd flip sum is exactly OLL parity.
 *
 * Together: the reduced cube has OLL parity **iff** the state after phase 1 has odd
 * wing parity. A route that lands even can never acquire it, and no amount of
 * re-pairing can remove it from a route that lands odd — which is why the parity
 * loop needs a deliberately *odd* gadget to fix it, at about 35 moves a pass.
 *
 * This supersedes discovering the same thing by trial: `reduce444BestRoute` used to
 * reduce several routes fully and keep whichever landed cheapest, which found even
 * routes only when one turned up inside its budget. Filtering first makes it
 * deterministic and spends the reduction budget on the *other* parity — the
 * corner/dedge permutation mismatch, which wing parity does **not** determine and
 * which does vary from route to route.
 *
 * ⚠️ **The routes must be enumerated deeply, not sampled.** Asking `phase1Solutions`
 * for the first 16 solutions returns 16 that all share a parity — the depth-first
 * enumeration walks them in prefix order, so a short sample is not representative
 * and the filter looks useless. Enumerated 4,000 deep, both parities are abundant at
 * essentially every length. That mistake cost a measurement and is worth not
 * repeating.
 */
function landsWithoutOllParity(state: Cube444State, route: readonly number[]): boolean {
  return wingParityOf(apply444Moves(state, route).wingPermutation) === 0;
}

/**
 * Phase-1 routes that leave the wings **even**, shortest first, stopping as soon as
 * `wanted` of them are in hand.
 *
 * Uses `phase1Solutions`' visitor so the search stops at the first few rather than
 * enumerating everything: even routes are plentiful once the bound is right, and the
 * visitor is what keeps "look deeper if the optimal length has none" affordable.
 */
function evenPhase1Routes(state: Cube444State, wanted: number): number[][] {
  const optimal = phase1Search(state).length;
  const found: number[][] = [];
  // 🔴 A cap on solutions *examined*, not just on solutions kept. `phase1Solutions`
  // stops only when the visitor says so, and a state whose short routes are all odd
  // can have thousands at each length — without this, the worst case is enumerating
  // every phase-1 solution within `MAX_EXTRA_PHASE1_LENGTH`, which is unbounded work
  // in a library that has to stay predictable.
  let examined = 0;
  phase1Solutions(state, {
    maxLength: optimal + MAX_EXTRA_PHASE1_LENGTH,
    visit: (route) => {
      examined += 1;
      if (landsWithoutOllParity(state, route)) found.push([...route]);
      return found.length >= wanted || examined >= MAX_ROUTES_EXAMINED;
    },
  });
  return found;
}

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
  // Even routes first, because they cannot produce OLL parity — but *never only*
  // even routes.
  //
  // 🔴 An even route rules out `flip` and `both` at the cost of admitting
  // `permutation`, and `permutation` is the expensive landing: two gadgets and a
  // doubled pass, about 86 moves against 35-58 for one. So a state whose even routes
  // all land `permutation` is better served by an odd route that lands `flip`.
  // Preferring even blindly made exactly that trade, and `reduce.test.ts`'s
  // "never lands in a costlier parity case than the first route would" caught it.
  //
  // The plain shortest route — what `reduce444` uses — is therefore always kept as a
  // baseline, and the ranking below decides on measured parity cost rather than on
  // which parity class the route belongs to.
  const routes = [...evenPhase1Routes(state, maxRoutes), phase1Search(state)];

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
