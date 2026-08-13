/**
 * The structural invariants every drawing has to satisfy, in one place.
 *
 * These are what make "the same as TNoodle" checkable at all. Reading constants
 * off Java and re-typing them into TypeScript is exactly the transcription error
 * this package's design docs are hostile to, and a golden fixture only proves the
 * output has not *changed* — not that it was ever right. Each helper below holds
 * independently of the transcription, so a transposed offset or a mirrored face
 * fails one of them rather than producing a picture that merely looks like a cube.
 *
 * Not a `.test.ts`, so Vitest does not collect it as a suite, and under
 * `__tests__/` so it is outside the coverage report — it is test scaffolding, not
 * shipped code.
 */
import type { ImageShape, ScrambleImage } from '../types';

/** Every point a shape occupies, for the bounds check. */
export function pointsOf(shape: ImageShape): readonly (readonly [number, number])[] {
  switch (shape.kind) {
    case 'rect':
      return [
        [shape.x, shape.y],
        [shape.x + shape.w, shape.y + shape.h],
      ];
    case 'circle':
      return [
        [shape.cx - shape.r, shape.cy - shape.r],
        [shape.cx + shape.r, shape.cy + shape.r],
      ];
    case 'polygon':
      return shape.points;
    case 'path':
      // No drawer emits a `path` yet; the kind exists for a future puzzle whose
      // geometry needs a curve, and a bounds claim over an unparsed `d` would be a
      // guess rather than a check.
      return [];
  }
}

/** Every shape lies inside `0..width` x `0..height`. A float epsilon, because most of these are trigonometric. */
export function withinBounds(image: ScrambleImage, epsilon = 1e-6): boolean {
  return image.shapes.every((shape) =>
    pointsOf(shape).every(
      ([x, y]) =>
        x >= -epsilon &&
        y >= -epsilon &&
        x <= image.width + epsilon &&
        y <= image.height + epsilon,
    ),
  );
}

/**
 * The picture as a comparable value — fills in paint order.
 *
 * Geometry is deliberately excluded: it is fixed for an event, so including it
 * would make every "does the state show through" assertion also a geometry
 * assertion, and a failure would not say which one broke.
 */
export function fillSequence(image: ScrambleImage): string {
  return image.shapes.map((shape) => shape.fill).join('|');
}

/**
 * The multiset of colours, as a stable string.
 *
 * 🔴 The single cheapest check in the whole suite: a move **permutes** stickers, it
 * never repaints one, so this is invariant under every scramble of every puzzle.
 * Most permutation bugs — a destination written where a source belonged, a facelet
 * carried to a slot that already had an occupant — break it immediately.
 */
export function colourMultiset(image: ScrambleImage): string {
  const counts = new Map<string, number>();
  for (const shape of image.shapes) {
    counts.set(shape.fill, (counts.get(shape.fill) ?? 0) + 1);
  }
  return JSON.stringify([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

/** How many stickers wear each colour-scheme key. `undefined` faces (hands, bars) are skipped. */
export function faceCounts(image: ScrambleImage): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const shape of image.shapes) {
    if (shape.face === undefined) continue;
    counts[shape.face] = (counts[shape.face] ?? 0) + 1;
  }
  return counts;
}

/** Indices where two pictures of the same event differ — for "this move touched only these stickers". */
export function differingIndices(a: ScrambleImage, b: ScrambleImage): number[] {
  if (a.shapes.length !== b.shapes.length) {
    throw new Error('invariants: two pictures of the same event must have the same shape count');
  }
  const differing: number[] = [];
  for (let i = 0; i < a.shapes.length; i += 1) {
    if (a.shapes[i]!.fill !== b.shapes[i]!.fill) differing.push(i);
  }
  return differing;
}

/**
 * A Square-1 layer's twelve side stickers, read off the drawn geometry and bucketed
 * by the 30° wedge each one occupies. Bucket `b` covers `[15 + 30b, 45 + 30b)` on
 * screen; `'u'` is the upper view, `'l'` the lower one.
 *
 * 🔴 Read from the **coordinates**, not from the walk that produced them. A drawing
 * bug that misorders a ring produces exactly the right multiset of faces in exactly
 * the right count — the only thing wrong is *where each one landed*, which nothing
 * that reasons over the shape list in paint order can see. This is the one helper
 * that looks at where a sticker actually is.
 */
export function square1SideRing(image: ScrambleImage, layer: 'u' | 'l'): readonly string[] {
  const centreY = layer === 'u' ? image.height / 4 : (3 * image.height) / 4;
  const ring = new Array<string>(12).fill('');
  for (const shape of image.shapes) {
    if (shape.kind !== 'polygon') continue;
    if (shape.face === undefined || !'LBRF'.includes(shape.face)) continue;
    const cx = shape.points.reduce((sum, [x]) => sum + x, 0) / shape.points.length;
    const cy = shape.points.reduce((sum, [, y]) => sum + y, 0) / shape.points.length;
    if ((cy < image.height / 2 ? 'u' : 'l') !== layer) continue;
    const degrees = (Math.atan2(cy - centreY, cx - image.width / 2) * 180) / Math.PI;
    const bucket = Math.floor(((((degrees - 15) % 360) + 360) % 360) / 30);
    if (ring[bucket] !== '') {
      throw new Error(`invariants: two Square-1 side stickers in wedge ${bucket} of layer ${layer}`);
    }
    ring[bucket] = shape.face;
  }
  return ring;
}

/**
 * Whether every face in `ring` occupies **one contiguous run** of wedges, counting
 * cyclically.
 *
 * This is a fact about the puzzle, not about the drawing: a face is a flat side, so
 * its stickers are angularly adjacent in every state a Square-1 can reach — a turn
 * moves pieces between rings and around a ring, but it can never interleave two
 * faces' stickers within one layer.
 */
export function hasContiguousFaceRuns(ring: readonly string[]): boolean {
  return [...new Set(ring)].every((face) => {
    const boundaries = ring.filter(
      (f, i) => f === face && ring[(i + ring.length - 1) % ring.length] !== face,
    );
    return boundaries.length === 1;
  });
}

// A `seededScrambleSeeds` helper used to live here, for the "20 seeded cases" tests.
// It went away with the switch to a literal scramble corpus (`__tests__/corpus.ts`) —
// nothing in the drawing tests generates a scramble any more, so nothing needs a seed.
