/**
 * Internal-only geometric derivation of the NxNxN move permutations, at the
 * *facelet* level.
 *
 * ## Why facelets rather than cubies
 *
 * The other puzzles here model pieces with orientation counters, because their
 * solvers need coordinates that a search can reason about. The cubes in this
 * module are **random-moves** events (Regulation 4b3e) and have no solver, so
 * there is nothing to coordinatise — and a facelet model is both simpler and a
 * *stronger* check on the derived moves, since it tracks every sticker
 * individually rather than a piece plus a twist.
 *
 * ## The coordinate model
 *
 * Everything is on an exact integer lattice, doubled so cubie centers land on
 * odd coordinates: a cube of size `n` spans `[-n, n]`, each cubie is 2 units
 * across, and cubie centers run over the odd values `-(n-1) … (n-1)`. A
 * facelet is a cubie center plus its outward unit normal, so it always has one
 * coordinate at exactly `±n`.
 *
 * Carrying the normal alongside the position is what makes the layer test
 * correct: which layer a facelet belongs to is a property of its *cubie*, not
 * of the facelet's own position. A sticker on the R face sits at `x = n`
 * whatever cube it's on, so testing its position would put every R-face
 * sticker in the outermost layer of every axis.
 *
 * The 90° rotations come from `utils/vec3.ts`, the same ones
 * `puzzles/333/geometry.ts` derives its move tables from, so there is one
 * place for the sign convention to be right or wrong.
 */

import type { Face } from '../../notation/move';
import { FACE_AXIS, rotateQuarter, vecEquals, vecKey, type Vec3 } from '../../utils/vec3';
import { maxDepthForSize, type WideMove } from './notation';

export interface Facelet {
  /** Cubie center plus the outward normal — so one coordinate is always `±size`. */
  readonly position: Vec3;
  /** Which way the sticker faces, and therefore which face's color it wears when solved. */
  readonly normal: Vec3;
  readonly face: Face;
}

const FACE_NORMALS: Readonly<Record<Face, Vec3>> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

const FACE_BY_NORMAL = new Map<string, Face>(
  (Object.keys(FACE_NORMALS) as Face[]).map((face) => [vecKey(FACE_NORMALS[face]), face]),
);

/** Odd coordinates from `-(size-1)` to `size-1` — the cubie centers along one axis. */
function centerCoordinates(size: number): number[] {
  return Array.from({ length: size }, (_, i) => 2 * i - size + 1);
}

/**
 * Every facelet of a cube of this size, `6 * size^2` of them, generated from
 * the six normals and the grid of cubie centers rather than listed.
 */
export function buildFacelets(size: number): readonly Facelet[] {
  maxDepthForSize(size); // validates the size
  const coordinates = centerCoordinates(size);
  const facelets: Facelet[] = [];

  for (const face of Object.keys(FACE_NORMALS) as Face[]) {
    const normal = FACE_NORMALS[face];
    const { index } = FACE_AXIS[face];
    // The two axes that vary across the face.
    const spans = ([0, 1, 2] as const).filter((axis) => axis !== index);
    for (const a of coordinates) {
      for (const b of coordinates) {
        const center: number[] = [0, 0, 0];
        center[index] = normal[index]! * (size - 1);
        center[spans[0]!] = a;
        center[spans[1]!] = b;
        const position: Vec3 = [
          center[0]! + normal[0],
          center[1]! + normal[1],
          center[2]! + normal[2],
        ];
        facelets.push({ position, normal, face });
      }
    }
  }

  return facelets;
}

function faceletKey(facelet: { position: Vec3; normal: Vec3 }): string {
  return `${vecKey(facelet.position)}|${vecKey(facelet.normal)}`;
}

/**
 * Whether a facelet's cubie is inside the block a depth-`depth` turn of
 * `face` moves. The cubie center is the facelet's position minus its normal;
 * a block of `depth` layers reaches in to center coordinate
 * `size - 2*depth + 1` measured along the face's outward direction.
 */
function inBlock(facelet: Facelet, face: Face, depth: number, size: number): boolean {
  const { index, sign } = FACE_AXIS[face];
  const center = facelet.position[index] - facelet.normal[index];
  return sign * center >= size - 2 * depth + 1;
}

/**
 * `destination[i]` = the slot the facelet at slot `i` moves to, for one
 * application of `move` on a cube of `size`.
 */
export function deriveFaceletPermutation(
  facelets: readonly Facelet[],
  move: WideMove,
  size: number,
): readonly number[] {
  const slotByKey = new Map<string, number>(facelets.map((f, i) => [faceletKey(f), i]));
  const destination = new Array<number>(facelets.length);

  for (let i = 0; i < facelets.length; i += 1) {
    const facelet = facelets[i]!;
    if (!inBlock(facelet, move.face, move.depth, size)) {
      destination[i] = i;
      continue;
    }
    let position = facelet.position;
    let normal = facelet.normal;
    for (let turn = 0; turn < move.amount; turn += 1) {
      position = rotateQuarter(move.face, position);
      normal = rotateQuarter(move.face, normal);
    }
    const slot = slotByKey.get(faceletKey({ position, normal }));
    if (slot === undefined) {
      throw new Error(
        `nxn-geometry: ${move.face} carried a facelet off the cube (size ${size}, depth ${move.depth})`,
      );
    }
    destination[i] = slot;
  }

  return destination;
}

export function faceOfNormal(normal: Vec3): Face {
  const face = FACE_BY_NORMAL.get(vecKey(normal));
  if (!face) throw new Error(`nxn-geometry: [${normal.join(',')}] is not a face normal`);
  return face;
}

export { FACE_NORMALS, vecEquals };
