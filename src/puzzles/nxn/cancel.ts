import type { Amount } from '../../notation/move';
import { moveAxis, moveLayerSet, type WideMove } from './notation';

/**
 * Removes redundancy from a move sequence without changing where it ends up.
 *
 * The sibling of `random-moves.ts`'s `isRedundantMove`, which *detects* exactly
 * this and refuses to emit it. That rule is the one to read for why "same face"
 * is the wrong test and "same layer set within a run on one axis" is the right
 * one: moves on one axis commute, so two turns of the same layer set anywhere
 * inside such a run can be brought together and merged. `R Rw R'` is as
 * redundant as `R R'`; `R L R'` is not redundant at all.
 *
 * ## Why a solver needs this and a random-moves generator does not
 *
 * A random-moves event never produces redundancy, because `randomMoveSequence`
 * declines to draw it. A **staged** solver produces it constantly: each phase
 * hands back a sub-solution that is sensible on its own, and concatenating them
 * puts one phase's last move against the next phase's first with nothing looking
 * across the join. `solve444` had 30 redundant moves across four scrambles that
 * way.
 *
 * ## It cannot change the state, so it cannot change the distribution
 *
 * Every rewrite here is an identity: two turns of one layer set replaced by the
 * single turn they compose to, or dropped when they compose to nothing. The
 * sequence is shorter and lands in exactly the same place, which is what lets a
 * random-state generator use it freely — §11 of `docs/444-design.md` is the
 * argument in full, and `solve444`'s own `is444Solved` check verifies it on the
 * merged sequence rather than the raw one.
 *
 * ## Why it iterates to a fixpoint
 *
 * A single pass is not enough. Cancelling `R … R'` to nothing can leave two
 * moves that were separated by it now adjacent and mergeable in turn, and that
 * can cascade. Sequences here are a few hundred moves at most, so running the
 * pass until nothing changes costs nothing worth optimising.
 */

/** One merging pass. Returns the same array instance only when nothing changed. */
function mergePass(moves: readonly WideMove[]): WideMove[] | undefined {
  const out: WideMove[] = [];
  let changed = false;

  for (const move of moves) {
    const axis = moveAxis(move);
    const layerSet = moveLayerSet(move);
    let merged = false;

    for (let index = out.length - 1; index >= 0; index -= 1) {
      const earlier = out[index]!;
      // The run of same-axis moves ends here, so nothing before it can be
      // reordered next to this move.
      if (moveAxis(earlier) !== axis) break;
      if (moveLayerSet(earlier) !== layerSet) continue;

      const amount = (earlier.amount + move.amount) % 4;
      if (amount === 0) out.splice(index, 1);
      else out[index] = { face: move.face, depth: move.depth, amount: amount as Amount };
      merged = true;
      changed = true;
      break;
    }

    if (!merged) out.push(move);
  }

  return changed ? out : undefined;
}

/** `moves` with every redundancy removed, landing in exactly the same state. */
export function mergeWideMoves(moves: readonly WideMove[]): WideMove[] {
  let current = [...moves];
  for (;;) {
    const next = mergePass(current);
    if (!next) return current;
    current = next;
  }
}
