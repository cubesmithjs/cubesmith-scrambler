import { describe, expect, it } from 'vitest';
import { EDGE_POSITIONS_FTO, FACE_NORMALS, FACELETS_FTO } from '../puzzles/fto/geometry';
import { FTO_FACES } from '../puzzles/fto/notation';
import { vecCross, vecDot } from '../utils/vec3';
import { corpusFor } from './__tests__/corpus';
import { differingIndices, faceCounts, withinBounds } from './__tests__/invariants';
import { FTO_DEFAULT_SCHEME, FTO_IMAGE_HEIGHT, FTO_IMAGE_WIDTH, FTO_VIEWS } from './fto';
import { defaultColorScheme, drawScramble } from './index';

/**
 * The FTO picture is this package's own (no TNoodle release draws one), so
 * there is no reference image to match. What is checked instead is everything
 * a correct picture must satisfy — tiling, the colour each sticker wears, what
 * one turn changes — on literal scrambles, never generated ones.
 */

const area = (points: readonly (readonly [number, number])[]): number =>
  Math.abs(
    points.reduce((sum, [x, y], i) => {
      const [nx, ny] = points[(i + 1) % points.length]!;
      return sum + x * ny - nx * y;
    }, 0),
  ) / 2;

describe('the FTO drawing', () => {
  it('is two squares of 36 triangles each, inside its own bounds', () => {
    const image = drawScramble('fto', '');
    expect([image.width, image.height]).toEqual([FTO_IMAGE_WIDTH, FTO_IMAGE_HEIGHT]);
    expect(image.shapes).toHaveLength(72);
    for (const shape of image.shapes) {
      expect(shape.kind).toBe('polygon');
      if (shape.kind === 'polygon') expect(shape.points).toHaveLength(3);
    }
    expect(withinBounds(image)).toBe(true);
  });

  it('tiles each square exactly: the 72 triangles cover two squares without overlap', () => {
    const image = drawScramble('fto', '');
    const total = image.shapes.reduce(
      (sum, s) => sum + (s.kind === 'polygon' ? area(s.points) : 0),
      0,
    );
    expect(total).toBeCloseTo(2 * 180 * 180, 6);
    // Equal small triangles: the 3×3 subdivision of each face projects to nine of one size.
    const areas = image.shapes.map((s) => (s.kind === 'polygon' ? area(s.points) : 0));
    for (const a of areas) expect(a).toBeCloseTo((180 * 180) / 36, 6);
  });

  /**
   * Stickers of one physical edge piece must touch in the picture. Of the twelve
   * edges, the eight that meet the top or bottom vertex have both faces in the
   * same square, so their two triangles must share a whole side; the four on the
   * equator straddle the two squares and are checked by colour alone.
   */
  it('draws the two stickers of every non-equator edge as triangles sharing a side', () => {
    const image = drawScramble('fto', '');
    const key = ([x, y]: readonly [number, number]): string => `${x.toFixed(6)},${y.toFixed(6)}`;
    const points = image.shapes.map((s) => (s.kind === 'polygon' ? s.points.map(key) : []));
    let checked = 0;
    for (let i = 0; i < FACELETS_FTO.length; i += 1) {
      const a = FACELETS_FTO[i]!;
      if (a.kind !== 'edge') continue;
      // The edge this sticker belongs to, and the other face sharing it.
      const e = EDGE_POSITIONS_FTO.find(
        (edge) => vecDot(edge, FACE_NORMALS[a.face]) === 2 &&
          [0, 1, 2].every((k) => a.point[k] === FACE_NORMALS[a.face][k]! + 3 * edge[k]!),
      )!;
      if (e[2] === 0) continue; // an equator edge: its stickers are in different squares
      const j = FACELETS_FTO.findIndex(
        (b, k) => k !== i && b.kind === 'edge' && b.face !== a.face &&
          [0, 1, 2].every((c) => b.point[c] === FACE_NORMALS[b.face][c]! + 3 * e[c]!),
      );
      const shared = points[i]!.filter((p) => points[j]!.includes(p));
      expect(shared, `${a.face} edge sticker`).toHaveLength(2);
      checked += 1;
    }
    expect(checked).toBe(16); // 8 edges × 2 stickers
  });

  it('views both halves from outside, so neither is a mirror image', () => {
    for (const view of FTO_VIEWS) {
      expect(vecDot(vecCross(view.right, view.up), view.vertex)).toBeGreaterThan(0);
    }
  });

  it('draws a solved puzzle with nine stickers of each face colour', () => {
    const counts = faceCounts(drawScramble('fto', ''));
    for (const face of FTO_FACES) expect(counts[face], face).toBe(9);
  });

  /**
   * A turn moves 27 stickers, but the nine on the turned face stay its colour,
   * so exactly 18 change: five along each of the three faces sharing an edge,
   * one corner sticker on each of the three sharing only a vertex.
   */
  it.each(FTO_FACES)('changes exactly 18 stickers when %s is turned', (face) => {
    const solved = drawScramble('fto', '');
    expect(differingIndices(solved, drawScramble('fto', face))).toHaveLength(18);
    expect(drawScramble('fto', `${face} ${face}'`)).toEqual(solved);
    expect(drawScramble('fto', `${face} ${face} ${face}`)).toEqual(solved);
  });

  it('draws every corpus scramble with the right number of each colour', () => {
    for (const scramble of corpusFor('fto')) {
      const counts = faceCounts(drawScramble('fto', scramble));
      for (const face of FTO_FACES) expect(counts[face], `${face}: ${scramble}`).toBe(9);
      expect(differingIndices(drawScramble('fto', ''), drawScramble('fto', scramble)).length).toBeGreaterThan(0);
    }
  });
});

describe('the FTO colour scheme', () => {
  it('is the Lanlan scheme, pinned', () => {
    expect(FTO_DEFAULT_SCHEME).toEqual({
      U: '#ffffff',
      F: '#ff0000',
      BR: '#808080',
      BL: '#ff8000',
      L: '#8000ff',
      R: '#00ff00',
      D: '#ffff00',
      B: '#0000ff',
    });
    expect(defaultColorScheme('fto')).toEqual(FTO_DEFAULT_SCHEME);
  });

  it('overrides only the keys it is given', () => {
    const image = drawScramble('fto', '', { BR: '#123456' });
    const fills = new Set(image.shapes.map((s) => s.fill));
    expect(fills.has('#123456')).toBe(true);
    expect(fills.has(FTO_DEFAULT_SCHEME.BR!)).toBe(false);
    for (const face of FTO_FACES.filter((f) => f !== 'BR')) {
      expect(fills.has(FTO_DEFAULT_SCHEME[face]!), face).toBe(true);
    }
  });
});
