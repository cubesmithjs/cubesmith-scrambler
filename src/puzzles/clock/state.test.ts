import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { CLOCK_CORNERS, CLOCK_HOURS, CLOCK_PIN_SETS, PIN_SET_CORNERS } from './notation';
import {
  CORNER_SLOT,
  CORNER_SLOTS,
  drivenSlotsForPinSet,
  MIRROR_SLOT,
  NON_CORNER_SLOTS,
} from './mechanics';
import {
  applyClockDial,
  applyClockTokens,
  applyClockTurn,
  CLOCK_DIMENSION,
  clockStatesEqual,
  cornerReadingsConsistent,
  fromClockVector,
  isSolvedClock,
  mirrorCorner,
  SOLVED_CLOCK_STATE,
  toClockVector,
  type ClockState,
} from './state';

const random = createRandomSource('clock-state');

function randomTurns(count: number): { pins: (typeof CLOCK_PIN_SETS)[number]; amount: number; flipped: boolean }[] {
  return Array.from({ length: count }, () => ({
    pins: CLOCK_PIN_SETS[randomInt(random, CLOCK_PIN_SETS.length)]!,
    amount: randomInt(random, CLOCK_HOURS),
    flipped: randomInt(random, 2) === 1,
  }));
}

describe('a turn has order 12', () => {
  for (const pins of CLOCK_PIN_SETS) {
    for (const flipped of [false, true]) {
      it(`${pins}${flipped ? ' (flipped)' : ''}`, () => {
        let state: ClockState = SOLVED_CLOCK_STATE;
        for (let i = 0; i < CLOCK_HOURS; i += 1) state = applyClockDial(state, pins, 1, flipped);
        expect(isSolvedClock(state)).toBe(true);
      });
    }
  }
});

describe('turns commute — the Clock group is abelian', () => {
  it('any two turns give the same state in either order', () => {
    const turns = randomTurns(200);
    for (let i = 0; i + 1 < turns.length; i += 2) {
      const a = turns[i]!;
      const b = turns[i + 1]!;
      const ab = applyClockDial(applyClockDial(SOLVED_CLOCK_STATE, a.pins, a.amount, a.flipped), b.pins, b.amount, b.flipped);
      const ba = applyClockDial(applyClockDial(SOLVED_CLOCK_STATE, b.pins, b.amount, b.flipped), a.pins, a.amount, a.flipped);
      // Pins are set by whichever turn came last, so compare the dials only —
      // it's the dial arithmetic that commutes.
      expect(ab.front).toEqual(ba.front);
      expect(ab.back).toEqual(ba.back);
    }
  });

  it('so a turn of n hours equals n turns of one hour', () => {
    for (const pins of CLOCK_PIN_SETS) {
      for (let amount = 0; amount < CLOCK_HOURS; amount += 1) {
        let stepwise: ClockState = SOLVED_CLOCK_STATE;
        for (let i = 0; i < amount; i += 1) stepwise = applyClockDial(stepwise, pins, 1, false);
        const direct = applyClockDial(SOLVED_CLOCK_STATE, pins, amount, false);
        expect(direct.front).toEqual(stepwise.front);
        expect(direct.back).toEqual(stepwise.back);
      }
    }
  });
});

/**
 * The structural invariant of the mechanism: a corner clock is one piece
 * running through the puzzle, so its two readings are always mirrored
 * negatives. If a turn ever updated one side's corner without the other,
 * this breaks.
 */
describe('corner clocks stay locked to their mirror on the far side', () => {
  it('holds after any number of turns from either side', () => {
    let state: ClockState = SOLVED_CLOCK_STATE;
    expect(cornerReadingsConsistent(state)).toBe(true);
    for (const turn of randomTurns(500)) {
      state = applyClockDial(state, turn.pins, turn.amount, turn.flipped);
      expect(cornerReadingsConsistent(state)).toBe(true);
    }
  });
});

describe('a front turn never moves a non-corner back dial, and vice versa', () => {
  it('is what forces the scramble to contain a y2 at all', () => {
    for (const pins of CLOCK_PIN_SETS) {
      const front = applyClockDial(SOLVED_CLOCK_STATE, pins, 5, false);
      for (const slot of NON_CORNER_SLOTS) expect(front.back[slot]).toBe(0);

      const back = applyClockDial(SOLVED_CLOCK_STATE, pins, 5, true);
      for (const slot of NON_CORNER_SLOTS) expect(back.front[slot]).toBe(0);
    }
  });

  it('a turn moves exactly the driven slots on its own side', () => {
    for (const pins of CLOCK_PIN_SETS) {
      const driven = new Set(drivenSlotsForPinSet(pins));
      const state = applyClockDial(SOLVED_CLOCK_STATE, pins, 3, false);
      for (let slot = 0; slot < 9; slot += 1) {
        expect(state.front[slot]).toBe(driven.has(slot) ? 3 : 0);
      }
      // On the far side only the driven corners moved, and they moved back.
      for (const corner of PIN_SET_CORNERS[pins]) {
        expect(state.back[MIRROR_SLOT[CORNER_SLOT[corner]]!]).toBe(CLOCK_HOURS - 3);
      }
    }
  });
});

