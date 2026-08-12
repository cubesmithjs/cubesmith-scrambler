import { isAtLeastTwoMovesFromSolved } from '../../core/scramble-shape';
import { registerScrambler } from '../../core/scrambler-registry';
import type { RandomSource } from '../../random/random-source';
import { prepare333Tables, solve333 } from '../333/solve';
import { centreTable } from './centres';
import { centrePairTable, AXIS_PAIRS } from './phase1';
import { singleEdgeTable } from './wing-pairs';
import { mergeWideMoves } from '../nxn/cancel';
import { inverseWideMoves, wideMovesToString, type WideMove } from '../nxn/notation';
import { randomCube444State } from './coordinates';
import { is333Reachable, parityOf444Handoff, to333State } from './handoff';
import { pairWings444 } from './pairing';
import { oddWingGadget, prepareOddWingGadgets } from './parity';
import { reduce444BestRoute } from './reduce';
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

/**
 * The gadget paired with `index` when a pass has to carry two of them.
 *
 * A stride coprime with the pool size, so the partner is always a *different*
 * gadget and every `index` gets a different pair — two copies of one gadget would
 * compose to something wing-even, which is precisely what the doubled pass exists
 * to avoid.
 */
function partnerGadget(index: number): number {
  return (index + 17) % (MAX_PARITY_PASSES * PARITY_CANDIDATES);
}

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

let indexByMove: Map<string, number> | undefined;

/** The move-table index of a `WideMove`, for translating a merged sequence back. */
function moveIndexOf(move: WideMove): number {
  indexByMove ??= new Map(
    move444Tables().map((table, index) => [
      `${table.move.face}${table.move.depth}${table.move.amount}`,
      index,
    ]),
  );
  const index = indexByMove.get(`${move.face}${move.depth}${move.amount}`);
  if (index === undefined) {
    throw new Solve444Error(`no 4x4x4 move for ${move.face} depth ${move.depth} x${move.amount}`);
  }
  return index;
}

/**
 * The concatenated phases, with the redundancy the joins leave behind removed.
 *
 * Each phase hands back a sub-solution that is canonical on its own, and nothing
 * looks across a join — so one phase's last move lands against the next phase's
 * first and the two frequently compose. Measured before this existed: **30
 * redundant moves across four scrambles**, up to 13 in one.
 *
 * `mergeWideMoves` only rewrites identities, so the merged sequence lands in
 * exactly the same state — and `solve444` runs its `is444Solved` check on the
 * merged sequence rather than the raw one, so that is verified on every solve
 * rather than argued.
 */
function mergeMoveIndices(moves: readonly number[]): number[] {
  const tables = move444Tables();
  const merged = mergeWideMoves(moves.map((index) => tables[index]!.move));
  return merged.map(moveIndexOf);
}

/**
 * A sequence of move indices carrying `state` to solved.
 *
 * Not optimal and not near it: **74 to 172 moves, mean 119**, measured over 16 states
 * (2026-08-12), where TNoodle-WCA-1.2.3 prints 42 to 46. It costs length only — the
 * state is drawn before any of this runs, and the χ² check over the sticker
 * distribution reads 5.02 against df 5 after these changes as it did before them.
 *
 * That is down from a mean of 154 raw, and four things did it, each measured:
 *
 * 1. **Cancelling across the phase joins** (`mergeMoveIndices`) — 154 → 137. Free.
 * 2. **Choosing the reduction route** (`reduce444BestRoute`) — 137 → 127. Which parity
 *    case the reduction lands in is a property of the route rather than of the state,
 *    and 6 states in 10 have a route needing no parity work at all. This is where the
 *    solve's extra time goes.
 * 3. **Gadgets shortest-first** (`oddWingGadget`) — the pool averages 19 moves in
 *    discovery order and 15.9 taken shortest-first.
 * 4. **The doubled pass** for a `permutation` landing, which provably cannot finish in
 *    one gadget.
 *
 * What is left is the architecture, not a defect: a centre-neutral pairing generator
 * runs about ten moves where a human's slice-flip-slice runs four, and that is the
 * price of reducing in stages. Closing to TNoodle's band needs a pruning-table search
 * over the reduced state — §12 of `docs/444-design.md`.
 */
