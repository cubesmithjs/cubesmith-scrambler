import { describe, expect, it } from 'vitest';
import {
  defaultColorScheme,
  drawScramble,
  drawableEvents,
  InvalidColorError,
  isDrawableEvent,
  scrambleImageToSvg,
  UnimplementedDrawingError,
  UnsupportedScrambleError,
} from './index';
import { isColorString } from './color';
import { AlgorithmSyntaxError } from '../notation/alg/types';
import { ScrambleSyntaxError } from '../core/scramble-errors';
import { UnimplementedEventError } from '../core/errors';
import type { WcaEventId } from '../core/types';
import { withinBounds } from './__tests__/invariants';

const ALL_EVENTS: readonly WcaEventId[] = [
  '222', '333', '444', '555', '666', '777',
  '333bf', '333fm', '333oh', '333mbf', '444bf', '555bf',
  'minx', 'pyram', 'clock', 'skewb', 'sq1',
];

describe('the /draw entry point', () => {
  it('🔴 draws all 17 events — the coverage gate', () => {
    expect(drawableEvents()).toHaveLength(17);
    for (const event of ALL_EVENTS) {
      expect(isDrawableEvent(event), event).toBe(true);
      const image = drawScramble(event, '');
      expect(image.event, event).toBe(event);
      expect(image.width, event).toBeGreaterThan(0);
      expect(image.height, event).toBeGreaterThan(0);
      expect(image.shapes.length, event).toBeGreaterThan(0);
      expect(withinBounds(image), event).toBe(true);
    }
  });

  it('throws UnimplementedDrawingError — not UnimplementedEventError — for an event with no drawer', () => {
    // 🔴 Two different absences. `UnimplementedEventError` means "no scrambler";
    // this one means "no picture". A consumer needs to tell a user which.
    const missing = 'not-an-event' as WcaEventId;
    expect(() => drawScramble(missing, '')).toThrow(UnimplementedDrawingError);
    expect(() => drawScramble(missing, '')).not.toThrow(UnimplementedEventError);
    expect(() => defaultColorScheme(missing)).toThrow(UnimplementedDrawingError);
    expect(isDrawableEvent(missing)).toBe(false);
  });
});

describe('scramble errors pass through unchanged', () => {
  it('a malformed cube scramble throws the existing AlgorithmSyntaxError, with its reason code', () => {
    let caught: unknown;
    try {
      drawScramble('333', 'R U Q');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AlgorithmSyntaxError);
    expect((caught as AlgorithmSyntaxError).reason).toBe('not-a-move');
  });

  it('a malformed bespoke scramble throws the existing ScrambleSyntaxError', () => {
    expect(() => drawScramble('sq1', '(1, 0) x')).toThrow(ScrambleSyntaxError);
    expect(() => drawScramble('clock', "R U R'")).toThrow(ScrambleSyntaxError);
    expect(() => drawScramble('pyram', 'R++ D--')).toThrow(ScrambleSyntaxError);
  });

  it('an empty scramble is valid everywhere — it means "solved", not "malformed"', () => {
    for (const event of ALL_EVENTS) {
      expect(() => drawScramble(event, ''), event).not.toThrow();
      expect(() => drawScramble(event, '   '), event).not.toThrow();
    }
  });

  it('🔴 refuses valid cube notation a scramble never contains, with a stable construct code', () => {
    const cases: readonly [string, string][] = [
      ['M', 'slice-move'],
      ["E2 R", 'slice-move'],
      ['2-3Rw', 'layer-range'],
      ['(R U)2', 'grouping'],
      ['[R, U]', 'grouping'],
      ['[R: U]', 'grouping'],
    ];
    for (const [scramble, construct] of cases) {
      let caught: unknown;
      try {
        drawScramble('333', scramble);
      } catch (error) {
        caught = error;
      }
      expect(caught, scramble).toBeInstanceOf(UnsupportedScrambleError);
      expect((caught as UnsupportedScrambleError).construct, scramble).toBe(construct);
    }
  });

  it('skips a pause rather than refusing it — a `.` carries no turn', () => {
    expect(drawScramble('333', "R U . R' U'")).toEqual(drawScramble('333', "R U R' U'"));
  });

  it('treats an identity amount as nothing to apply', () => {
    // `R4` is legal notation for four quarter turns, which is no turn at all.
    expect(drawScramble('333', 'R4')).toEqual(drawScramble('333', ''));
  });
});

