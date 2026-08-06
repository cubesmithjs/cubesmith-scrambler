import { registerScrambler } from '../../core/scrambler-registry';
import { drawStateAtLeastMovesFromSolved } from '../../core/scramble-shape';
import type { RandomSource } from '../../random/random-source';
import {
  compressSquare1Moves,
  inverseSquare1Moves,
  square1MovesToString,
  type Square1Move,
} from './notation';
import { square1DistanceCappedAt } from './distance';
import { randomSquare1State } from './random-state';
import { phase1Solutions } from './phase1-search';
import { Phase2BudgetExceededError, phase2LowerBound, phase2Search } from './phase2-search';
import { applySquare1Moves, hasSquareLayers, isSquare1Solved, type Square1State } from './state';

/**
 * The Square-1 solver: phase 1 to square layers, phase 2 to solved.
 *
 * ## Why it sweeps phase-1 endings before deepening
 *
 * Phase 2 is optimal for whatever state phase 1 hands it, but *which* state
 * that is depends entirely on how phase 1 chose to get there — and the
 * difference is dramatic. The same puzzle, solved through two different phase-1
 * endings of the *same length*, took 41 milliseconds through one and 5.7
 * seconds through the other. Every extra pair of moves the phase-2 heuristic is
 * short by multiplies its tree by the ~32 groups available per node.
 *
 * So the solver does not insist on any one ending. It sweeps endings at a fixed
 * **relaxation**: first asking each for a phase-2 solution of exactly its lower
 * bound — one IDA\* iteration, usually under a millisecond — and only if a
 * whole sweep refuses does it allow two moves of slack, then four. Measured,
 * some ending in the first two or three tried is usually exact.
 *
 * The endings are produced **lazily**, one at a time, through a visitor that
 * stops the enumeration the moment a sweep succeeds. That is not a
 * micro-optimisation: enumerating a few hundred endings up front cost anywhere
 * from 150ms to 37 seconds depending on how many exist at the optimal length,
 * dwarfing the searches themselves. They are also diversified — at most a few
 * endings may share a first move — because a depth-first enumeration otherwise
 * returns near-identical endings that hand phase 2 near-identical states.
 *
 * ## The phase boundary
 *
 * Phase 1 may end on a turn and phase 2 begin with one. Concatenated, that is
 * two moves doing one move's work, so the result is passed through
 * `compressSquare1Moves`. (The 3x3x3 solver in this package has the analogous
 * seam and does *not* do this — noted, and left alone, because changing it
 * would change every 3x3x3 scramble a given seed produces.)
 */

export interface Square1SolveOptions {
  /** How many phase-1 endings to sweep. */
  readonly attempts?: number;
  /** How far past optimal to look for phase-1 endings, when optimal ones run out. */
  readonly extraPhase1Depth?: number;
  /** Nodes each bounded phase-2 attempt may expand before being abandoned. */
  readonly phase2NodeBudget?: number;
  /** Absolute ceiling on the whole solution. */
  readonly maxLength?: number;
  /** Slack over the phase-2 lower bound allowed on each sweep, in order. */
  readonly relaxations?: readonly number[];
  /** How many endings may share a first move; low keeps the endings varied. */
  readonly maxPerFirstMove?: number;
}

export class Square1UnsolvableError extends Error {
  constructor() {
    super('@cube/scrambler: no Square-1 solution found — the state is not one the puzzle reaches');
    this.name = 'Square1UnsolvableError';
  }
}

/**
 * A short solution taking `state` back to solved. Not guaranteed optimal — the
 * phase boundary gives that up — but each phase is optimal in itself.
 */
