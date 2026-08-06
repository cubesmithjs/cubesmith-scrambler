import { solve333 } from '../333/solve';
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
const MAX_PARITY_PASSES = 24;

export class Solve444Error extends Error {
  constructor(message: string) {
    super(`@cube/scrambler: ${message}`);
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
  for (let pass = 0; !is333Reachable(to333State(current)); pass += 1) {
    if (pass >= MAX_PARITY_PASSES) {
      throw new Solve444Error(
        `4x4x4 parity unresolved after ${MAX_PARITY_PASSES} passes ` +
          `(${parityOf444Handoff(to333State(current))})`,
      );
    }
    // A different gadget each pass: with one gadget the loop provably cycles.
    const gadget = oddWingGadget(pass);
    moves.push(...gadget);
    current = apply444Moves(current, gadget);
    // The gadget unpairs; pairing puts it back without touching the centres, and cannot
    // undo the parity change because every generator it uses is even.
    const repaired = pairWings444(current);
    moves.push(...repaired.moves);
    current = apply444Moves(current, repaired.moves);
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