describe('colour schemes', () => {
  it('a partial override changes only the overridden keys', () => {
    const defaults = defaultColorScheme('333');
    const image = drawScramble('333', '', { U: '#123456' });
    const fills = new Set(image.shapes.map((s) => s.fill));
    expect(fills.has('#123456')).toBe(true);
    expect(fills.has(defaults.U!)).toBe(false);
    // Every other face still wears its default.
    for (const face of ['D', 'F', 'B', 'L', 'R']) {
      expect(fills.has(defaults[face]!), face).toBe(true);
    }
  });

  it('an undefined value means inherit, not clear', () => {
    expect(drawScramble('333', '', { U: undefined })).toEqual(drawScramble('333', ''));
  });

  it('🔴 rejects a caller-supplied colour that is not a colour string', () => {
    for (const bad of ['" onload="alert(1)', 'reddish', '#12345', 'rgb(1,2,3)', '']) {
      expect(() => drawScramble('333', '', { U: bad }), JSON.stringify(bad)).toThrow(
        InvalidColorError,
      );
    }
  });

  it('accepts every shape of colour string the serializer is willing to write', () => {
    for (const good of ['#fff', '#ffff', '#ffffff', '#ffffffff', '#FFF', 'rebeccapurple', 'RED', 'none']) {
      expect(isColorString(good), good).toBe(true);
    }
    // `NONE` is rejected on purpose: SVG's `none` paint keyword is case-sensitive,
    // so accepting the uppercase spelling would write a value the renderer treats as
    // an unknown colour rather than as "no paint".
    for (const bad of ['#ff', '#fffff', 'not-a-colour', 'url(#x)', 'NONE']) {
      expect(isColorString(bad), bad).toBe(false);
    }
  });

  it('exposes the default scheme so a consumer knows the key set to override', () => {
    expect(Object.keys(defaultColorScheme('333')).sort()).toEqual(['B', 'D', 'F', 'L', 'R', 'U']);
    expect(Object.keys(defaultColorScheme('pyram')).sort()).toEqual(['D', 'F', 'L', 'R']);
    expect(Object.keys(defaultColorScheme('clock'))).toHaveLength(12);
  });

  it('🔴 the schemes are not interchangeable — three of them disagree about R', () => {
    expect(defaultColorScheme('333').R).toBe('#ff0000'); // red
    expect(defaultColorScheme('skewb').R).toBe('#0000ff'); // blue
    expect(defaultColorScheme('sq1').R).toBe('#00ff00'); // green
    expect(defaultColorScheme('pyram').R).toBe('#0000ff'); // blue
  });
});

describe('scrambleImageToSvg', () => {
  it('writes a viewBox from the intrinsic size, and one element per shape', () => {
    const image = drawScramble('222', '');
    const svg = scrambleImageToSvg(image);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${image.width} ${image.height}"`);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect((svg.match(/<rect /g) ?? []).length).toBe(image.shapes.length);
  });

  it('carries the document stroke width TNoodle sets — 2 for the Clock, 1 elsewhere', () => {
    expect(drawScramble('clock', '').strokeWidth).toBe(2);
    expect(scrambleImageToSvg(drawScramble('clock', ''))).toContain('stroke-width="2"');
    expect(drawScramble('333', '').strokeWidth).toBe(1);
  });

  it('emits balanced, well-formed markup for every event', () => {
    for (const event of ALL_EVENTS) {
      const svg = scrambleImageToSvg(drawScramble(event, ''));
      expect(parseXml(svg), event).toBe(true);
      // No unescaped angle bracket or quote could have leaked in from a value: every
      // one written is a number or a validated colour.
      const attributeValues = [...svg.matchAll(/="([^"]*)"/g)].map((m) => m[1]!);
      for (const value of attributeValues) {
        expect(value.includes('<') || value.includes('>'), `${event}: ${value}`).toBe(false);
      }
    }
  });

  it('prints integers without trailing zeros, so a fixture stays readable', () => {
    expect(scrambleImageToSvg(drawScramble('333', ''))).toContain('width="130"');
  });
});

/**
 * A deliberately tiny well-formedness check, written here rather than pulled in:
 * the package has no dependencies and is not about to grow an XML parser for one
 * assertion. It walks tags and matches open against close, which is exactly the
 * failure a hand-built serializer can produce.
 */
function parseXml(text: string): boolean {
  const stack: string[] = [];
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(text)) !== null) {
    // Anything between tags must be whitespace — these documents carry no text.
    if (text.slice(index, match.index).trim() !== '') return false;
    index = match.index + match[0].length;
    const [, closing, name, , selfClosing] = match;
    if (closing === '/') {
      if (stack.pop() !== name) return false;
    } else if (selfClosing !== '/') {
      stack.push(name!);
    }
  }
  return stack.length === 0 && text.slice(index).trim() === '';
}
