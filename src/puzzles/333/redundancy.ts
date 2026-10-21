import { axisOf, type FaceMove } from '../../notation/move';

/**
 * Whether `move` would be redundant after the moves already made: `context`
 * first, then `path`, most recent last.
 *
 * The rule is the one `puzzles/nxn/random-moves.ts` states for the big cubes,
 * at single-layer granularity:
 *
 * > Within any run of consecutive moves on the same axis, no two moves may
 * > turn the same face.
 *
 * Moves on one axis commute, so a repeated face anywhere inside such a run can
 * be slid next to its twin and merged. That covers `R R'` and `R2 R'` (adjacent)
 * and also `R L R'`, where the two `R` turns meet through the opposite face.
 * Every one of them prints a sequence longer than the turn it performs.
 *
 * `context` is what makes this a fix rather than a restatement. Each phase of
 * the two-phase search used to prune only against its **own** previous move, so
 * phase 2 could open on the face phase 1 had just turned. The solution then
 * carried `… R2 | R' …`, and so did the scramble printed from its inverse. That
 * was measured at about one `333` scramble in ten (2026-10-21), and about one in
 * a hundred carried the opposite-face form. Phase 2 now passes phase 1's moves
 * as `context`, so the rule spans the boundary.
 */
export function isRedundantAfter(
  path: readonly FaceMove[],
  context: readonly FaceMove[],
  move: FaceMove,
): boolean {
  const axis = axisOf(move.face);
  for (let i = path.length + context.length - 1; i >= 0; i -= 1) {
    const previous = i >= context.length ? path[i - context.length]! : context[i]!;
    // The same-axis run ends here; nothing earlier can be slid next to `move`.
    if (axisOf(previous.face) !== axis) return false;
    if (previous.face === move.face) return true;
  }
  return false;
}
