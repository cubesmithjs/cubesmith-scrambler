import type { ScrambleImage } from '../types';

/**
 * The fixture file's format: valid JSON, one **shape per line**.
 *
 * Both halves of that matter. Valid JSON so the test parses it with `JSON.parse`
 * rather than a bespoke reader, and one shape per line so a geometry change shows up
 * as a handful of changed lines in a review instead of as one enormous diffed line.
 *
 * `JSON.stringify(…, null, 2)` gives the second property and costs the first: it
 * indents every coordinate onto its own line, which took the eighteen fixtures here
 * to 608 KB. This is the same content at roughly a sixth of that.
 */
export interface Fixture {
  readonly scramble: string;
  readonly image: ScrambleImage;
}

export function serializeFixtures(fixtures: Record<string, Fixture>): string {
  const entries = Object.entries(fixtures).map(([name, { scramble, image }]) => {
    const head =
      `{"scramble":${JSON.stringify(scramble)},` +
      `"image":{"event":${JSON.stringify(image.event)},` +
      `"width":${image.width},"height":${image.height},` +
      `"strokeWidth":${image.strokeWidth},"shapes":[`;
    const shapes = image.shapes.map((shape) => `\n      ${JSON.stringify(shape)}`).join(',');
    return `  ${JSON.stringify(name)}: ${head}${shapes}\n    ]}}`;
  });
  return `{\n${entries.join(',\n')}\n}\n`;
}
