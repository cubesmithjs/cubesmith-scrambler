import { parseSkewbScramble } from '../puzzles/skewb/notation';
import {
  CENTER_POSITIONS_SKEWB,
  CORNER_ORIENTATION_CYCLES,
  CORNER_POSITIONS_SKEWB,
} from '../puzzles/skewb/geometry';
import { applySkewbMoves, SOLVED_SKEWB_STATE, type SkewbState } from '../puzzles/skewb/state';
import { vecEquals, type Vec3 } from '../utils/vec3';
import { colorFor } from './color';
import { registerDrawer, type PuzzleDrawer } from './registry';
import { apply, type Transform2D } from './transform';
import type { ColorScheme, ImageShape, ScrambleImage } from './types';

/**
 * Skewb, from `SkewbPuzzle.java`.
 *
 * ```java
 * private static final int pieceSize = 30;
 * private static final int gap = 3;
 * private static final double sq3d2 = Math.sqrt(3) / 2;
 * ```
 */
const PIECE_SIZE = 30;
const GAP = 3;
const SQ3D2 = Math.sqrt(3) / 2;
const BLACK = '#000000';

/**
 * 🔴 **Not the cube's scheme.** `R` is blue here, `F` red, `L` green, `B` orange —
 * three disagreements with the cube net, verbatim from source:
 *
 * ```java
 * defaultColorScheme.put("U", Color.WHITE);          // #ffffff
 * defaultColorScheme.put("R", Color.BLUE);           // #0000ff
 * defaultColorScheme.put("F", Color.RED);            // #ff0000
 * defaultColorScheme.put("D", Color.YELLOW);         // #ffff00
 * defaultColorScheme.put("L", Color.GREEN);          // #00ff00
 * defaultColorScheme.put("B", new Color(0xFF8000));  // #ff8000
 * ```
 *
 * `skewb.test.ts` asserts this object itself, so a future "let's unify the face
 * colours" cleanup fails a test instead of silently drawing a plausible wrong
 * picture.
 */
export const SKEWB_DEFAULT_SCHEME: ColorScheme = {
  U: '#ffffff',
  R: '#0000ff',
  F: '#ff0000',
  D: '#ffff00',
  L: '#00ff00',
  B: '#ff8000',
};

/** `new Dimension(ceil((3*gap + 8*pieceSize + 1) * sq3d2), ceil(2*gap + 6*pieceSize + 1))`. */
export const SKEWB_IMAGE_WIDTH = Math.ceil((3 * GAP + 8 * PIECE_SIZE + 1) * SQ3D2);
export const SKEWB_IMAGE_HEIGHT = Math.ceil(2 * GAP + 6 * PIECE_SIZE + 1);

/**
 * `getFaceTrans()`, verbatim. TNoodle's `Transform(m00, m10, m01, m11, m02, m12)`
 * is `java.awt.geom.AffineTransform`'s column-major constructor, which is exactly
 * {@link Transform2D}'s `a b c d e f`.
 *
 * Note the Java **integer** divisions: `pieceSize/2` with `pieceSize = 30` is 15,
 * not 15.0 — it happens to be exact here, but it is what the source says.
 *
 * ```java
 * new Transform(pieceSize*sq3d2, -pieceSize/2, pieceSize*sq3d2, pieceSize/2, (pieceSize*4+gap*1.5)*sq3d2, pieceSize),
 * new Transform(pieceSize*sq3d2, -pieceSize/2, 0, pieceSize, (pieceSize*7+gap*3)*sq3d2, pieceSize * 1.5),
 * new Transform(pieceSize*sq3d2, -pieceSize/2, 0, pieceSize, (pieceSize*5+gap*2)*sq3d2, pieceSize * 2.5 + 0.5 * gap),
 * new Transform(0, pieceSize, -pieceSize*sq3d2, -pieceSize/2, (pieceSize*3+gap*1)*sq3d2, pieceSize * 4.5 + 1.5 * gap),
 * new Transform(pieceSize*sq3d2, pieceSize/2, 0, pieceSize, (pieceSize*3+gap*1)*sq3d2, pieceSize * 2.5 + 0.5 * gap),
 * new Transform(pieceSize*sq3d2, pieceSize/2, 0, pieceSize, pieceSize*sq3d2, pieceSize * 1.5),
 * ```
 */
