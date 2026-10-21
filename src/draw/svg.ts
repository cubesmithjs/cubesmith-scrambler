import type { ImageShape, ScrambleImage } from './types';

/** How many decimals a coordinate keeps. Enough for sub-pixel geometry, short enough to diff. */
const PRECISION = 4;

function num(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`@cubesmith/scrambler: a shape carried a non-finite coordinate (${value})`);
  }
  // `parseFloat` of a fixed-decimal string drops trailing zeros, so an integer
  // coordinate prints as `70` rather than `70.0000` — which is most of them, and
  // is what makes a golden fixture readable.
  return String(Number.parseFloat(value.toFixed(PRECISION)));
}

/**
 * Serializes a {@link ScrambleImage} to a standalone SVG document string.
 *
 * ## Why nothing is escaped here
 *
 * Every value written below is either a number this package computed or a colour
 * string it validated. There is no text content, no `title`, and no caller-supplied
 * attribute — a caller's colour override is checked against `#rgb`/`#rrggbb`/a CSS
 * named colour by `mergeColorScheme` **at the door**, because this output is inline
 * markup in a consumer's page and a `fill` attribute is a place a `"` would close
 * early. Validating on the way in rather than escaping on the way out means there
 * is one place to be right instead of one place per attribute.
 *
 * `viewBox` is set from the image's intrinsic size and no `width`/`height` in
 * pixels is forced, so the caller's CSS decides how large it renders — which is
 * TNoodle's `getPreferredSize(maxWidth, maxHeight)` question answered by the
 * medium instead of by this function.
 */
export function scrambleImageToSvg(image: ScrambleImage): string {
  return imageToSvg(image);
}

/**
 * The serializer itself, over only the fields it reads. The unofficial entry's
 * images carry an unofficial event id, so they are not `ScrambleImage`s, and they
 * serialize through this rather than through a copy of it.
 */
export function imageToSvg(
  image: Pick<ScrambleImage, 'width' | 'height' | 'strokeWidth' | 'shapes'>,
): string {
  const body = image.shapes.map(shapeToSvg).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(image.width)} ${num(image.height)}"` +
    ` width="${num(image.width)}" height="${num(image.height)}"` +
    ` stroke-linejoin="round" stroke-width="${num(image.strokeWidth)}">${body}</svg>`
  );
}

function paint(shape: ImageShape): string {
  const width = shape.strokeWidth === undefined ? '' : ` stroke-width="${num(shape.strokeWidth)}"`;
  return ` fill="${shape.fill}" stroke="${shape.stroke}"${width}`;
}

function shapeToSvg(shape: ImageShape): string {
  switch (shape.kind) {
    case 'rect':
      return (
        `<rect x="${num(shape.x)}" y="${num(shape.y)}"` +
        ` width="${num(shape.w)}" height="${num(shape.h)}"${paint(shape)}/>`
      );
    case 'circle':
      return `<circle cx="${num(shape.cx)}" cy="${num(shape.cy)}" r="${num(shape.r)}"${paint(shape)}/>`;
    case 'polygon': {
      const points = shape.points.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
      return `<polygon points="${points}"${paint(shape)}/>`;
    }
    case 'path':
      return `<path d="${shape.d}"${paint(shape)}/>`;
  }
}
