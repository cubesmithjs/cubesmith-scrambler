import { axisOf, type Axis, type FaceMove } from '../../notation/move';

/**
 * A constraint on which face a solution is allowed to *begin* or *end* on,
 * expressed as a forbidden axis.
 *
 * This exists so a caller can stop a solution from cancelling against
 * something the caller intends to concatenate it with. The only such caller
 * today is Fewest Moves (`fewest-moves.ts`), which pads every scramble with
 * `R' U' F` at both ends and needs the padding to survive intact.
 *
 * The important property is that this constrains the **route**, never the
 * **state**. Both searches keep looking until they find a solution that obeys
 * the restriction, so every state still gets solved and none is skipped. That
 * is what keeps the scramble distribution uniform, and it is why the
 * restriction has to live inside the search rather than in a filter wrapped
 * around it: filtering the *drawn state* on a property of its solution would
 * exclude a state permanently, which Regulation 4b3's "equal probability for
 * each state" does not allow.
 */
export interface EndAxisRestrictions {
  /** The first move of the solution may not turn a face on this axis. */
  readonly firstMoveAxis?: Axis;
  /** The last move of the solution may not turn a face on this axis. */
  readonly lastMoveAxis?: Axis;
}

/** No restriction at either end — the shape every unrestricted caller gets. */
export const NO_END_RESTRICTIONS: EndAxisRestrictions = {};

/**
 * Builds a restriction set from two values that may or may not be present,
 * **omitting** an absent end rather than setting it to `undefined`. The
 * package compiles with `exactOptionalPropertyTypes`, under which those two
 * are different things and only the first is assignable to `?: Axis`.
 */
export function endRestrictions(first?: Axis, last?: Axis): EndAxisRestrictions {
  const restrictions: { firstMoveAxis?: Axis; lastMoveAxis?: Axis } = {};
  if (first !== undefined) restrictions.firstMoveAxis = first;
  if (last !== undefined) restrictions.lastMoveAxis = last;
  return restrictions;
}

/** Whether `move` is barred from opening a solution under `restrictions`. */
export function isForbiddenFirstMove(move: FaceMove, restrictions: EndAxisRestrictions): boolean {
  return (
    restrictions.firstMoveAxis !== undefined && axisOf(move.face) === restrictions.firstMoveAxis
  );
}

/**
 * Whether `move` is barred from closing a solution under `restrictions`.
 *
 * `undefined` — an empty solution — is never forbidden: there is no move at
 * the seam to cancel with, so the restriction is vacuous rather than violated.
 */
export function isForbiddenLastMove(
  move: FaceMove | undefined,
  restrictions: EndAxisRestrictions,
): boolean {
  if (move === undefined) return false;
  return restrictions.lastMoveAxis !== undefined && axisOf(move.face) === restrictions.lastMoveAxis;
}
