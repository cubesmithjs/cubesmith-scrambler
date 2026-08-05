import { bench, describe } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { phase1Solutions } from './phase1-search';
import { phase2Search } from './phase2-search';
import {
  phase2BackwardTable,
  phase2CornerPruning,
  phase2MoveTables,
} from './phase2-tables';
import { phase1Table } from './phase1-tables';
import { randomSquare1State } from './random-state';
import { solveSquare1 } from './solve';
import { applySquare1Moves } from './state';

/**
 * Square-1 costs, measured rather than estimated. Two numbers matter and they
 * pull against each other:
 *
 * - **Startup.** Every table is built lazily on first use and then kept, so the
 *   first scramble pays for all of them and no later one pays anything. On this
 *   machine that is roughly twelve seconds, of which the backward table is half.
 * - **Per solve.** Once warm, a uniformly random state solves in ~140ms at the
 *   median, with a tail into the low seconds when the phase-2 heuristic is far
 *   from the truth for every ending tried.
 *
 * The startup/throughput trade is real and was measured both ways: dropping the
 * backward table's radius from 8 to 7 takes startup from ~12s to ~7.5s and the
 * median solve from ~140ms to ~205ms. Radius 8 is kept because a scrambler
 * generates many scrambles per process, so throughput is worth more than first
 * answer latency.
 */

const random = createRandomSource('square-1 bench');
const warmup = randomSquare1State(random);

describe('square-1 table construction', () => {
  // Each of these is memoised, so the benchmark reports the *warm* cost. The
  // cold cost is stated above; measuring it here would report only the first
  // iteration and average it away.
  bench('move tables (warm)', () => {
    phase2MoveTables();
  });

  bench('pruning table (warm)', () => {
    phase2CornerPruning();
  });

  bench('backward table (warm)', () => {
    phase2BackwardTable();
  });

  bench('phase-1 distance table (warm)', () => {
    phase1Table();
  });
});

describe('square-1 phases', () => {
  const states = Array.from({ length: 16 }, () => randomSquare1State(random));
  let at = 0;

  bench('phase 1 only, first ending', () => {
    phase1Solutions(states[at++ % states.length]!);
  });

  const openings = states.map((state) => {
    const [ending] = phase1Solutions(state);
    return applySquare1Moves(state, ending ?? []);
  });
  let opening = 0;

  bench('phase 2 only, optimal', () => {
    try {
      phase2Search(openings[opening++ % openings.length]!, { nodeBudget: 5_000_000 });
    } catch {
      // A budget-exceeded state is part of the distribution being measured, not
      // an error: the solver's answer to one is to try a different ending.
    }
  });
});

describe('square-1 solve', () => {
  // Warm every table before timing anything, so the first iteration is not an
  // outlier that swamps the rest.
  solveSquare1(warmup);

  bench('solve a uniformly random state', () => {
    solveSquare1(randomSquare1State(random));
  });
});
