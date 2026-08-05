import { describe, expect, it } from 'vitest';
import { CLOCK_CORNERS, CLOCK_PIN_SETS, PIN_SET_CORNERS } from './notation';
import {
  CORNER_NEIGHBOUR_SLOTS,
  CORNER_SLOT,
  CORNER_SLOTS,
  DIALS_PER_SIDE,
  drivenSlots,
  drivenSlotsForPinSet,
  MIRROR_SLOT,
  NON_CORNER_SLOTS,
  normalizeHours,
} from './mechanics';

describe('the dial grid', () => {
  it('is nine slots per side, four of them corners and five not', () => {
    expect(DIALS_PER_SIDE).toBe(9);
    expect(CORNER_SLOTS).toHaveLength(4);
    expect(NON_CORNER_SLOTS).toHaveLength(5);
    expect([...CORNER_SLOTS, ...NON_CORNER_SLOTS].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('puts the four corners at the grid corners', () => {
    expect(CLOCK_CORNERS.map((c) => CORNER_SLOT[c]).sort((a, b) => a - b)).toEqual([0, 2, 6, 8]);
  });

  it('gives each corner exactly three geared neighbours — two edges and the centre', () => {
    for (const corner of CLOCK_CORNERS) {
      const neighbours = CORNER_NEIGHBOUR_SLOTS[corner];
      expect(neighbours).toHaveLength(3);
      expect(neighbours).toContain(4); // every quadrant includes the centre
      expect(neighbours).not.toContain(CORNER_SLOT[corner]);
      // No other corner is in a corner's quadrant.
      for (const other of CORNER_SLOTS) expect(neighbours).not.toContain(other);
    }
  });

  it('mirrors left-to-right and is an involution', () => {
    expect(MIRROR_SLOT).toEqual([2, 1, 0, 5, 4, 3, 8, 7, 6]);
    for (let slot = 0; slot < DIALS_PER_SIDE; slot += 1) {
      expect(MIRROR_SLOT[MIRROR_SLOT[slot]!]).toBe(slot);
    }
    // Mirroring maps corners to corners and non-corners to non-corners,
    // which is what lets the two sides share one slot numbering scheme.
    for (const slot of CORNER_SLOTS) expect(CORNER_SLOTS).toContain(MIRROR_SLOT[slot]);
    for (const slot of NON_CORNER_SLOTS) expect(NON_CORNER_SLOTS).toContain(MIRROR_SLOT[slot]);
  });
});

describe('drivenSlots', () => {
  it('is the union of the raised corners’ quadrants', () => {
    expect(drivenSlotsForPinSet('UL')).toEqual([0, 1, 3, 4]);
    expect(drivenSlotsForPinSet('UR')).toEqual([1, 2, 4, 5]);
    expect(drivenSlotsForPinSet('DL')).toEqual([3, 4, 6, 7]);
    expect(drivenSlotsForPinSet('DR')).toEqual([4, 5, 7, 8]);
  });

  it('all four pins up drives every dial on that side', () => {
    expect(drivenSlotsForPinSet('ALL')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('an edge pair drives the union of its two quadrants — six dials, not eight', () => {
    // The two quadrants overlap on the shared edge and the centre, and the
    // far row is untouched because those corners aren't geared to this side.
    expect(drivenSlotsForPinSet('U')).toEqual([0, 1, 2, 3, 4, 5]);
    expect(drivenSlotsForPinSet('R')).toEqual([1, 2, 4, 5, 7, 8]);
    expect(drivenSlotsForPinSet('D')).toEqual([3, 4, 5, 6, 7, 8]);
    expect(drivenSlotsForPinSet('L')).toEqual([0, 1, 3, 4, 6, 7]);
  });

  it('never drives a corner whose pin is down', () => {
    for (const pins of CLOCK_PIN_SETS) {
      const raised = new Set(PIN_SET_CORNERS[pins].map((c) => CORNER_SLOT[c]));
      for (const slot of drivenSlotsForPinSet(pins)) {
        if (CORNER_SLOTS.includes(slot)) expect(raised.has(slot)).toBe(true);
      }
    }
  });

  it('handles the six pin configurations the notation has no name for', () => {
    // Diagonal pairs and triples are physically fine even though no token
    // spells them; the Regulation 4b3 check needs all fifteen.
    expect(drivenSlots(['UL', 'DR'])).toEqual([0, 1, 3, 4, 5, 7, 8]);
    expect(drivenSlots(['UR', 'DL'])).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(drivenSlots(['UL', 'UR', 'DL'])).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('the empty configuration drives nothing', () => {
    expect(drivenSlots([])).toEqual([]);
  });
});

describe('normalizeHours', () => {
  it('wraps into 0..11 for negative and large values alike', () => {
    expect(normalizeHours(0)).toBe(0);
    expect(normalizeHours(12)).toBe(0);
    expect(normalizeHours(-1)).toBe(11);
    expect(normalizeHours(-13)).toBe(11);
    expect(normalizeHours(25)).toBe(1);
  });
});