const FACE_TRANSFORMS: readonly Transform2D[] = [
  { a: PIECE_SIZE * SQ3D2, b: -PIECE_SIZE / 2, c: PIECE_SIZE * SQ3D2, d: PIECE_SIZE / 2, e: (PIECE_SIZE * 4 + GAP * 1.5) * SQ3D2, f: PIECE_SIZE },
  { a: PIECE_SIZE * SQ3D2, b: -PIECE_SIZE / 2, c: 0, d: PIECE_SIZE, e: (PIECE_SIZE * 7 + GAP * 3) * SQ3D2, f: PIECE_SIZE * 1.5 },
  { a: PIECE_SIZE * SQ3D2, b: -PIECE_SIZE / 2, c: 0, d: PIECE_SIZE, e: (PIECE_SIZE * 5 + GAP * 2) * SQ3D2, f: PIECE_SIZE * 2.5 + 0.5 * GAP },
  { a: 0, b: PIECE_SIZE, c: -PIECE_SIZE * SQ3D2, d: -PIECE_SIZE / 2, e: (PIECE_SIZE * 3 + GAP) * SQ3D2, f: PIECE_SIZE * 4.5 + 1.5 * GAP },
  { a: PIECE_SIZE * SQ3D2, b: PIECE_SIZE / 2, c: 0, d: PIECE_SIZE, e: (PIECE_SIZE * 3 + GAP) * SQ3D2, f: PIECE_SIZE * 2.5 + 0.5 * GAP },
  { a: PIECE_SIZE * SQ3D2, b: PIECE_SIZE / 2, c: 0, d: PIECE_SIZE, e: PIECE_SIZE * SQ3D2, f: PIECE_SIZE * 1.5 },
];

/**
 * `getFacePaths()` in the face's own normalised `(-1..1)` square — a centre
 * **diamond** and four corner right-triangles, verbatim:
 *
 * ```java
 * p[0].moveTo(-1, 0); p[0].lineTo( 0, 1); p[0].lineTo( 1, 0); p[0].lineTo(0,-1); p[0].closePath();
 * p[1].moveTo(-1, 0); p[1].lineTo(-1,-1); p[1].lineTo( 0,-1); p[1].closePath();
 * p[2].moveTo( 0,-1); p[2].lineTo( 1,-1); p[2].lineTo( 1, 0); p[2].closePath();
 * p[3].moveTo(-1, 0); p[3].lineTo(-1, 1); p[3].lineTo( 0, 1); p[3].closePath();
 * p[4].moveTo( 0, 1); p[4].lineTo( 1, 1); p[4].lineTo( 1, 0); p[4].closePath();
 * ```
 *
 * So sticker `0` is the centre and `1 2 3 4` are top-left, top-right, bottom-left,
 * bottom-right — five per face, thirty in all.
 */
const FACE_PATHS: readonly (readonly (readonly [number, number])[])[] = [
  [[-1, 0], [0, 1], [1, 0], [0, -1]],
  [[-1, 0], [-1, -1], [0, -1]],
  [[0, -1], [1, -1], [1, 0]],
  [[-1, 0], [-1, 1], [0, 1]],
  [[0, 1], [1, 1], [1, 0]],
];

