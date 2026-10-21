import { describe, expect, it } from 'vitest';
import { drawMirrorHeightMap, MIRROR_THICKNESS } from './mirror-height-map';
import { SHAPE_MOD_SOLIDS } from './shape-mod/solids';

const scheme = SHAPE_MOD_SOLIDS.mirror!.defaultScheme;
const contours = (scramble: string) =>
  drawMirrorHeightMap(scramble, scheme).shapes.filter((s) => s.kind === 'path');
const tiles = (scramble: string) =>
  drawMirrorHeightMap(scramble, scheme).shapes.filter((s) => s.kind === 'rect');

describe('the Mirror Cube height map', () => {
  it('gives all six layers different thicknesses, so every piece is a different block', () => {
    expect(new Set(Object.values(MIRROR_THICKNESS)).size).toBe(6);
  });

  it('solved: each face is one tint, and there is no step anywhere', () => {
    expect(contours('')).toHaveLength(0);
    const fills = tiles('').map((t) => t.fill);
    expect(new Set(fills).size).toBe(6);
    for (let face = 0; face < 6; face += 1) {
      expect(new Set(fills.slice(face * 9, face * 9 + 9)).size).toBe(1);
    }
  });

  it('after R: the predicted steps, from the derivation alone', () => {
    // R moves a column of F, U, B and D stickers onto its neighbour. Each of
    // those four faces then has a 3x1 column of a different height beside its
    // middle column: three steps each. R's own face only rotates, so it stays
    // uniform, and L is untouched. 4 faces × 3 = 12 contour lines.
    expect(contours('R')).toHaveLength(12);
  });

  it('a scramble followed by its inverse draws exactly the solved map', () => {
    expect(drawMirrorHeightMap("R U F' L2 D B R' U'", scheme)).not.toEqual(drawMirrorHeightMap('', scheme));
    expect(drawMirrorHeightMap("R U F' L2 D B R' U' U R B' D' L2 F U' R'", scheme)).toEqual(
      drawMirrorHeightMap('', scheme),
    );
  });

  it('draws a bigger step with a thicker line', () => {
    const widths = contours("R U2 F' B D2 L").map((c) => c.strokeWidth!);
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths));
  });
});
