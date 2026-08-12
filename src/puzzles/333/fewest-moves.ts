import { registerScrambler } from '../../core/scrambler-registry';
import { axisOf, inverseMoves, movesToString, parseMove } from '../../notation/move';
import type { RandomSource } from '../../random/random-source';
import { withMinimumDistance } from '../nxn/minimum';
import { randomState } from './random-state';
import { CUBE_333_SIZE, prepare333Tables, solve333 } from './solve';

/**
 * `333fm` — 3x3x3 Fewest Moves. **Not** the same scramble as `333`, which is
 * what this package used to emit for it.
 *
 * An official Fewest Moves scramble is a 3x3x3 scramble wrapped in `R' U' F`
 * at both ends. TNoodle — the official WCA scramble program — models it as a
 * puzzle of its own, `ThreeByThreeCubeFewestMovesPuzzle`, registered as
 * `THREE_FM` separately from `THREE`; this module is the equivalent here.
 *
 * ## Why the padding exists
 *
 * Two reasons, both quoted from the discussion TNoodle's source cites
 * (wca-admin, Tom Rokicki and Michael Young):
 *
 * 1. A two-phase solver's output has a visible orientation step in it. With
 *    EO-first methods, a competitor could read part of their own solution off
 *    the scramble. `R' U' F` is a quarter turn on all three axes, which
 *    guarantees at least one badly-oriented edge in every orientation, so
 *    "solving EO optimally can't be derived from the scramble".
 * 2. An easy state produces a short solution, and a visibly short scramble
 *    advertises an easy scramble before anyone touches the puzzle. Six extra
 *    moves make the printed sequence a normal length regardless. This is the
 *    same leak `core/scramble-shape.ts` describes for scramble *length*.
 *
 * ## Why it is not string concatenation
 *
 * The padding only works if it survives into the printed sequence. If the
 * inner scramble began with `F`, the sequence would read `… U' F F …`, a
 * competitor would merge it to `F2`, and both of the reasons above would be
 * partly undone. TNoodle prevents that by restricting the *axis* the solution
 * may begin and end on — the restriction reaches into generation, it is not a
 * filter applied afterwards. `search-restrictions.ts` explains why that
 * distinction is load-bearing for Regulation 4b3's "equal probability for each
 * state": a filter on the drawn state would exclude states permanently,
 * whereas restricting the route leaves every state reachable.
 *
 * TNoodle then assembles the three pieces with `MergingMode.NO_MERGING`,
 * which its own source documents as "blindly append moves". So does this —
 * `movesToString` is a plain join, and the restriction is what makes that
 * safe.
 */

/**
 * The padding, identical at both ends, exactly as TNoodle spells it. Written
 * as strings rather than as move objects because that is how a competitor sees
 * it and how the official program stores it.
 */
export const FEWEST_MOVES_PREFIX = "R' U' F";
export const FEWEST_MOVES_SUFFIX = "R' U' F";

const PREFIX_MOVES = FEWEST_MOVES_PREFIX.split(' ').map(parseMove);
const SUFFIX_MOVES = FEWEST_MOVES_SUFFIX.split(' ').map(parseMove);

/**
 * The two seams, derived from the padding rather than hard-coded, the same way
 * TNoodle derives them (`scramblePrefix[length - 1]` and `scrambleSuffix[0]`).
 * They are **different** axes, which is easy to get wrong: the inner
 * scramble's first move sits against the *last* move of the prefix (`F`), and
 * its last move sits against the *first* move of the suffix (`R'`).
 */
const SCRAMBLE_FIRST_MOVE_AXIS = axisOf(PREFIX_MOVES[PREFIX_MOVES.length - 1]!.face);
const SCRAMBLE_LAST_MOVE_AXIS = axisOf(SUFFIX_MOVES[0]!.face);

/**
 * The restrictions as the *solver* sees them, which are the two above swapped.
 *
 * The scramble is the inverse of the solution, so it is read back to front:
 * the scramble's first move is the inverse of the solution's **last** move,
 * and the scramble's last move is the inverse of the solution's **first**.
 * Inverting a move never changes its face, so an axis restriction carries over
 * unchanged apart from which end it applies to. Getting this the wrong way
 * round produces a scramble that looks correct and cancels at the other seam.
 */
const SOLUTION_RESTRICTIONS = {
  firstMoveAxis: SCRAMBLE_LAST_MOVE_AXIS,
  lastMoveAxis: SCRAMBLE_FIRST_MOVE_AXIS,
} as const;

/** The padded scramble for one draw, before the 4b3 floor is checked. */
function paddedFewestMovesScramble(random: RandomSource): string {
  const state = randomState(random);
  const inner = movesToString(inverseMoves(solve333(state, SOLUTION_RESTRICTIONS)));
  // The filter is for the one draw in 4.3 x 10^19 that comes out solved, whose
  // inner scramble is empty: `R' U' F R' U' F` with no double space in it.
  return [FEWEST_MOVES_PREFIX, inner, FEWEST_MOVES_SUFFIX].filter((part) => part !== '').join(' ');
}

/**
 * Regulation 4b3's two-move floor is checked on the **padded** sequence, not
 * on the drawn state — the same end of the process `variants.ts` checks the
 * blindfolded events at, and for the same reason. The padding moves the state
 * by six moves, so a draw that qualified before padding is not the thing
 * handed to a competitor.
 *
 * TNoodle checks at the same point: `Puzzle.generateWcaScramble` redraws while
 * `psag.state.solveIn(wcaMinScrambleDistance - 1) != null`, and for
 * `THREE_FM` the `psag` it tests is the one the `AlgorithmBuilder` returns
 * *after* the prefix and suffix have been appended.
 */
export function generate333FewestMovesScramble(random: RandomSource): string {
  return withMinimumDistance(CUBE_333_SIZE, () => paddedFewestMovesScramble(random));
}

/** Registers `'333fm'`. Called explicitly from `src/index.ts`, like every other puzzle. */
export function register333FewestMovesScrambler(): void {
  registerScrambler(
    '333fm',
    (random) => generate333FewestMovesScramble(random),
    'random-state',
    prepare333Tables,
  );
}
