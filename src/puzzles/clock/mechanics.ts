/**
 * The Clock's mechanism, and the one structural fact everything else here
 * rests on.
 *
 * ## The puzzle
 *
 * Eighteen dials — a 3x3 grid on each side — each with twelve positions, and
 * four pins at the corners. A pin that is up on one side is down on the
 * other. Per the puzzle's mechanism, a pin's state decides whether *that
 * corner's clock is geared to its three neighbouring clocks on the front or
 * on the back*. Turning a wheel therefore drives every clock in the
 * connected group its corner belongs to on the side it is currently geared
 * to.
 *
 * All four corner quadrants overlap at the centre clock, so on a given side
 * the geared corners are always a single group: turning any one of them
 * turns that corner, every other geared corner, and every clock adjacent to
 * any of them. That is the whole rule, and every notation token below is a
 * special case of it.
 *
 * Corner clocks pass right through the puzzle and show on both sides at
 * once, so there are `9 + 9 - 4 = 14` independent dials, giving the
 * published `12^14 = 1,283,918,464,548,864` states.
 *
 * ## Why this puzzle has no search in it
 *
 * Every move is an *addition* in `Z12` on a fixed set of dials. Nothing is
 * permuted, so the group is abelian and the whole puzzle is linear algebra
 * over `Z12` rather than a search problem — the only puzzle in this package
 * for which that's true, and the reason there is no pruning table, no IDA*
 * and no state-space BFS anywhere in this module.
 *
 * The consequence that matters: the official fourteen-token scramble
 * template is a *basis*. The 14x14 matrix of its tokens' effects has
 * determinant ±1 (checked in `mechanics.test.ts`, not assumed here), so it
 * is invertible over `Z12` — every state is reachable, by exactly one choice
 * of the fourteen amounts. Generating a uniformly random Clock state is
 * therefore nothing more than drawing fourteen uniform hours, and solving
 * one is a single matrix multiply.
 */

import { CLOCK_HOURS, PIN_SET_CORNERS, type ClockCorner, type ClockPinSet } from './notation';

export const DIALS_PER_SIDE = 9;

/**
 * Dial slots on one side, row-major:
 *
 * ```
 *   0 UL   1 U   2 UR
 *   3 L    4 C   5 R
 *   6 DL   7 D   8 DR
 * ```
 */
export const CORNER_SLOT: Readonly<Record<ClockCorner, number>> = {
  UL: 0,
  UR: 2,
  DL: 6,
  DR: 8,
};

export const CORNER_SLOTS: readonly number[] = [0, 2, 6, 8];

/** The five non-corner slots — the only dials that differ between the two sides. */
export const NON_CORNER_SLOTS: readonly number[] = [1, 3, 4, 5, 7];

/**
 * Flipping the puzzle over (`y2`) mirrors left-to-right, so the dial behind
 * slot `i` is at slot `MIRROR_SLOT[i]` in the other side's own frame.
 */
export const MIRROR_SLOT: readonly number[] = [2, 1, 0, 5, 4, 3, 8, 7, 6];

/**
 * The three clocks each corner is geared to — its two edge neighbours and
 * the centre. Derived from grid adjacency rather than listed by hand, so
 * the "corner plus its three neighbours" quadrant can't be mistyped.
 */
export const CORNER_NEIGHBOUR_SLOTS: Readonly<Record<ClockCorner, readonly number[]>> = (() => {
  const entry = (corner: ClockCorner): readonly number[] => {
    const slot = CORNER_SLOT[corner];
    const row = Math.floor(slot / 3);
    const column = slot % 3;
    const neighbours: number[] = [];
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        const other = r * 3 + c;
        if (other === slot) continue;
        if (Math.abs(r - row) <= 1 && Math.abs(c - column) <= 1) neighbours.push(other);
      }
    }
    return neighbours;
  };
  return { UL: entry('UL'), UR: entry('UR'), DL: entry('DL'), DR: entry('DR') };
})();

/**
 * Every dial slot a turn moves, on the side the geared corners belong to.
 *
 * Takes the corner set directly rather than a notation name, because all
 * fifteen non-empty pin configurations are physically reachable while the
 * notation only has names for nine of them — and the `at least 2 moves to
 * solve` check in `random-state.ts` has to consider every one.
 */
export function drivenSlots(corners: readonly ClockCorner[]): readonly number[] {
  const slots = new Set<number>();
  for (const corner of corners) {
    slots.add(CORNER_SLOT[corner]);
    for (const neighbour of CORNER_NEIGHBOUR_SLOTS[corner]) slots.add(neighbour);
  }
  return [...slots].sort((a, b) => a - b);
}

/** The nine named configurations resolved to corner sets — the notation's view of `drivenSlots`. */
export function drivenSlotsForPinSet(pins: ClockPinSet): readonly number[] {
  return drivenSlots(PIN_SET_CORNERS[pins]);
}

export function normalizeHours(value: number): number {
  return ((value % CLOCK_HOURS) + CLOCK_HOURS) % CLOCK_HOURS;
}