export function solve444(state: Cube444State): number[] {
  const reduction = reduce444BestRoute(state);
  const moves = [...reduction.moves];
  let current = reduction.state;

  // Each pass flips the flip-parity and lands the dedges on a fresh paired arrangement,
  // so reachability is reached by iterating rather than by a targeted fix -- see
  // `parity.ts` on why the targeted fix for the permutation mismatch does not exist,
  // and on why a wing-**even** disturber cannot stand in for the gadget either.
  //
  // Reaching this loop at all is now the exception rather than the rule: `reduce444BestRoute`
  // picks the route whose landing costs the fewest passes, and most states have one that
  // costs none.
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

    // 🔴 A `permutation` landing needs an **even** number of odd gadgets, so a pass
    // carrying one can never finish it. Measured over 6 such states x 24 gadgets: all
    // 144 attempts landed in `both` or `flip`, never `none`. Rather than pay a whole
    // second pairing to discover that again, such a pass carries two gadgets at once —
    // which resolved 66 of 120 attempts at a mean 86.6 moves against the 114 two full
    // passes cost. Six candidates make a failure a 0.8% event, and the loop still
    // catches it.
    const doubled = parityOf444Handoff(to333State(current)) === 'permutation';

    let chosen: { moves: number[]; state: Cube444State } | undefined;
    for (let candidate = 0; candidate < PARITY_CANDIDATES; candidate += 1) {
      const at = pass * PARITY_CANDIDATES + candidate;
      const gadget = doubled
        ? [...oddWingGadget(at), ...oddWingGadget(partnerGadget(at))]
        : oddWingGadget(at);
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

  const solution = mergeMoveIndices(moves);
  if (!is444Solved(apply444Moves(state, solution))) {
    // The hand-off is a homomorphism over outer turns and outer turns preserve
    // reduction, so a solved abstraction on a reduced cube is a solved cube. If this
    // fires, one of those two facts has stopped holding — or the merge did, which is
    // exactly why the check runs on the merged sequence rather than the raw one.
    throw new Solve444Error('4x4x4 solution does not solve the cube');
  }
  return solution;
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

/**
 * Builds the shared tables the 4x4x4 pipeline consults — the move tables, the centre
 * and centre-pair tables, the single-edge table, and the 3x3x3 phase tables the
 * hand-off reaches.
 *
 * This is the event the helper exists for: a cold `444` scramble measured
 * **15,382 ms** in a fresh process against 241 ms warm (2026-08-11), and most of that
 * difference is these tables. Every builder is memoised, so calling this twice is
 * cheap.
 *
 * **Re-measured 2026-08-12**, after task 03 changed what a solve does: this call costs
 * **15.6 s**, the first solve after it **14.8 s**, and a warm solve **4.6 s** (16 states,
 * same machine). The warm figure is up from 2.5 s and that is the deliberate price of
 * `reduce444BestRoute` trying several reduction routes — see `solve444`, which records
 * what the length bought. The first-solve figure is up for the same reason compounded:
 * every extra route touches more of the per-group wing-pair tables that are left lazy
 * below, so the event that already did not fully prepare now under-prepares a little
 * more.
 *
 * 🔴 **Two things are deliberately left lazy, and `444` is therefore the one event
 * where preparing does not make the first scramble as fast as the tenth.** Both were
 * measured rather than assumed (2026-08-11):
 *
 * - **The per-group wing-pair tables.** `wingPairTable` is memoised per group and one
 *   reduction touches a subset, so building all six costs about **8.5 s** of work a
 *   single scramble does not need — and measurably makes the *total* worse (prepare
 *   18.5 s + first scramble 4.9 s, against 11.6 s + 4.5 s without). `prepareEvent`
 *   moving cost around is the point; making there be more of it is not.
 * - **The centre-generator library.** `generatorLibrary()` is a search, not a table,
 *   and pre-building it costs far more than a first scramble does.
 *
 * So the honest claim for `444`: this front-loads the **shared table** cost and leaves
 * per-state search and lazily-built per-group tables to the first draw. Every other
 * event's preparer leaves its first scramble within a few milliseconds of a warm one;
 * this one leaves about ten seconds of it.
 *
 * It also builds the **odd-wing gadget pool** (`prepareOddWingGadgets`), which is a
 * search rather than a table and is shared by every solve in the process, so charging
 * it to whichever scramble happened to be first would be the same mistake in miniature.
 */
export function prepare444Tables(): void {
  move444Tables();
  prepareOddWingGadgets();
  centreTable();
  for (let index = 0; index < AXIS_PAIRS.length; index += 1) centrePairTable(index);
  singleEdgeTable();
  // The reduction hands off to `solve333`, so its tables are part of a 4x4x4
  // scramble's cost whether or not anyone asked for a 3x3x3.
  prepare333Tables();
}

/** Registers `'444'` with the core scrambler registry. */
export function register444Scrambler(): void {
  registerScrambler('444', (random) => generate444Scramble(random), 'random-state', prepare444Tables);
}
