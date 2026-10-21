import { colorFor } from '../../draw/color';
import { cubeNetHeight, cubeNetWidth, CUBIE_SIZE, faceOrigin, slotIndex } from '../../draw/cube';
import type { ColorScheme, ImageShape } from '../../draw/types';
import { FACES, type Face } from '../../notation/move';
import { modelForSize } from '../../puzzles/nxn/state';
import { cubeNetState } from './nets';
import { MIRROR_OFFSET } from './shape-mod/solids';
import { shadeColor } from './shape-mod/shade';
import type { UnofficialScrambleImage } from './types';

/**
 * The Mirror Cube as a flat, printable **height map**: a 3x3x3 net whose tiles
 * are tinted by how far each one stands out, with a contour line at every step
 * between neighbouring tiles.
 *
 * ## Why one number per tile is enough
 *
 * The mechanism's cut planes sit at ±½ and never move. A piece in the outer
 * layer of face `H` extends beyond that cut by the layer's thickness `t(H)`, and
 * a turn is a rigid motion, so the piece keeps that extent along whichever axis
 * its `H` sticker comes to face. **The height of a tile above its face is
 * therefore `t(home face of the sticker on it)`.** That is six values, one per
 * face, and the sticker net already knows every sticker's home face.
 * (`01-drawing-design.md` §3 has the derivation.)
 *
 * The Mirror Cube is the one shape mod this works for: only its surface stays
 * made of axis-aligned boxes, so only its height is a single number per tile.
 *
 * ## How it is shown
 *
 * Two conventions from map-making, not from any puzzle program:
 * - **hypsometric tint**: a tile's fill is the surface colour, darker the lower
 *   it sits. The puzzle has one colour, so tone carries no false colour;
 * - **step contours**: a line along every shared edge of two tiles on the same
 *   face whose heights differ, thicker for a bigger step.
 */

/** Each face's layer thickness: `1 ± Δ`, positive on R, U and F (`MIRROR_OFFSET`). */
export const MIRROR_THICKNESS: Readonly<Record<Face, number>> = {
  R: 1 + MIRROR_OFFSET.x,
  L: 1 - MIRROR_OFFSET.x,
  U: 1 + MIRROR_OFFSET.y,
  D: 1 - MIRROR_OFFSET.y,
  F: 1 + MIRROR_OFFSET.z,
  B: 1 - MIRROR_OFFSET.z,
};

const THINNEST = Math.min(...Object.values(MIRROR_THICKNESS));
const THICKEST = Math.max(...Object.values(MIRROR_THICKNESS));

/** The lowest tile keeps 45% of the surface colour's brightness, the highest all of it. */
function tint(height: number): number {
  return 0.45 + (0.55 * (height - THINNEST)) / (THICKEST - THINNEST);
}

const CONTOUR = '#000000';
const TILE_EDGE = '#7a7a7a';

/** Draws the scramble's height map. Returns the image without its event id. */
export function drawMirrorHeightMap(
  scramble: string,
  scheme: ColorScheme,
): Omit<UnofficialScrambleImage, 'event'> {
  const size = 3;
  const state = cubeNetState('mirror', scramble, size);
  const { facelets } = modelForSize(size);
  const index = slotIndex(size);
  const surface = colorFor(scheme, 'surface');

  const heightAt = (face: Face, row: number, col: number): number => {
    const slot = index.get(`${face}${row},${col}`);
    if (slot === undefined) throw new Error(`mirror-height-map: no facelet at ${face}[${row}][${col}]`);
    return MIRROR_THICKNESS[facelets[state.occupant[slot]!]!.face];
  };

  const tiles: ImageShape[] = [];
  const contours: ImageShape[] = [];
  for (const face of FACES) {
    const [ox, oy] = faceOrigin(face, size);
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const height = heightAt(face, row, col);
        tiles.push({
          kind: 'rect',
          x: ox + col * CUBIE_SIZE,
          y: oy + row * CUBIE_SIZE,
          w: CUBIE_SIZE,
          h: CUBIE_SIZE,
          fill: shadeColor(surface, tint(height)),
          stroke: TILE_EDGE,
          strokeWidth: 0.25,
          face: 'surface',
        });
        // Right and lower neighbours only, so each shared edge is visited once.
        if (col + 1 < size) {
          const step = Math.abs(height - heightAt(face, row, col + 1));
          if (step > 1e-9) {
            const x = ox + (col + 1) * CUBIE_SIZE;
            const y = oy + row * CUBIE_SIZE;
            contours.push(contour(`M ${x} ${y} L ${x} ${y + CUBIE_SIZE}`, step));
          }
        }
        if (row + 1 < size) {
          const step = Math.abs(height - heightAt(face, row + 1, col));
          if (step > 1e-9) {
            const x = ox + col * CUBIE_SIZE;
            const y = oy + (row + 1) * CUBIE_SIZE;
            contours.push(contour(`M ${x} ${y} L ${x + CUBIE_SIZE} ${y}`, step));
          }
        }
      }
    }
  }

  return {
    width: cubeNetWidth(size),
    height: cubeNetHeight(size),
    strokeWidth: 1,
    // Contours last, so no tile is painted over a step line.
    shapes: [...tiles, ...contours],
  };
}

/** A step line, 0.5 wide plus up to 2.5 more in proportion to the step: 3 for the largest possible. */
function contour(d: string, step: number): ImageShape {
  return {
    kind: 'path',
    d,
    fill: 'none',
    stroke: CONTOUR,
    strokeWidth: Number((0.5 + 2.5 * (step / (THICKEST - THINNEST))).toFixed(3)),
  };
}