/** Sticker index `1..4` → its local corner in the `(-1..1)` square. */
const STICKER_LOCAL_CORNER: readonly (readonly [number, number])[] = [
  [0, 0], // 0 — the centre diamond, no corner
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/**
 * The six faces, in the order TNoodle's `image[6][5]` and its `"URFDLB"` colour
 * lookup use: `U R F D L B`.
 *
 * `normal` is this package's own frame, not TNoodle's — the two differ by a 90°
 * rotation about the vertical, which is derived and pinned in
 * `skewb-frame.test.ts` rather than assumed here. In short: this package holds
 * `(1,1,1)` (WCA Fixed Corner Notation, white up, green front-left) while TNoodle
 * holds `(-1,1,1)`, and the map that carries this package's four turn axes onto
 * TNoodle's, letter for letter, is `M(x, y, z) = (-z, y, x)`.
 *
 * `row`/`col` say which of this package's lattice axes the face's local `y`
 * (downward) and local `x` (rightward) run along. 🔴 They were **not** guessed from
 * the picture: each was read off TNoodle's own `turn()` tables, which name exactly
 * which sticker index of which face belongs to which physical corner. The outcome
 * is worth stating because it is not obvious — the Skewb net uses the *same*
 * (row, col) convention as TNoodle's cube net, once both are read in the same
 * frame.
 */
interface SkewbFace {
  readonly name: string;
  readonly normal: Vec3;
  readonly row: { readonly axis: 0 | 1 | 2; readonly sign: 1 | -1 };
  readonly col: { readonly axis: 0 | 1 | 2; readonly sign: 1 | -1 };
}

const SKEWB_FACES: readonly SkewbFace[] = [
  // U — this package's +y; TNoodle's row +Z / col +X become this frame's +x / -z.
  { name: 'U', normal: [0, 1, 0], row: { axis: 0, sign: 1 }, col: { axis: 2, sign: -1 } },
  // R — this package's -z.
  { name: 'R', normal: [0, 0, -1], row: { axis: 1, sign: -1 }, col: { axis: 0, sign: -1 } },
  // F — this package's +x.
  { name: 'F', normal: [1, 0, 0], row: { axis: 1, sign: -1 }, col: { axis: 2, sign: -1 } },
  // D — this package's -y.
  { name: 'D', normal: [0, -1, 0], row: { axis: 0, sign: -1 }, col: { axis: 2, sign: -1 } },
  // L — this package's +z.
  { name: 'L', normal: [0, 0, 1], row: { axis: 1, sign: -1 }, col: { axis: 0, sign: 1 } },
  // B — this package's -x.
  { name: 'B', normal: [-1, 0, 0], row: { axis: 1, sign: -1 }, col: { axis: 2, sign: 1 } },
];

/** Face name for one of the six centre normals — the colour a solved sticker there wears. */
function faceNameOfNormal(normal: Vec3): string {
  const face = SKEWB_FACES.find((f) => vecEquals(f.normal, normal));
  if (!face) throw new Error(`draw-skewb: [${normal.join(',')}] is not a face normal`);
  return face.name;
}

/** The cube corner that shows at local `(lx, ly)` on `face`. */
function cornerIndexAtLocal(face: SkewbFace, lx: number, ly: number): number {
  const target: [number, number, number] = [0, 0, 0];
  const normalAxis = face.normal.findIndex((v) => v !== 0) as 0 | 1 | 2;
  target[normalAxis] = face.normal[normalAxis]!;
  target[face.col.axis] = lx * face.col.sign;
  target[face.row.axis] = ly * face.row.sign;
  const index = CORNER_POSITIONS_SKEWB.findIndex((p) => vecEquals(p, target));
  if (index === -1) {
    throw new Error(`draw-skewb: no corner at [${target.join(',')}] for ${face.name}`);
  }
  return index;
}

/**
 * The colour of a corner sticker: piece-level state turned back into a sticker.
 *
 * Orientation `o` at slot `s` means the piece's own sticker `k` shows on the face
 * `CORNER_ORIENTATION_CYCLES[s][(k + o) % 3]`. Inverting that: the face at cycle
 * position `k` of the slot shows the piece's sticker `(k - o + 3) % 3`, whose
 * colour is the face that sticker faces when the piece is home and untwisted.
 */
function cornerStickerFace(state: SkewbState, slot: number, faceNormal: Vec3): string {
  const slotCycle = CORNER_ORIENTATION_CYCLES[slot]!;
  const k = slotCycle.findIndex((n) => vecEquals(n, faceNormal));
  if (k === -1) {
    throw new Error(`draw-skewb: corner ${slot} has no sticker on [${faceNormal.join(',')}]`);
  }
  const piece = state.cornerPermutation[slot]!;
  const twist = state.cornerOrientation[slot]!;
  const pieceStickerIndex = (k - twist + 3) % 3;
  return faceNameOfNormal(CORNER_ORIENTATION_CYCLES[piece]![pieceStickerIndex]!);
}

/** A Skewb centre is one square of one colour, so its slot's colour is just the piece there. */
function centreStickerFace(state: SkewbState, faceNormal: Vec3): string {
  const slot = CENTER_POSITIONS_SKEWB.findIndex((p) => vecEquals(p, faceNormal));
  if (slot === -1) {
    throw new Error(`draw-skewb: no centre slot at [${faceNormal.join(',')}]`);
  }
  return faceNameOfNormal(CENTER_POSITIONS_SKEWB[state.centerPermutation[slot]!]!);
}

export function drawSkewbScramble(scramble: string, scheme: ColorScheme): ScrambleImage {
  const state = applySkewbMoves(SOLVED_SKEWB_STATE, parseSkewbScramble(scramble));
  const shapes: ImageShape[] = [];

  SKEWB_FACES.forEach((face, faceIndex) => {
    const transform = FACE_TRANSFORMS[faceIndex]!;
    for (let sticker = 0; sticker < FACE_PATHS.length; sticker += 1) {
      const showing =
        sticker === 0
          ? centreStickerFace(state, face.normal)
          : cornerStickerFace(
              state,
              cornerIndexAtLocal(
                face,
                STICKER_LOCAL_CORNER[sticker]![0]!,
                STICKER_LOCAL_CORNER[sticker]![1]!,
              ),
              face.normal,
            );
      shapes.push({
        kind: 'polygon',
        points: FACE_PATHS[sticker]!.map(([x, y]) => apply(transform, x, y)),
        fill: colorFor(scheme, showing),
        stroke: BLACK,
        face: showing,
      });
    }
  });

  return {
    event: 'skewb',
    width: SKEWB_IMAGE_WIDTH,
    height: SKEWB_IMAGE_HEIGHT,
    strokeWidth: 1,
    shapes,
  };
}

export const SKEWB_DRAWER: PuzzleDrawer = {
  draw: drawSkewbScramble,
  defaultScheme: SKEWB_DEFAULT_SCHEME,
};

export function registerSkewbDrawer(): void {
  registerDrawer('skewb', SKEWB_DRAWER);
}

export { SKEWB_FACES };
