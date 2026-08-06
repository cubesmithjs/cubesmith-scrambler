import type { RandomSource } from '../random/random-source';

/**
 * Two rules that shape a random-state scramble beyond "draw a state and
 * invert its solution", both external to any one puzzle's mechanics.
 *
 * ## 1. A minimum number of moves to solve — WCA Regulation 4b3
 *
 * > An official scramble sequence must produce a random state from all
 * > states that require at least 2 moves to solve (equal probability for
 * > each state).
 *
 * with per-puzzle exceptions: **2x2x2 at least 4** (4b3b), **Skewb at least
 * 7** (4b3c), **Square-1 at least 11** (4b3d), **Pyraminx at least 6**
 * (4b3f). Small puzzles are the ones that need it — a 2-move 2x2x2 scramble
 * is a lottery ticket, not a solve.
 *
 * The regulation's own parenthetical is the important part: *equal
 * probability for each state*, over the states that qualify. Redrawing until
 * the drawn state qualifies gives exactly that — the conditional
 * distribution of a uniform draw is uniform on the condition — whereas
 * "patch the state until it's far enough away" would not.
 *
 * ## 2. A minimum scramble *length*, which is a different thing entirely
 *
 * The regulation constrains the state; it says nothing about how long the
 * printed sequence is. But a scrambler that always prints the optimal
 * solution leaks the state's difficulty: on a scramble sheet, a visibly
 * short sequence advertises an easy scramble before anyone has touched the
 * puzzle. WCA's own scrambler pads to 11 moves for exactly this reason —
 * see `worldcubeassociation.org/incidents/28`, where a bug that let Skewb
 * sequences come out short was treated as an incident precisely because
 * "the truncation did not preserve the random scramble distribution".
 *
 * Padding is done by asking the solver for a solution of a given exact
 * length rather than the shortest one, so the state reached is unchanged and
 * still uniformly random — the sequence is simply a longer route to it. See
 * each puzzle's `solve*InExactly`.
 */

/**
 * The base case of rule 1, for puzzles too large to have a distance function:
 * **at least two moves to solve**, which is what 4b3 asks of every event with
 * no exception of its own — and, via 4b3e, of the random-*moves* events too.
 *
 * Two moves is the one threshold that needs no solver: a state is closer than
 * that exactly when it is already solved, or when a single move solves it. So
 * this is one solvedness test plus one per move, and it applies equally to a
 * 3x3x3 and to a 7x7x7.
 *
 * Rejecting on it keeps the draw uniform for the same reason every other filter
 * here does — the conditional distribution of a uniform draw is uniform on the
 * condition.
 */
export function isAtLeastTwoMovesFromSolved<TState, TMove>(
  state: TState,
  moves: readonly TMove[],
  apply: (state: TState, move: TMove) => TState,
  isSolved: (state: TState) => boolean,
): boolean {
  if (isSolved(state)) return false;
  return !moves.some((move) => isSolved(apply(state, move)));
}

/** Draws until the state is at least `minimumMoves` from solved, keeping the draw uniform over the states that qualify. */
export function drawStateAtLeastMovesFromSolved<TState>(
  random: RandomSource,
  draw: (random: RandomSource) => TState,
  distance: (state: TState) => number,
  minimumMoves: number,
): TState {
  for (;;) {
    const state = draw(random);
    if (distance(state) >= minimumMoves) return state;
  }
}

/**
 * The shortest solution of length at least `minimumLength`. Tries that
 * length first and steps up only if no sequence of exactly that length
 * exists — which can happen, since a fixed length is a much stronger
 * demand than an upper bound.
 */
export function solveAtLeastLength<TMove>(
  optimalLength: number,
  minimumLength: number,
  solveInExactly: (length: number) => TMove[] | null,
): TMove[] {
  // The floor is whichever is larger: a solution can never be shorter than
  // optimal, and a scramble should not be shorter than presentable.
  const start = Math.max(optimalLength, minimumLength);
  const limit = start + 8;
  for (let length = start; length <= limit; length += 1) {
    const solution = solveInExactly(length);
    if (solution) return solution;
  }
  throw new Error(`solveAtLeastLength: no solution of length ${start}..${limit} exists`);
}
