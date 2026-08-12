import type { RandomSource } from '../../random/random-source';
import { inverseMoves, movesToString } from '../../notation/move';
import { registerScrambler } from '../../core/scrambler-registry';
import { withMinimumDistance } from '../nxn/minimum';
import { phase1Search } from './phase1-search';
import { phase2Search } from './phase2-search';
import { randomState } from './random-state';
import {
  endRestrictions,
  isForbiddenLastMove,
  NO_END_RESTRICTIONS,
  type EndAxisRestrictions,
} from './search-restrictions';
import { applyMoves, type CubeState } from './state';
import { buildPhase1Tables } from './phase1-tables';
import { buildPhase1PruningTables } from './phase1-pruning';
import { buildPhase2Tables } from './phase2-tables';
import { buildPhase2PruningTables } from './phase2-pruning';
import type { FaceMove } from './move-tables';

/**
 * A shortest-ish sequence (phase-1 optimal, then phase-2 optimal from wherever
 * phase 1 lands) solving `state` back to `SOLVED_STATE`.
 *
 * `restrictions` optionally bars the solution from opening or closing on a
 * given axis — see `search-restrictions.ts`. The state solved is unaffected;
 * only the route to it changes.
 */
export function solve333(
  state: CubeState,
  restrictions: EndAxisRestrictions = NO_END_RESTRICTIONS,
): FaceMove[] {
  const solution = twoPhaseSolve(state, restrictions, false);
  if (!isForbiddenLastMove(solution[solution.length - 1], restrictions)) return solution;

  // Only reachable when phase 2 found nothing to do, which leaves phase 1's
  // last move as the solution's last move — an end `twoPhaseSolve` normally
  // delegates to phase 2. Re-solve with phase 1 carrying the restriction
  // itself. Whichever phase ends up supplying the final move now obeys it, so
  // this cannot recurse a third time.
  return twoPhaseSolve(state, restrictions, true);
}

/**
 * The restriction on the solution's *first* move belongs to phase 1 and the
 * one on its *last* move to phase 2 — except when a phase turns out to be
 * empty, in which case the end it owns is supplied by the other phase.
 * Phase 1 being empty is knowable before phase 2 runs; phase 2 being empty is
 * not, which is what `carryLastMoveRestrictionToPhase1` is for.
 */
function twoPhaseSolve(
  state: CubeState,
  restrictions: EndAxisRestrictions,
  carryLastMoveRestrictionToPhase1: boolean,
): FaceMove[] {
  const phase1Moves = phase1Search(
    state,
    endRestrictions(
      restrictions.firstMoveAxis,
      carryLastMoveRestrictionToPhase1 ? restrictions.lastMoveAxis : undefined,
    ),
  );
  const g1State = applyMoves(state, phase1Moves);
  const phase2Moves = phase2Search(
    g1State,
    endRestrictions(
      phase1Moves.length === 0 ? restrictions.firstMoveAxis : undefined,
      restrictions.lastMoveAxis,
    ),
  );
  return [...phase1Moves, ...phase2Moves];
}

/**
 * Draws a uniformly random, physically-reachable state and solves it. The
 * **scramble** returned to the caller is the *inverse* of that solution:
 * applying it to a solved cube reproduces the same random state a solver
 * would then have to undo — the same convention official WCA scramble
 * strings use.
 */
export function generate333Scramble(random: RandomSource): string {
  const state = randomState(random);
  const solution = solve333(state);
  return movesToString(inverseMoves(solution));
}

/** The 3x3x3, as the shared NxN facelet model counts it. */
export const CUBE_333_SIZE = 3;

/**
 * `generate333Scramble` with Regulation 4b3's two-move floor applied.
 *
 * The floor lives here rather than inside `generate333Scramble` on purpose.
 * `333bf` also calls `generate333Scramble`, and its floor has to be checked
 * *after* the orientation suffix is appended — a wide move moves the state as
 * well as reorienting it, so a sequence that qualified before the suffix need
 * not qualify after. Putting the check inside the generator would check the
 * blindfolded events at the wrong point, and then check them twice.
 *
 * The odds of the first draw failing are about `4 × 10^-19` (19 states within
 * one move of solved, out of `4.3 × 10^19`), so this changes no seeded output
 * that will ever be observed. That is not a reason to leave it out: 4b3 states
 * a requirement, not a likelihood.
 */
export function generate333ScrambleWithFloor(random: RandomSource): string {
  return withMinimumDistance(CUBE_333_SIZE, () => generate333Scramble(random));
}

/**
 * Registers `'333'` with the core scrambler registry. Called explicitly
 * (a real function call, not relied upon as an import-time side effect) —
 * see the note in `src/index.ts` for why that distinction matters.
 */
export function register333Scrambler(): void {
  registerScrambler(
    '333',
    (random) => generate333ScrambleWithFloor(random),
    'random-state',
    prepare333Tables,
  );
}

/**
 * Builds both search phases' move **and** pruning tables now.
 *
 * Shared by every event that reaches this solver — `333`, `333oh`, `333fm`, the
 * blindfolded events, and `444`, whose reduction hands off to `solve333`. The
 * builders are memoised, so preparing one of those events has already prepared the
 * others' shared cost.
 *
 * 🔴 **The pruning tables are the expensive half, and they live in their own
 * modules.** `buildPhase1Tables`/`buildPhase2Tables` build the *move* tables only.
 * Measured (2026-08-11): with just those two, `prepareEvent('333')` cost 624 ms and
 * the first scramble after it still cost **7719 ms** — so the helper looked like it
 * worked and did almost nothing. `prepare-event.test.ts` asserts the first scramble
 * after preparing is a small fraction of a cold one, which is what catches this.
 */
export function prepare333Tables(): void {
  buildPhase1Tables();
  buildPhase1PruningTables();
  buildPhase2Tables();
  buildPhase2PruningTables();
}
