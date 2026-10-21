import type { Face } from '../../../notation/move';
import type { WideMove } from '../../../puzzles/nxn/notation';
import { cross, dot, scale, sub, type V3 } from './geometry';

/**
 * The 3x3x3 mechanism every shape mod shares, as **cubies with rotations**.
 *
 * The NxN sticker model (`puzzles/nxn/state.ts`) says which sticker is where,
 * which is all a flat net needs. A shape mod needs more, because its pieces are
 * not cubes. To draw a piece, the engine has to know the rigid motion that
 * carried it from home: where it is, and which of the 24 cube rotations it has
 * undergone. A centre's rotation is visible here too, which is exactly the
 * supercube information an Axis or Fisher Cube shows and a flat net cannot.
 *
 * Coordinates: R = +x, U = +y, F = +z, the same as `puzzles/nxn/geometry.ts`.
 * Cubie centres are the integer points of `{-1, 0, 1}³` except the core.
 * `mechanism.test.ts` checks this model against the NxN sticker model, sticker
 * by sticker, after every move of random sequences.
 */

/** A rotation as its three columns: the images of `e_x`, `e_y`, `e_z`. */
export type Rotation = readonly [V3, V3, V3];

export interface Cubie {
  /** Where it starts, and so which piece of the outer solid it is. */
  readonly home: V3;
  /** Where it is now. Always `rotation · home`. */
  readonly position: V3;
  /** The rigid rotation from its home pose to its current one. */
  readonly rotation: Rotation;
}

export const FACE_NORMAL: Readonly<Record<Face, V3>> = {
  R: [1, 0, 0],
  L: [-1, 0, 0],
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};

const IDENTITY: Rotation = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export function solvedMechanism(): Cubie[] {
  const cubies: Cubie[] = [];
  for (const x of [-1, 0, 1]) {
    for (const y of [-1, 0, 1]) {
      for (const z of [-1, 0, 1]) {
        if (x === 0 && y === 0 && z === 0) continue;
        const home: V3 = [x, y, z];
        cubies.push({ home, position: home, rotation: IDENTITY });
      }
    }
  }
  return cubies;
}

/**
 * A clockwise quarter turn about `axis` (a unit face normal), as seen from
 * outside that face: −90° by the right-hand rule. With cos = 0 and sin = −1,
 * Rodrigues' formula reduces to `axis (axis · v) − axis × v`. Every input and
 * output is an integer vector, so repeated turns accumulate no rounding.
 */
function quarterTurn(axis: V3, v: V3): V3 {
  return sub(scale(axis, dot(axis, v)), cross(axis, v));
}

export function applyRotation(rotation: Rotation, v: V3): V3 {
  return [
    rotation[0][0] * v[0] + rotation[1][0] * v[1] + rotation[2][0] * v[2],
    rotation[0][1] * v[0] + rotation[1][1] * v[1] + rotation[2][1] * v[2],
    rotation[0][2] * v[0] + rotation[1][2] * v[1] + rotation[2][2] * v[2],
  ];
}

/**
 * Applies one move. A move of depth `d` on face `F` turns every cubie whose
 * coordinate along F's normal is at least `2 − d`: the outer layer for `R`,
 * two layers for `Rw`, all three for a rotation (which `parseCubeNetMoves`
 * reports as depth = size).
 */
export function applyMechanismMove(cubies: readonly Cubie[], move: WideMove): Cubie[] {
  const axis = FACE_NORMAL[move.face];
  const threshold = 2 - move.depth;
  return cubies.map((cubie) => {
    if (dot(axis, cubie.position) < threshold) return cubie;
    let position = cubie.position;
    let rotation = cubie.rotation;
    for (let i = 0; i < move.amount; i += 1) {
      position = quarterTurn(axis, position);
      rotation = [quarterTurn(axis, rotation[0]), quarterTurn(axis, rotation[1]), quarterTurn(axis, rotation[2])];
    }
    return { home: cubie.home, position, rotation };
  });
}

export function applyMechanismMoves(cubies: readonly Cubie[], moves: readonly WideMove[]): Cubie[] {
  return moves.reduce<Cubie[]>((state, move) => applyMechanismMove(state, move), [...cubies]);
}