describe('applyClockTurn accepts the configurations the notation cannot name', () => {
  it('a diagonal pair drives both quadrants', () => {
    const state = applyClockTurn(SOLVED_CLOCK_STATE, ['UL', 'DR'], 2, false);
    // Everything except the two ungeared corners and the two edges only
    // adjacent to them.
    expect(state.front).toEqual([2, 2, 0, 2, 2, 2, 0, 2, 2]);
  });
});

describe('pin bookkeeping', () => {
  it('mirrorCorner is an involution that swaps left and right', () => {
    expect(mirrorCorner('UL')).toBe('UR');
    expect(mirrorCorner('UR')).toBe('UL');
    expect(mirrorCorner('DL')).toBe('DR');
    expect(mirrorCorner('DR')).toBe('DL');
    for (const corner of CLOCK_CORNERS) expect(mirrorCorner(mirrorCorner(corner))).toBe(corner);
  });

  it('a front turn raises exactly the pins it names', () => {
    const state = applyClockDial(SOLVED_CLOCK_STATE, 'U', 1, false);
    expect(state.pinsUp).toEqual({ UL: true, UR: true, DL: false, DR: false });
  });

  it('a turn from the back raises the mirrored corners, inverted — a pin has two ends', () => {
    const state = applyClockDial(SOLVED_CLOCK_STATE, 'U', 1, true);
    // Naming UL/UR from the back means raising the front's UR/UL from the
    // back, which leaves them *down* at the front and the other two up.
    expect(state.pinsUp).toEqual({ UL: false, UR: false, DL: true, DR: true });
  });

  it('pin positions are not part of solvedness', () => {
    const withPins: ClockState = {
      ...SOLVED_CLOCK_STATE,
      pinsUp: { UR: true, DR: false, DL: true, UL: true },
    };
    expect(isSolvedClock(withPins)).toBe(true);
    expect(clockStatesEqual(withPins, SOLVED_CLOCK_STATE)).toBe(false);
  });
});

describe('vector conversion', () => {
  it('round-trips: fourteen values in, the same fourteen out', () => {
    for (let trial = 0; trial < 2_000; trial += 1) {
      const vector = Array.from({ length: CLOCK_DIMENSION }, () => randomInt(random, CLOCK_HOURS));
      expect(toClockVector(fromClockVector(vector))).toEqual(vector);
    }
  });

  it('reconstructs the locked back corners rather than requiring them as input', () => {
    for (let trial = 0; trial < 500; trial += 1) {
      const vector = Array.from({ length: CLOCK_DIMENSION }, () => randomInt(random, CLOCK_HOURS));
      expect(cornerReadingsConsistent(fromClockVector(vector))).toBe(true);
    }
  });

  it('normalizes out-of-range input', () => {
    const state = fromClockVector([13, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(state.front[0]).toBe(1);
    expect(state.front[1]).toBe(11);
  });

  it('rejects the wrong number of values', () => {
    expect(() => fromClockVector([1, 2, 3])).toThrow(/expected 14/);
  });

  it('the fourteen coordinates are the nine front slots then the five non-corner back slots', () => {
    const state = applyClockDial(SOLVED_CLOCK_STATE, 'ALL', 4, true);
    const vector = toClockVector(state);
    expect(vector).toHaveLength(CLOCK_DIMENSION);
    expect(vector.slice(0, 9)).toEqual([...state.front]);
    expect(vector.slice(9)).toEqual(NON_CORNER_SLOTS.map((slot) => state.back[slot]));
    // The four back corner readings are deliberately absent: they are not
    // free, so including them would make the coordinate over-determined.
    expect(CLOCK_DIMENSION).toBe(18 - CORNER_SLOTS.length);
  });
});

describe('applyClockTokens', () => {
  it('tracks y2 so the tokens after it land on the other side', () => {
    const withFlip = applyClockTokens(SOLVED_CLOCK_STATE, [
      { kind: 'flip' },
      { kind: 'dial', pins: 'ALL', amount: 3 },
    ]);
    const direct = applyClockDial(SOLVED_CLOCK_STATE, 'ALL', 3, true);
    expect(withFlip.front).toEqual(direct.front);
    expect(withFlip.back).toEqual(direct.back);
  });

  it('two flips cancel', () => {
    const state = applyClockTokens(SOLVED_CLOCK_STATE, [
      { kind: 'flip' },
      { kind: 'flip' },
      { kind: 'dial', pins: 'ALL', amount: 3 },
    ]);
    expect(state.front).toEqual(applyClockDial(SOLVED_CLOCK_STATE, 'ALL', 3, false).front);
  });

  it('a closing pin declaration sets the pins and nothing else', () => {
    const before = applyClockDial(SOLVED_CLOCK_STATE, 'ALL', 3, false);
    const after = applyClockTokens(before, [{ kind: 'pins', up: ['UR', 'DL'] }]);
    expect(after.front).toEqual(before.front);
    expect(after.back).toEqual(before.back);
    expect(after.pinsUp).toEqual({ UR: true, DL: true, DR: false, UL: false });
  });
});
