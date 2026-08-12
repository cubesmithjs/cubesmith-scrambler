import { describe, expect, it } from 'vitest';
import { invertAlgorithm, parseAlgorithm, serializeAlgorithm } from '../notation/alg';
import type { WcaEventId } from '../core/types';
import { CUBE_DEFAULT_SCHEME, CUBE_NET_EVENTS, eventCubeSize } from './cube';
import { drawScramble } from './index';
import { corpusFor, SCRAMBLE_CORPUS } from './__tests__/corpus';
import {
  colourMultiset,
  differingIndices,
  faceCounts,
  fillSequence,
  withinBounds,
} from './__tests__/invariants';
import type { ImageShape } from './types';

/**
 * 🔴 This file imports **no scrambler**. Not `../index`, not `generateScramble`.
 *
 * A drawing takes text, so the scrambles come from `__tests__/corpus.ts` as literal
 * strings — see that file for why. The practical consequence is that this suite runs
 * in milliseconds under `--coverage`, where the generating version timed out.
 */

const SIZES: readonly number[] = [2, 3, 4, 5, 6, 7];

/** A sticker by its position in the net, so an assertion can name a slot rather than an index. */
function stickerAt(shapes: readonly ImageShape[], x: number, y: number): ImageShape {
  const found = shapes.find((s) => s.kind === 'rect' && s.x === x && s.y === y);
  if (!found) throw new Error(`no sticker at (${x}, ${y})`);
  return found;
}

/** `drawCube`'s own face origins, recomputed here from the quoted formula rather than imported. */
function origin(face: 'U' | 'D' | 'F' | 'B' | 'L' | 'R', size: number): [number, number] {
  const gap = 2;
  const s = size * 10;
  switch (face) {
    case 'L': return [gap, 2 * gap + s];
    case 'D': return [2 * gap + s, 3 * gap + 2 * s];
    case 'B': return [4 * gap + 3 * s, 2 * gap + s];
    case 'R': return [3 * gap + 2 * s, 2 * gap + s];
    case 'U': return [2 * gap + s, gap];
    case 'F': return [2 * gap + s, 2 * gap + s];
  }
}

function slot(
  event: WcaEventId,
  scramble: string,
  face: 'U' | 'D' | 'F' | 'B' | 'L' | 'R',
  row: number,
  col: number,
): string {
  const size = eventCubeSize(event);
  const [ox, oy] = origin(face, size);
  const image = drawScramble(event, scramble);
  return stickerAt(image.shapes, ox + col * 10, oy + row * 10).face!;
}

