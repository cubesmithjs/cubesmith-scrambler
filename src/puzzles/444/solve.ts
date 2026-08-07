import { isAtLeastTwoMovesFromSolved } from '../../core/scramble-shape';
import { registerScrambler } from '../../core/scrambler-registry';
import type { RandomSource } from '../../random/random-source';
import { solve333 } from '../333/solve';
import { inverseWideMoves, wideMovesToString } from '../nxn/notation';
import { randomCube444State } from './coordinates';
import { is333Reachable, parityOf444Handoff, to333State } from './handoff';
import { pairWings444 } from './pairing';
import { oddWingGadget } from './parity';
import { reduce444 } from './reduce';
import { apply444Moves, is444Solved, move444Tables, type Cube444State } from './state';

/**
 * The 4x4x4 solver: reduce, fix parity with two derived gadgets, hand the rest to the
 * 3x3x3 solver.
 *
 * ## The pipeline
 *
 * 1. **Reduce** — centres solved, wings paired (`reduce444`).
 * 2. **Parity**, while the hand-off is outside the 3x3x3 subgroup: apply the wing-odd
 *    gadget, which breaks the pairing, then pair again. Each pass flips the flip-parity
 *    -- pairing generates `A24` and so cannot undo it -- and lands the dedges on a
 *    fresh paired arrangement, which is what eventually resolves a permutation
 *    mismatch. `parity.ts` records why the targeted gadget for that second case cannot
 *    exist.
 * 3. **Hand off** to `solve333` and translate its moves back to outer turns.
 *
 * ## Why any of this is allowed
 *
 * Everything here runs after the state is drawn and never modifies it: the solver only
 * looks for a *witness* that this state can be solved. §11 of the design document is
 * the argument in full — the distribution is fixed by the draw, and a longer or
 * differently-shaped witness encodes the same state just as exactly. What would bias
 * the output is redrawing the *state* when the solver struggles, which is why every
 * failure below is thrown rather than retried.
 */
/** How many gadget-and-repair passes to try before calling it a bug. */
const MAX_PARITY_PASSES = 8;

/** How many gadgets to try within one pass before settling for the first. */
const PARITY_CANDIDATES = 6;

export class Solve444Error extends Error {
  constructor(message: string) {
    super(`@cubesmith/scrambler: ${message}`);
    this.name = 'Solve444Error';
  }
}

/** A 3x3x3 move as a 4x4x4 outer-turn index. */
function outerIndex(face: string, amount: number): number {
  const index = move444Tables().findIndex(
    (table) =>
      table.move.depth === 1 && table.move.face === face && table.move.amount === amount,
  );
  if (index < 0) throw new Solve444Error(`no 4x4x4 outer move for ${face}${amount}`);
  return index;
}

/**
 * A sequence of move indices carrying `state` to solved.
 *
 * Not optimal and not near it — roughly a hundred and forty moves where an optimal
 * solution runs under forty. That is the documented compromise of the first
 * implementation, and it costs length only.
 */
export function solve444(state: Cube444State): number[] {
  const reduction = reduce444(state);
  const moves = [...reduction.moves];
  let current = reduction.state;

  // Each pass flips the flip-parity and lands the dedges on a fresh paired arrangement,
  // so reachability is reached by iterating rather than by a targeted fix -- see
  // `parity.ts` on why the targeted fix for the permutation mismatch does not exist.
  //
  // Within a pass, several gadgets are tried and the first that lands *reachable* is
  // the one committed. Taking the pass-indexed gadget blindly worked but cost dearly:
  // 341 moves on average against 130 for this, because a blind pass that does not
  // finish the job still adds a gadget and a whole fresh pairing to the answer.
  for (let pass = 0; !is333Reachable(to333State(current)); pass += 1) {
    if (pass >= MAX_PARITY_PASSES) {
      throw new Solve444Error(
        `4x4x4 parity unresolved after ${MAX_PARITY_PASSES} passes ` +
          `(${parityOf444Handoff(to333State(current))})`,
      );
    }

    let chosen: { moves: number[]; state: Cube444State } | undefined;
    for (let candidate = 0; candidate < PARITY_CANDIDATES; candidate += 1) {
      const gadget = oddWingGadget(pass * PARITY_CANDIDATES + candidate);
      const disturbed = apply444Moves(current, gadget);
      const repaired = pairWings444(disturbed);
      const landed = apply444Moves(disturbed, repaired.moves);
      const attempt = { moves: [...gadget, ...repaired.moves], state: landed };
      // Keep the first candidate as the fallback, so a pass always makes progress.
      chosen ??= attempt;
      if (is333Reachable(to333State(landed))) {
        chosen = attempt;
        break;
      }
    }

    moves.push(...chosen!.moves);
    current = chosen!.state;
  }

  const handoff = to333State(current);
  if (!is333Reachable(handoff)) {
    throw new Solve444Error(
      `4x4x4 parity fix left the cube unreachable (${parityOf444Handoff(handoff)})`,
    );
  }

  for (const move of solve333(handoff)) {
    moves.push(outerIndex(move.face, move.amount));
  }

  if (!is444Solved(apply444Moves(state, moves))) {
    // The hand-off is a homomorphism over outer turns and outer turns preserve
    // reduction, so a solved abstraction on a reduced cube is a solved cube. If this
    // fires, one of those two facts has stopped holding.
    throw new Solve444Error('4x4x4 solution does not solve the cube');
  }
  return moves;
}

/**
 * A scramble string: a uniformly random state, printed as the **inverse** of its
 * solution, which is the convention every event in this package follows.
 *
 * The 4b3 two-move floor is applied by rejection **on the drawn state**, before any
 * solving. That is the exact test — a state fewer than two moves from solved is either
 * solved or one move from it, both of which are one comparison each — and exactness is
 * what keeps the rejection uniformity-preserving. Rejecting on an estimate would
 * quietly drop qualifying states, which §11 of the design document treats as the trap
 * to avoid.
 */
export function generate444Scramble(random: RandomSource): string {
  const tables = move444Tables();
  const allMoves = tables.map((table) => table.move);

  for (let draw = 0; draw < 64; draw += 1) {
    const state = randomCube444State(random);
    if (
      !isAtLeastTwoMovesFromSolved(
        state,
        tables.map((_, index) => index),
        (from, move) => apply444Moves(from, [move]),
        is444Solved,
      )
    ) {
      continue;
    }
    const solution = solve444(state).map((index) => allMoves[index]!);
    return wideMovesToString(inverseWideMoves(solution));
  }
  // 64 consecutive draws inside two moves of solved is not luck; something is wrong
  // with the draw, and silently looping for ever would hide it.
  throw new Solve444Error('4x4x4 draw never cleared the two-move floor');
}

/** Registers `'444'` with the core scrambler registry. */
export function register444Scrambler(): void {
  registerScrambler('444', (random) => generate444Scramble(random));
}
