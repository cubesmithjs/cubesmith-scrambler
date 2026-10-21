import { describe, expect, it } from 'vitest';
import { shadeColor } from './shade';

describe('shadeColor', () => {
  it('scales every hex channel, and leaves full brightness untouched', () => {
    expect(shadeColor('#ff8000', 1)).toBe('#ff8000');
    expect(shadeColor('#ff8000', 0.5)).toBe('#804000');
    expect(shadeColor('#FFFFFF', 0)).toBe('#000000');
  });

  it('expands the short forms and keeps an alpha channel as it was', () => {
    expect(shadeColor('#f80', 0.5)).toBe('#804400');
    expect(shadeColor('#f80c', 0.5)).toBe('#804400cc');
    expect(shadeColor('#ff800080', 0.5)).toBe('#80400080');
  });

  it('passes through what it cannot shade: named colours, none, transparent', () => {
    for (const color of ['red', 'none', 'transparent', 'rebeccapurple']) {
      expect(shadeColor(color, 0.5)).toBe(color);
    }
  });
});
