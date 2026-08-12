import { InvalidColorError } from './errors';
import type { ColorScheme, PartialColorScheme } from './types';

/**
 * The 148 CSS named colours, plus `transparent`.
 *
 * Listed rather than pattern-matched because there is no pattern: this is a
 * closed set the CSS Color specification enumerates, and accepting "any
 * identifier-shaped word" would defeat the point of checking at all.
 */
const CSS_NAMED_COLORS: ReadonlySet<string> = new Set([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque',
  'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood',
  'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk',
  'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray',
  'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen',
  'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
  'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue',
  'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro',
  'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey',
  'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral',
  'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
  'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
  'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen',
  'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue',
  'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue',
  'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace',
  'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
  'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff',
  'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red',
  'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen',
  'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray',
  'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle',
  'tomato', 'transparent', 'turquoise', 'violet', 'wheat', 'white',
  'whitesmoke', 'yellow', 'yellowgreen',
]);

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** `none` is a real SVG paint value — "draw no fill" — and every drawer here uses it. */
export function isColorString(value: string): boolean {
  if (value === 'none') return true;
  if (HEX.test(value)) return true;
  return CSS_NAMED_COLORS.has(value.toLowerCase());
}

/**
 * Merges a caller's overrides over a puzzle's defaults, matching TNoodle's
 * "missing entries merged from defaults", and validates **only what the caller
 * supplied**.
 *
 * Two properties worth being explicit about:
 *
 * - An **unknown key is kept, not rejected.** A drawer only ever reads the keys it
 *   knows, so a stray one changes nothing — and rejecting it would make the
 *   Clock's twelve-key scheme and the cube's six-key one behave differently for no
 *   reason a caller could predict. It is still validated, because it could still
 *   be read by a future drawer.
 * - Passing `undefined` for a key means "inherit", not "clear". That is what
 *   `PartialColorScheme` says, and it is what a consumer spreading an object with
 *   optional fields will produce.
 */
export function mergeColorScheme(
  defaults: ColorScheme,
  overrides: PartialColorScheme | undefined,
): ColorScheme {
  if (!overrides) return defaults;
  const merged: Record<string, string> = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    if (!isColorString(value)) throw new InvalidColorError(key, value);
    merged[key] = value;
  }
  return merged;
}

/**
 * The colour for a face, or a loud failure.
 *
 * A missing key can only mean the drawer and its default scheme disagree about
 * the face names — a bug in this package, not in a caller's input, since
 * `mergeColorScheme` starts from the defaults and never deletes. Returning a
 * fallback colour would draw a wrong picture in silence.
 */
export function colorFor(scheme: ColorScheme, key: string): string {
  const value = scheme[key];
  if (value === undefined) {
    throw new Error(`@cubesmith/scrambler: the colour scheme has no entry for "${key}"`);
  }
  return value;
}