describe('the cube net', () => {
  it('covers all twelve cube events, with sizes from a table rather than the event id', () => {
    expect([...CUBE_NET_EVENTS].sort()).toEqual(
      ['222', '333', '333bf', '333fm', '333mbf', '333oh', '444', '444bf', '555', '555bf', '666', '777'].sort(),
    );
    // 🔴 `333mbf` is 3 and `444bf` is 4 — both would break a parse of the digits.
    expect(eventCubeSize('333mbf')).toBe(3);
    expect(eventCubeSize('444bf')).toBe(4);
    expect(eventCubeSize('555bf')).toBe(5);
  });

  it('sizes each net from TNoodle\'s formula, computed here rather than hard-coded', () => {
    const gap = 2;
    const cubie = 10;
    for (const size of SIZES) {
      const event = (size === 2 ? '222' : size === 3 ? '333' : `${size}${size}${size}`) as WcaEventId;
      const image = drawScramble(event, '');
      expect(image.width, event).toBe((size * cubie + gap) * 4 + gap);
      expect(image.height, event).toBe((size * cubie + gap) * 3 + gap);
    }
  });

  it('draws exactly 6 * size^2 stickers', () => {
    for (const event of CUBE_NET_EVENTS) {
      const size = eventCubeSize(event);
      expect(drawScramble(event, '').shapes, event).toHaveLength(6 * size * size);
    }
  });

  it('draws the empty scramble as six single-coloured faces in the scheme\'s own colours', () => {
    for (const event of CUBE_NET_EVENTS) {
      const size = eventCubeSize(event);
      const image = drawScramble(event, '');
      expect(faceCounts(image), event).toEqual({
        U: size * size, D: size * size, F: size * size,
        B: size * size, L: size * size, R: size * size,
      });
      // And the colour really is the scheme's entry for that face, not merely consistent.
      for (const shape of image.shapes) {
        expect(shape.fill, `${event} ${shape.face}`).toBe(CUBE_DEFAULT_SCHEME[shape.face!]);
      }
    }
  });

  /**
   * 🔴 The orientation pins — the assertions that catch a transposed or mirrored
   * face, which nothing else would, because a transposed cube still looks like a
   * cube.
   *
   * Each is read off a physical 3x3x3 rather than off the implementation: turn `R`
   * clockwise and the F face's right column takes what was on D, while the U face's
   * right column takes what was on F. Both faces, so a transpose of either fails.
   */
  it('🔴 places an R turn where a physical cube puts it, on both F and U', () => {
    for (const row of [0, 1, 2]) {
      expect(slot('333', 'R', 'F', row, 2), `F row ${row}`).toBe('D');
      expect(slot('333', 'R', 'U', row, 2), `U row ${row}`).toBe('F');
      // The left columns are untouched by R.
      expect(slot('333', 'R', 'F', row, 0), `F left ${row}`).toBe('F');
    }
  });

  it('🔴 places a U turn where a physical cube puts it', () => {
    // U clockwise: F's top row takes what was on R, and R's top row takes what was on B.
    for (const col of [0, 1, 2]) {
      expect(slot('333', 'U', 'F', 0, col), `F col ${col}`).toBe('R');
      expect(slot('333', 'U', 'R', 0, col), `R col ${col}`).toBe('B');
      expect(slot('333', 'U', 'F', 2, col), `F bottom ${col}`).toBe('F');
    }
  });

  it('🔴 places an F turn where a physical cube puts it', () => {
    // F clockwise: U's bottom row takes what was on L, and R's left column takes what was on U.
    for (const i of [0, 1, 2]) {
      expect(slot('333', 'F', 'U', 2, i), `U col ${i}`).toBe('L');
      expect(slot('333', 'F', 'R', i, 0), `R row ${i}`).toBe('U');
    }
  });

  it('moves two columns for Rw on 4x4x4 and three for 3Rw on 5x5x5', () => {
    const moved = (event: WcaEventId, scramble: string): number[] => {
      const size = eventCubeSize(event);
      const columns: number[] = [];
      for (let col = 0; col < size; col += 1) {
        if (slot(event, scramble, 'F', 0, col) !== 'F') columns.push(col);
      }
      return columns;
    };
    expect(moved('444', 'Rw')).toEqual([2, 3]);
    expect(moved('444', 'R')).toEqual([3]);
    expect(moved('555', '3Rw')).toEqual([2, 3, 4]);
    expect(moved('555', 'Rw')).toEqual([3, 4]);
  });

  /**
   * 🔴 The assertion that catches a rotation implemented as a turn.
   *
   * A whole-cube rotation moves no piece relative to any other, so every face stays
   * single-coloured — but on a *different* face. A `y2` implemented as a `U2` would
   * leave four faces striped, and would look almost right.
   */
  it('🔴 keeps every face single-coloured under a whole-cube rotation, but relocated', () => {
    for (const [event, rotation] of [['444bf', 'y2'], ['333bf', 'z'], ['555bf', "x'"]] as const) {
      const image = drawScramble(event, rotation);
      const size = eventCubeSize(event);
      const counts = faceCounts(image);
      // Six colours, size^2 of each: still six uniform faces.
      expect(Object.values(counts).sort(), `${event} ${rotation}`).toEqual(
        Array.from({ length: 6 }, () => size * size),
      );
      for (const face of ['U', 'D', 'F', 'B', 'L', 'R'] as const) {
        const [ox, oy] = origin(face, size);
        const shown = new Set<string>();
        for (let row = 0; row < size; row += 1) {
          for (let col = 0; col < size; col += 1) {
            shown.add(stickerAt(image.shapes, ox + col * 10, oy + row * 10).face!);
          }
        }
        expect(shown.size, `${event} ${rotation} ${face}`).toBe(1);
      }
      // …and it is genuinely a different picture from solved.
      expect(fillSequence(image)).not.toBe(fillSequence(drawScramble(event, '')));
    }
  });

  it('returns to the solved picture under a scramble and its inverse, at every size', () => {
    for (const size of SIZES) {
      const event = (size === 2 ? '222' : size === 3 ? '333' : `${size}${size}${size}`) as WcaEventId;
      for (const scramble of corpusFor(event)) {
        const inverse = serializeAlgorithm(invertAlgorithm(parseAlgorithm(scramble)));
        expect(fillSequence(drawScramble(event, `${scramble} ${inverse}`)), event).toBe(
          fillSequence(drawScramble(event, '')),
        );
        // And the scramble alone is not the solved picture, so the round trip is not vacuous.
        expect(fillSequence(drawScramble(event, scramble)), event).not.toBe(
          fillSequence(drawScramble(event, '')),
        );
      }
    }
  });

  it('🔴 keeps the colour multiset invariant under any scramble', () => {
    // Every event with a corpus entry. The four that share a size with another
    // (`333oh`, and the sizes without their own scramble) are covered by the
    // all-twelve shape-count and solved-colour tests above; what this one needs is a
    // *scrambled* state, and a scramble for the size is what produces one.
    for (const event of CUBE_NET_EVENTS) {
      const scrambles = SCRAMBLE_CORPUS[event];
      if (!scrambles) continue;
      for (const scramble of scrambles) {
        expect(colourMultiset(drawScramble(event, scramble)), `${event}: ${scramble}`).toBe(
          colourMultiset(drawScramble(event, '')),
        );
      }
    }
  });

  it('keeps every sticker inside the net, and no two stickers on one slot', () => {
    for (const event of CUBE_NET_EVENTS) {
      const image = drawScramble(event, '');
      expect(withinBounds(image), event).toBe(true);
      const positions = new Set(
        image.shapes.map((s) => (s.kind === 'rect' ? `${s.x},${s.y}` : 'other')),
      );
      expect(positions.size, event).toBe(image.shapes.length);
    }
  });

  it('draws 333fm with its R\' U\' F padding and 444bf with its trailing rotation, as ordinary tokens', () => {
    const fm = corpusFor('333fm')[0]!;
    // The padding is real in the corpus entry, so this is checking the fixture is the
    // thing it claims to be as much as the drawing.
    expect(fm.startsWith("R' U' F")).toBe(true);
    expect(fm.endsWith("R' U' F")).toBe(true);
    expect(() => drawScramble('333fm', fm)).not.toThrow();
    expect(colourMultiset(drawScramble('333fm', fm))).toBe(colourMultiset(drawScramble('333fm', '')));

    for (const bf of corpusFor('444bf')) {
      // A `444bf` scramble ends in a whole-cube rotation — `x2`, `z' y'` — which is
      // the case the drawing layer had to derive a permutation for.
      expect(/(?:^|\s)[xyz][2']?\s*$/.test(bf), bf.slice(-12)).toBe(true);
      expect(() => drawScramble('444bf', bf)).not.toThrow();
      expect(colourMultiset(drawScramble('444bf', bf))).toBe(
        colourMultiset(drawScramble('444bf', '')),
      );
    }
  });

  it('draws one picture per cube for 333mbf, one entry of `scrambles` at a time', () => {
    // The multi-blind shape, without generating: three cubes' worth of 3BLD scrambles
    // is three strings, and what the drawing layer sees is one at a time.
    const cubes = [corpusFor('333mbf')[0]!, corpusFor('333bf')[0]!, corpusFor('333bf')[1]!];
    const images = cubes.map((s) => drawScramble('333mbf', s));
    expect(images).toHaveLength(3);
    // Three different cubes, so three different pictures.
    expect(new Set(images.map(fillSequence)).size).toBe(3);
  });

  it('changes the colour of exactly the twelve stickers an R turn recolours', () => {
    // An `R` on a 3x3x3 moves 3 stickers on each of F, U, B and D — twelve slots
    // that change colour. The R face's own nine stickers *move* but stay red, so a
    // fill comparison cannot see them, and asserting twenty here would be asserting
    // something this check does not measure. `differingIndices` compares colours.
    const differing = differingIndices(drawScramble('333', ''), drawScramble('333', 'R'));
    expect(differing).toHaveLength(12);
  });
});
