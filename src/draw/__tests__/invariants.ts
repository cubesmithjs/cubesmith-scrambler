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

// A `seededScrambleSeeds` helper used to live here, for the "20 seeded cases" tests.
// It went away with the switch to a literal scramble corpus (`__tests__/corpus.ts`) —
// nothing in the drawing tests generates a scramble any more, so nothing needs a seed.
