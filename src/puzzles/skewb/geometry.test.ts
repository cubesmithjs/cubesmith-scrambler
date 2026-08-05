import { describe, expect, it } from 'vitest';
import { vecDot, vecKey, type Vec3 } from '../../utils/vec3';
import { SKEWB_CORNERS } from './notation';
import {
  CENTER_COUNT_SKEWB,
  CENTER_POSITIONS_SKEWB,
  CORNER_COUNT_SKEWB,
  CORNER_POSITIONS_SKEWB,
  deriveTurnTableSkewb,
  HELD_CORNER_INDEX,
  TURN_AXIS,
} from './geometry';

/**
 * The WCA holding position, reconstructed from the official description
 * ("white face on top, green face on the front-left", three faces visible)
 * so that the corner labels in `geometry.ts` are *checked* against the WCA
 * definitions of U/R/L/B rather than taken on trust.
 *
 * White is `+y` and green is `+z`, so the viewer stands out along the
 * bisector of `+x` and `+z` — at `(1,0,1)` — with `+y` up. Their right-hand
 * screen direction is then `forward × up ∝ (1,0,-1)`, which is what puts
 * `+x` on the right and `+z` on the left, i.e. green front-*left* exactly as
 * the regulation says.
 */
const VIEWER: Vec3 = [1, 0, 1];
const SCREEN_RIGHT: Vec3 = [1, 0, -1];
const SCREEN_UP: Vec3 = [0, 1, 0];

const screen = (p: Vec3) => ({
  right: vecDot(p, SCREEN_RIGHT),
  up: vecDot(p, SCREEN_UP),
  depth: vecDot(p, VIEWER),
});

describe('the WCA holding position pins down which corner each letter turns', () => {
  it('the held corner is the one with white up, green front-left — (1,1,1)', () => {
    const held = CORNER_POSITIONS_SKEWB[HELD_CORNER_INDEX]!;
    expect(held).toEqual([1, 1, 1]);
    // Its three stickers face +y (white/up), +z (green/front-left) and +x.
    expect(held[1]).toBe(1);
    expect(held[2]).toBe(1);
    expect(held[0]).toBe(1);
    // It is the nearest corner to the viewer, which is what "held in front" means.
    const depths = CORNER_POSITIONS_SKEWB.map((p) => screen(p).depth);
    expect(Math.max(...depths)).toBe(screen(held).depth);
  });

  it('U is the top-back corner', () => {
    const { right, up, depth } = screen(TURN_AXIS.U);
    expect(up).toBe(1); // top
    expect(right).toBe(0); // neither left nor right
    expect(depth).toBeLessThan(0); // back
  });

  it('R is the bottom-right corner', () => {
    const { right, up, depth } = screen(TURN_AXIS.R);
    expect(up).toBe(-1); // bottom
    expect(right).toBeGreaterThan(0); // right
    expect(depth).toBe(0); // on the silhouette, neither near nor far
  });

  it('L is the bottom-left corner', () => {
    const { right, up, depth } = screen(TURN_AXIS.L);
    expect(up).toBe(-1);
    expect(right).toBeLessThan(0); // left
    expect(depth).toBe(0);
  });

  it('B is the bottom-back corner, and the only corner hidden from the viewer', () => {
    const { right, up, depth } = screen(TURN_AXIS.B);
    expect(up).toBe(-1);
    expect(right).toBe(0);
    expect(depth).toBeLessThan(0);
    // Hidden means all three of its faces point away from the three visible
    // faces (+x, +y, +z) — true of exactly one corner.
    const hidden = CORNER_POSITIONS_SKEWB.filter((p) => p.every((c) => c === -1));
    expect(hidden).toHaveLength(1);
    expect(hidden[0]).toEqual(TURN_AXIS.B);
  });

  it('the four turn axes are four different body diagonals', () => {
    const axes = SKEWB_CORNERS.map((c) => TURN_AXIS[c]);
    expect(new Set(axes.map(vecKey)).size).toBe(4);
    for (const a of axes) {
      for (const b of axes) {
        if (vecKey(a) === vecKey(b)) continue;
        // Antipodal corners share an axis, which would make the set
        // redundant and leave one diagonal ungenerated.
        expect(vecKey(a)).not.toBe(vecKey(b.map((c) => -c) as unknown as Vec3));
      }
    }
  });

  it('none of the four is the held corner or adjacent to it', () => {
    const held = CORNER_POSITIONS_SKEWB[HELD_CORNER_INDEX]!;
    for (const corner of SKEWB_CORNERS) {
      const axis = TURN_AXIS[corner];
      // Adjacent corners differ in exactly one coordinate, i.e. dot = 1.
      // The held corner itself has dot 3. Every turn axis must be on the
      // far side (dot < 0) so its moving half excludes the held corner.
      expect(vecDot(held, axis)).toBeLessThan(0);
    }
  });
});

describe('deriveTurnTableSkewb', () => {
  it('never touches the held corner', () => {
    for (const corner of SKEWB_CORNERS) {
      const table = deriveTurnTableSkewb(corner);
      expect(table.cornerDestination[HELD_CORNER_INDEX]).toBe(HELD_CORNER_INDEX);
      expect(table.cornerTwist[HELD_CORNER_INDEX]).toBe(0);
    }
  });

  it('turns exactly half the puzzle: 4 corners and 3 centers', () => {
    for (const corner of SKEWB_CORNERS) {
      const axis = TURN_AXIS[corner];
      const movingCorners = CORNER_POSITIONS_SKEWB.filter((p) => vecDot(p, axis) > 0);
      expect(movingCorners).toHaveLength(4);
      const movingCenters = CENTER_POSITIONS_SKEWB.filter((p) => vecDot(p, axis) > 0);
      expect(movingCenters).toHaveLength(3);
    }
  });

  it('leaves the axis corner in place while twisting it, and 3-cycles the other three', () => {
    for (const corner of SKEWB_CORNERS) {
      const table = deriveTurnTableSkewb(corner);
      const axis = TURN_AXIS[corner];
      const axisIndex = CORNER_POSITIONS_SKEWB.findIndex((p) => vecKey(p) === vecKey(axis));

      expect(table.cornerDestination[axisIndex]).toBe(axisIndex);
      expect(table.cornerTwist[axisIndex]).not.toBe(0);

      const permuted = table.cornerDestination
        .map((dest, i) => (dest === i ? null : i))
        .filter((i): i is number => i !== null);
      expect(permuted).toHaveLength(3);
    }
  });

  it('3-cycles exactly three centers', () => {
    for (const corner of SKEWB_CORNERS) {
      const table = deriveTurnTableSkewb(corner);
      const moved = table.centerDestination.filter((dest, i) => dest !== i);
      expect(moved).toHaveLength(3);
      expect(new Set(table.centerDestination).size).toBe(CENTER_COUNT_SKEWB);
    }
  });

  it('destinations are permutations of the slots', () => {
    for (const corner of SKEWB_CORNERS) {
      const table = deriveTurnTableSkewb(corner);
      expect(new Set(table.cornerDestination).size).toBe(CORNER_COUNT_SKEWB);
      expect(new Set(table.centerDestination).size).toBe(CENTER_COUNT_SKEWB);
    }
  });
});