export function solveSquare1(
  state: Square1State,
  options: Square1SolveOptions = {},
): Square1Move[] {
  const attempts = options.attempts ?? 30;
  const extraPhase1Depth = options.extraPhase1Depth ?? 1;
  const budget = options.phase2NodeBudget ?? 300_000;
  const ceiling = options.maxLength ?? 40;
  const relaxations = options.relaxations ?? [0, 2, 4, 6, 10];
  const maxPerFirstMove = options.maxPerFirstMove ?? 3;

  for (const [sweep, relaxation] of relaxations.entries()) {
    // Later sweeps are rare, so they can afford to look harder and wider.
    const sweepBudget = relaxation >= 6 ? budget * 30 : budget;
    let solution: Square1Move[] | undefined;

    phase1Solutions(state, {
      maxSolutions: attempts,
      extraDepth: sweep === 0 ? 0 : extraPhase1Depth,
      maxPerFirstMove,
      visit: (moves) => {
        const opened = applySquare1Moves(state, moves);
        if (!hasSquareLayers(opened)) {
          throw new Error('@cube/scrambler: Square-1 phase 1 did not reach square layers');
        }
        const cap = Math.min(
          phase2LowerBound(opened) + relaxation,
          ceiling - moves.length,
        );
        const tail = attemptPhase2(opened, { maxLength: cap, nodeBudget: sweepBudget });
        if (!tail) return false;
        solution = compressSquare1Moves([...moves, ...tail]);
        return true;
      },
    });

    if (solution) return solution;
  }

  // Every bounded sweep was abandoned. Phase 2 is complete, so one unbounded
  // search on the shortest ending will finish — slowly, but it will finish,
  // which beats failing.
  const [fallback] = phase1Solutions(state, { maxSolutions: 1 });
  if (fallback) {
    const opened = applySquare1Moves(state, fallback);
    const tail = phase2Search(opened, {
      maxLength: ceiling - fallback.length,
      // Unbounded on purpose: this runs only when every sweep has been
      // abandoned, and a slow answer beats a thrown one.
      nodeBudget: Number.POSITIVE_INFINITY,
    });
    if (tail) return compressSquare1Moves([...fallback, ...tail]);
  }

  throw new Square1UnsolvableError();
}

function attemptPhase2(
  state: Square1State,
  options: { maxLength: number; nodeBudget: number },
): Square1Move[] | undefined {
  if (options.maxLength < 0) return undefined;
  try {
    return phase2Search(state, options);
  } catch (error) {
    if (error instanceof Phase2BudgetExceededError) return undefined;
    throw error;
  }
}

/** WCA Regulation 4b3d: a Square-1 scramble's state must require at least 11 moves to solve. */
export const MIN_SQUARE1_SOLVE_DISTANCE = 11;

/**
 * Draws a uniformly random Square-1 position far enough from solved to be a
 * legal scramble, solves it, and returns the inverse.
 *
 * Both clauses of Regulation 4b3d are covered, and neither by a patch-up:
 *
 * - *"at least 11 moves to solve"* — by redrawing until an **exact** check says
 *   so (`distance.ts`), which keeps the surviving draws uniform because the
 *   conditional distribution of a uniform draw is uniform on the condition.
 * - *"must allow a `/` move without a prior (X, Y) move"* — by construction:
 *   only twistable shapes are ever drawn (`random-state.ts`).
 *
 * Unlike the smaller puzzles here, there is no padding to a presentable length.
 * That rule exists so a visibly short sequence cannot advertise an easy scramble
 * on a printed sheet; Square-1 solutions come out at 18-28 moves, far above any
 * floor worth setting, and their length is dominated by the phase split rather
 * than by how scrambled the puzzle is.
 */
export function generateSquare1Scramble(random: RandomSource): string {
  const state = drawStateAtLeastMovesFromSolved(
    random,
    randomSquare1State,
    // Exact below the threshold and honest above it: the value is either a
    // distance actually achieved or a proof that none that short exists.
    (candidate) => square1DistanceCappedAt(candidate, MIN_SQUARE1_SOLVE_DISTANCE - 1),
    MIN_SQUARE1_SOLVE_DISTANCE,
  );
  return square1MovesToString(inverseSquare1Moves(solveSquare1(state)));
}

/**
 * Registers `'sq1'` with the core scrambler registry. Called explicitly — see
 * the note in `src/index.ts` for why that distinction matters.
 */
export function registerSquare1Scrambler(): void {
  registerScrambler('sq1', (random) => generateSquare1Scramble(random));
}

/** Whether a sequence really solves a state — the check every test ends with. */
export function square1SolutionSolves(
  state: Square1State,
  moves: readonly Square1Move[],
): boolean {
  return isSquare1Solved(applySquare1Moves(state, moves));
}
