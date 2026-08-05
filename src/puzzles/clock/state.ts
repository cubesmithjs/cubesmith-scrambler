import {
  CORNER_SLOT,
  CORNER_SLOTS,
  DIALS_PER_SIDE,
  drivenSlots,
  MIRROR_SLOT,
  NON_CORNER_SLOTS,
  normalizeHours,
} from './mechanics';
import {
  CLOCK_CORNERS,
  PIN_SET_CORNERS,
  type ClockCorner,
  type ClockPinSet,
  type ClockToken,
} from './notation';

/**
 * A complete Clock state: every dial on both sides, plus where the pins are.
 *
 * `front` and `back` are each indexed by that side's *own* slot numbering
 * (see `mechanics.ts`), so `back[0]` is the upper-left dial as seen from the
 * back — which is physically the same clock as `front[2]`.
 *
 * A corner clock runs through the puzzle, so its two readings are locked
 * together and mirrored: `back[MIRROR_SLOT[slot]] === -front[slot]`. Solved
 * is all dials at twelve o'clock, which satisfies that trivially.
 *
 * `pinsUp` is in the front frame and is *not* part of solvedness — a Clock
 * is judged on its dials, and the pins can be anywhere. It's modelled
 * because a scramble's closing declaration sets it, and a faithful state is
 * what makes the round-trip test worth running.
 */
export interface ClockState {
  readonly front: readonly number[];
  readonly back: readonly number[];
  readonly pinsUp: Readonly<Record<ClockCorner, boolean>>;
}

export const SOLVED_CLOCK_STATE: ClockState = {
  front: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  back: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  pinsUp: { UR: false, DR: false, DL: false, UL: false },
};

/** Whether the two sides' corner readings are the locked, mirrored pair the mechanism forces. */
export function cornerReadingsConsistent(state: ClockState): boolean {
  return CORNER_SLOTS.every(
    (slot) => state.back[MIRROR_SLOT[slot]!] === normalizeHours(-state.front[slot]!),
  );
}

/**
 * Turns a geared wheel `amount` hours clockwise, as seen from whichever side
 * the puzzle is currently held.
 *
 * `flipped` is the only thing the frame changes: which array is "near" and
 * which is "far". The driven-slot rule and the corner linkage are written
 * once and applied symmetrically, because the puzzle genuinely is symmetric
 * — there is no privileged side.
 *
 * Takes a corner set rather than a notation name so that all fifteen
 * physically-reachable pin configurations can be applied, not only the nine
 * the notation names.
 */
export function applyClockTurn(
  state: ClockState,
  corners: readonly ClockCorner[],
  amount: number,
  flipped: boolean,
): ClockState {
  const near = [...(flipped ? state.back : state.front)];
  const far = [...(flipped ? state.front : state.back)];

  for (const slot of drivenSlots(corners)) {
    near[slot] = normalizeHours(near[slot]! + amount);
  }
  // A corner clock is a single piece showing on both sides, so every corner
  // this turn drove reads the opposite way round on the far side.
  for (const corner of corners) {
    const slot = CORNER_SLOT[corner];
    far[MIRROR_SLOT[slot]!] = normalizeHours(far[MIRROR_SLOT[slot]!]! - amount);
  }

  return {
    front: flipped ? far : near,
    back: flipped ? near : far,
    pinsUp: setPins(state.pinsUp, corners, flipped),
  };
}

/** `applyClockTurn` addressed by one of the nine notation pin-set names. */
export function applyClockDial(
  state: ClockState,
  pins: ClockPinSet,
  amount: number,
  flipped: boolean,
): ClockState {
  return applyClockTurn(state, PIN_SET_CORNERS[pins], amount, flipped);
}

/**
 * A dial token raises exactly the pins it names and lowers the rest. When
 * the puzzle is flipped, a corner named from that side is the mirrored
 * corner in the front frame, and "up from the back" is "down from the
 * front" — which is what the pins physically are, one piece with two ends.
 */
function setPins(
  current: Readonly<Record<ClockCorner, boolean>>,
  up: readonly ClockCorner[],
  flipped: boolean,
): Record<ClockCorner, boolean> {
  const raised = new Set(flipped ? up.map(mirrorCorner) : up);
  const next = { ...current };
  for (const corner of CLOCK_CORNERS) {
    next[corner] = flipped ? !raised.has(corner) : raised.has(corner);
  }
  return next;
}

/** The corner that occupies the same screen position after the puzzle is turned over. */
export function mirrorCorner(corner: ClockCorner): ClockCorner {
  const slot = MIRROR_SLOT[CORNER_SLOT[corner]]!;
  const found = CLOCK_CORNERS.find((c) => CORNER_SLOT[c] === slot);
  if (!found) throw new Error(`clock-state: no corner mirrors ${corner}`);
  return found;
}

/** Applies a whole parsed scramble, tracking whether `y2` has turned the puzzle over. */
export function applyClockTokens(
  state: ClockState,
  tokens: readonly ClockToken[],
): ClockState {
  let current = state;
  let flipped = false;
  for (const token of tokens) {
    if (token.kind === 'flip') {
      flipped = !flipped;
      continue;
    }
    if (token.kind === 'pins') {
      current = { ...current, pinsUp: setPins(current.pinsUp, token.up, flipped) };
      continue;
    }
    current = applyClockDial(current, token.pins, token.amount, flipped);
  }
  return current;
}

/** A Clock is solved when all eighteen dials read twelve. Pin positions are not part of it. */
export function isSolvedClock(state: ClockState): boolean {
  return state.front.every((v) => v === 0) && state.back.every((v) => v === 0);
}

export function clockStatesEqual(a: ClockState, b: ClockState): boolean {
  return (
    a.front.every((v, i) => v === b.front[i]) &&
    a.back.every((v, i) => v === b.back[i]) &&
    CLOCK_CORNERS.every((c) => a.pinsUp[c] === b.pinsUp[c])
  );
}

/**
 * The fourteen independent dials as a vector: the nine front slots followed
 * by the five non-corner back slots. The four back corner readings are
 * omitted because they are not free — they mirror the front's.
 */
export const CLOCK_DIMENSION = DIALS_PER_SIDE + NON_CORNER_SLOTS.length; // 14

export function toClockVector(state: ClockState): number[] {
  return [...state.front, ...NON_CORNER_SLOTS.map((slot) => state.back[slot]!)];
}

export function fromClockVector(
  vector: readonly number[],
  pinsUp: Readonly<Record<ClockCorner, boolean>> = SOLVED_CLOCK_STATE.pinsUp,
): ClockState {
  if (vector.length !== CLOCK_DIMENSION) {
    throw new Error(`clock-state: expected ${CLOCK_DIMENSION} dial values, got ${vector.length}`);
  }
  const front = vector.slice(0, DIALS_PER_SIDE).map(normalizeHours);
  const back = new Array<number>(DIALS_PER_SIDE).fill(0);
  NON_CORNER_SLOTS.forEach((slot, i) => {
    back[slot] = normalizeHours(vector[DIALS_PER_SIDE + i]!);
  });
  for (const slot of CORNER_SLOTS) {
    back[MIRROR_SLOT[slot]!] = normalizeHours(-front[slot]!);
  }
  return { front, back, pinsUp };
}

export { CLOCK_CORNERS, type ClockCorner };
