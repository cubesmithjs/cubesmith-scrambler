import { describe, expect, it } from 'vitest';
import { drawScramble } from '../../draw';
import { generateUnofficialScramble } from '../index';
import type { UnofficialEventId } from '../types';
import {
  defaultUnofficialColorScheme,
  drawableUnofficialEvents,
  drawingViews,
  drawUnofficialScramble,
  InvalidColorError,
  isDrawableUnofficialEvent,
  scrambleImageToSvg,
  UnimplementedUnofficialDrawingError,
  UnsupportedUnofficialScrambleError,
} from './index';

const DRAWABLE: readonly UnofficialEventId[] = [
  '888',
  '999',
  '1010',
  '1111',
  '1212',
  '222bf',
  '666bf',
  '777bf',
  'pyrambf',
  'minxbf',
  'mirror',
  'fisher',
  'mastermorphix',
];

/** Shape mods whose geometry has no source yet: scrambled, never drawn. */
const NOT_YET_DRAWABLE: readonly UnofficialEventId[] = ['axis', 'windmill', 'ghost'];

describe('@cubesmith/scrambler/unofficial/draw', () => {
  it('draws every event whose geometry has a source, and no other', () => {
    expect([...drawableUnofficialEvents()].sort()).toEqual([...DRAWABLE].sort());
    for (const event of NOT_YET_DRAWABLE) {
      expect(isDrawableUnofficialEvent(event)).toBe(false);
      expect(() => drawUnofficialScramble(event, 'R')).toThrow(UnimplementedUnofficialDrawingError);
      expect(() => defaultUnofficialColorScheme(event)).toThrow(UnimplementedUnofficialDrawingError);
    }
  });

  it.each(DRAWABLE)('%s: draws a generated scramble in every view it offers', async (event) => {
    const { moves } = await generateUnofficialScramble(event, { seed: `draw-${event}` });
    for (const view of drawingViews(event)) {
      const image = drawUnofficialScramble(event, moves, undefined, { view });
      expect(image.event).toBe(event);
      expect(image.shapes.length).toBeGreaterThan(0);
      const svg = scrambleImageToSvg(image);
      expect(svg.startsWith('<svg ')).toBe(true);
      expect(svg).not.toContain('NaN');
    }
  });

  it('draws a big cube on the same net as the WCA cubes, scaled by size', () => {
    const big = drawUnofficialScramble('888', '');
    const seven = drawScramble('777', '');
    // (size · 10 + 2) · 4 + 2: the WCA net's own width formula.
    expect(big.width).toBe((8 * 10 + 2) * 4 + 2);
    expect(big.shapes).toHaveLength(6 * 64);
    expect(seven.shapes).toHaveLength(6 * 49);
  });

  it('draws a blindfolded cube exactly as its sighted cube would draw the same text', () => {
    const text = "R U F' D2 L B' x y'";
    const unofficial = drawUnofficialScramble('222bf', text);
    expect(unofficial.shapes).toEqual(drawScramble('222', text).shapes);
    expect(drawUnofficialScramble('pyrambf', "U L' r b").shapes).toEqual(drawScramble('pyram', "U L' r b").shapes);
    expect(drawUnofficialScramble('minxbf', 'R++ D-- U').shapes).toEqual(drawScramble('minx', 'R++ D-- U').shapes);
  });

  it('offers the Mirror Cube two views, isometric first', () => {
    expect(drawingViews('mirror')).toEqual(['isometric', 'height-map']);
    expect(drawingViews('fisher')).toEqual(['isometric']);
    expect(() => drawUnofficialScramble('fisher', 'R', undefined, { view: 'height-map' })).toThrow(
      UnimplementedUnofficialDrawingError,
    );
  });

  it('merges a colour override and refuses a value that is not a colour', () => {
    const image = drawUnofficialScramble('888', '', { U: '#123456' });
    expect(image.shapes.some((s) => s.fill === '#123456')).toBe(true);
    expect(() => drawUnofficialScramble('888', '', { U: 'not a colour' })).toThrow(InvalidColorError);
    expect(Object.keys(defaultUnofficialColorScheme('mirror')).sort()).toEqual(['body', 'surface']);
  });

  it('refuses notation a scramble never contains, with its own error type', () => {
    for (const event of ['1212', 'mirror'] as const) {
      expect(() => drawUnofficialScramble(event, 'M')).toThrow(UnsupportedUnofficialScrambleError);
      expect(() => drawUnofficialScramble(event, '[R, U]')).toThrow(UnsupportedUnofficialScrambleError);
    }
  });
});
