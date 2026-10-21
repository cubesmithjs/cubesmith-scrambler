import type { WcaEventId } from '../core/types';
import type { Face } from '../notation/move';
import { parseAlgorithm } from '../notation/alg/parse';
import type { Algorithm, MoveNode } from '../notation/alg/types';
import { FACE_FAMILIES, ROTATION_FAMILIES, SLICE_FAMILIES } from '../notation/alg/types';
import { moveLayerSet, type WideMove } from '../puzzles/nxn/notation';
import { deriveFaceletPermutation } from '../puzzles/nxn/geometry';
import { modelForSize, solvedCubeNxN, type CubeNxNState } from '../puzzles/nxn/state';
import { colorFor } from './color';
import { UnsupportedScrambleError } from './errors';
import { registerDrawers, type PuzzleDrawer } from './registry';
import type { ColorScheme, ImageShape, ScrambleImage } from './types';

/**
 * The cube net — twelve WCA events, **one** drawing parameterised by size.
 *
 * From `CubePuzzle.java`:
 *
 * ```java
 * private static final int gap = 2;
 * private static final int cubieSize = 10;
 * private static int getCubeViewWidth(int cubie, int gap, int size)  { return (size*cubie + gap)*4 + gap; }
 * private static int getCubeViewHeight(int cubie, int gap, int size) { return (size*cubie + gap)*3 + gap; }
 * ```
 *
 * and `drawCube`, verbatim, with `S = size*cubieSize`:
 *
 * ```java
 * paintCubeFace(g, gap,         2*gap + S,   … state[Face.L.ordinal()] …);
 * paintCubeFace(g, 2*gap + S,   3*gap + 2*S, … state[Face.D.ordinal()] …);
 * paintCubeFace(g, 4*gap + 3*S, 2*gap + S,   … state[Face.B.ordinal()] …);
 * paintCubeFace(g, 3*gap + 2*S, 2*gap + S,   … state[Face.R.ordinal()] …);
 * paintCubeFace(g, 2*gap + S,   gap,         … state[Face.U.ordinal()] …);
 * paintCubeFace(g, 2*gap + S,   2*gap + S,   … state[Face.F.ordinal()] …);
 * ```
 *
 * — four face-columns `L | F | R | B` across the middle row, `U` above `F`, `D`
 * below it.
 */
export const GAP = 2;
export const CUBIE_SIZE = 10;
const BLACK = '#000000';

/**
 * Cube size per event, as a table.
 *
 * 🔴 Nothing is derived from the event id's digits. `333mbf` and `444bf` would both
 * break a clever parse, and a size read wrong draws a picture that looks like a
 * different puzzle rather than like an error.
 */
export const CUBE_SIZE_BY_EVENT: Readonly<Partial<Record<WcaEventId, number>>> = {
  '222': 2,
  '333': 3,
  '333bf': 3,
  '333oh': 3,
  '333fm': 3,
  '333mbf': 3,
  '444': 4,
  '444bf': 4,
  '555': 5,
  '555bf': 5,
  '666': 6,
  '777': 7,
};

export const CUBE_NET_EVENTS: readonly WcaEventId[] = Object.keys(
  CUBE_SIZE_BY_EVENT,
) as WcaEventId[];

export function eventCubeSize(event: WcaEventId): number {
  const size = CUBE_SIZE_BY_EVENT[event];
  if (size === undefined) {
    throw new Error(`@cubesmith/scrambler: "${event}" is not a cube-net event`);
  }
  return size;
}

/**
 * TNoodle's six defaults, verbatim, with the Java constants transcribed
 * mechanically:
 *
 * ```java
 * defaultColorScheme.put("B", Color.BLUE);              // #0000ff
 * defaultColorScheme.put("D", Color.YELLOW);            // #ffff00
 * defaultColorScheme.put("F", Color.GREEN);             // #00ff00
 * defaultColorScheme.put("L", new Color(255, 128, 0));  // #ff8000  orange heraldic tincture
 * defaultColorScheme.put("R", Color.RED);               // #ff0000
 * defaultColorScheme.put("U", Color.WHITE);             // #ffffff
 * ```
 */
export const CUBE_DEFAULT_SCHEME: ColorScheme = {
  B: '#0000ff',
  D: '#ffff00',
  F: '#00ff00',
  L: '#ff8000',
  R: '#ff0000',
  U: '#ffffff',
};

export function cubeNetWidth(size: number): number {
  return (size * CUBIE_SIZE + GAP) * 4 + GAP;
}

export function cubeNetHeight(size: number): number {
  return (size * CUBIE_SIZE + GAP) * 3 + GAP;
}

/** The top-left corner of each face's block in the net, from `drawCube` above. */
export function faceOrigin(face: Face, size: number): readonly [number, number] {
  const s = size * CUBIE_SIZE;
  switch (face) {
    case 'L':
      return [GAP, 2 * GAP + s];
    case 'D':
      return [2 * GAP + s, 3 * GAP + 2 * s];
    case 'B':
      return [4 * GAP + 3 * s, 2 * GAP + s];
    case 'R':
      return [3 * GAP + 2 * s, 2 * GAP + s];
    case 'U':
      return [2 * GAP + s, GAP];
    case 'F':
      return [2 * GAP + s, 2 * GAP + s];
  }
}

/**
 * Which lattice axis each face's `row` and `col` run along, and in which
 * direction — the bridge between this package's 3D facelet model and TNoodle's
 * `state[face][row][col]`.
 *
 * 🔴 This table is the single most likely place in the whole drawing layer to be
 * silently wrong: a transposed or mirrored face still looks like a cube. It is not
 * a guess. It is read off TNoodle's own corner table in `getStickersByPiece`,
 * which names, for a cube of size `s+1`, exactly which `[row][col]` of each face
 * belongs to which physical corner:
 *
 * ```java
 * { img[U][s][s], img[R][0][0], img[F][0][s] },   // UFR
 * { img[U][s][0], img[F][0][0], img[L][0][s] },   // UFL
 * { img[U][0][s], img[B][0][0], img[R][0][s] },   // UBR
 * { img[U][0][0], img[L][0][0], img[B][0][s] },   // UBL
 * { img[D][0][s], img[F][s][s], img[R][s][0] },   // DFR
 * { img[D][0][0], img[L][s][s], img[F][s][0] },   // DFL
 * { img[D][s][s], img[R][s][s], img[B][s][0] },   // DBR
 * { img[D][s][0], img[B][s][s], img[L][s][0] },   // DBL
 * ```
 *
 * Reading the U rows: `U[s][s]` is UFR and `U[0][0]` is UBL, so on the U face
 * `row` increases toward the **front** and `col` toward the **right**. Every row
 * below is that same reading for its face, and the outcome is the one a reader of
 * the picture expects: each face's `(row, col)` is (top→bottom, left→right) *as it
 * appears in the net*.
 *
 * `axis` indexes `Vec3` as `[x, y, z]`; `sign: 1` means the index grows with the
 * coordinate, `-1` that it grows as the coordinate falls.
 */
const FACE_AXES: Readonly<
  Record<Face, { row: { axis: 0 | 1 | 2; sign: 1 | -1 }; col: { axis: 0 | 1 | 2; sign: 1 | -1 } }>
> = {
  U: { row: { axis: 2, sign: 1 }, col: { axis: 0, sign: 1 } },
  D: { row: { axis: 2, sign: -1 }, col: { axis: 0, sign: 1 } },
  F: { row: { axis: 1, sign: -1 }, col: { axis: 0, sign: 1 } },
  B: { row: { axis: 1, sign: -1 }, col: { axis: 0, sign: -1 } },
  L: { row: { axis: 1, sign: -1 }, col: { axis: 2, sign: 1 } },
  R: { row: { axis: 1, sign: -1 }, col: { axis: 2, sign: -1 } },
};

/**
 * A cubie-centre coordinate → a 0-based index along a face axis.
 *
 * Centres are the odd values `-(size-1) … (size-1)`, so the index is
 * `(±v + size - 1) / 2`.
 */
function axisIndex(value: number, sign: 1 | -1, size: number): number {
  return (sign * value + size - 1) / 2;
}

/** Where a facelet's sticker sits in the net: its face, and its `(row, col)` within it. */
export function faceletSlot(
  position: readonly [number, number, number],
  normal: readonly [number, number, number],
  face: Face,
  size: number,
): { readonly row: number; readonly col: number } {
  const axes = FACE_AXES[face];
  // The cubie centre, not the facelet position: the sticker's own coordinate along
  // the face normal is pinned at ±size and carries no information.
  const centre = [position[0] - normal[0], position[1] - normal[1], position[2] - normal[2]];
  return {
    row: axisIndex(centre[axes.row.axis]!, axes.row.sign, size),
    col: axisIndex(centre[axes.col.axis]!, axes.col.sign, size),
  };
}

/**
 * Cube notation → the wide-move model, or a typed refusal.
 *
 * `parseAlgorithm` runs first so a malformed scramble raises the package's existing
 * `AlgorithmSyntaxError` with its offset and reason code, unwrapped — a consumer
 * already handling that from `validateScramble` keeps its handling. What is left
 * after a successful parse is valid notation that may still be outside the set a
 * *scramble* uses, and that is refused explicitly rather than approximated. See
 * {@link UnsupportedScrambleError}.
 */
export function scrambleToWideMoves(
  event: WcaEventId,
  scramble: string,
  size: number,
): readonly WideMove[] {
  return parseCubeNetMoves(
    scramble,
    size,
    (construct, detail) => new UnsupportedScrambleError(event, construct, detail),
  );
}

/** What a cube-notation scramble may contain that a drawing refuses. */
export type UnsupportedCubeConstruct = 'slice-move' | 'layer-range' | 'grouping';

/**
 * The parse behind {@link scrambleToWideMoves}, with the refusal left to the
 * caller. The unofficial entry draws its big cubes and shape mods through it,
 * raising its own error type, so this module's `WcaEventId`-typed error never
 * has to name an event that is not a WCA event.
 */
export function parseCubeNetMoves(
  scramble: string,
  size: number,
  unsupported: (construct: UnsupportedCubeConstruct, detail: string) => Error,
): readonly WideMove[] {
  const algorithm: Algorithm = parseAlgorithm(scramble);
  const moves: WideMove[] = [];

  for (const node of algorithm.nodes) {
    if (node.type === 'pause') continue; // A `.` carries no turn.
    if (node.type !== 'move') {
      throw unsupported('grouping', `a ${node.type}`);
    }
    const move = moveNodeToWideMove(node, size, unsupported);
    // `R4` on a 3x3x3 is the identity — legal notation, and nothing to apply.
    if (move) moves.push(move);
  }
  return moves;
}

function moveNodeToWideMove(
  node: MoveNode,
  size: number,
  unsupported: (construct: UnsupportedCubeConstruct, detail: string) => Error,
): WideMove | undefined {
  if ((SLICE_FAMILIES as readonly string[]).includes(node.family)) {
    throw unsupported('slice-move', `the slice move "${node.family}"`);
  }
  if (node.outerLayer !== null) {
    throw unsupported(
      'layer-range',
      `the layer range ${node.outerLayer}-${node.innerLayer}${node.family}w`,
    );
  }

  const amount = ((node.amount % 4) + 4) % 4;
  if (amount === 0) return undefined;

  if ((ROTATION_FAMILIES as readonly string[]).includes(node.family)) {
    // A whole-cube rotation is a block turn that happens to include every layer —
    // which is exactly how `nxn/notation.ts` already models `x`, `y` and `z`.
    const face = ROTATION_FACE[node.family];
    if (!face) throw new Error(`draw-cube: no face for rotation "${node.family}"`);
    return { face, depth: size, amount: amount as 1 | 2 | 3 };
  }

  if (!(FACE_FAMILIES as readonly string[]).includes(node.family)) {
    throw unsupported('slice-move', `the move family "${node.family}"`);
  }
  return {
    face: node.family as Face,
    depth: node.innerLayer ?? 1,
    amount: amount as 1 | 2 | 3,
  };
}

/** `CubePuzzle.faceRotationsByName`, read the other way round. */
const ROTATION_FACE: Readonly<Record<string, Face | undefined>> = { x: 'R', y: 'U', z: 'F' };

/**
 * TNoodle's paint order — `L D B R U F`, the order `drawCube` appends its six
 * `paintCubeFace` calls in, and within a face row-major, which is the order
 * `paintCubeFace` itself loops.
 *
 * Nothing on the net overlaps, so this cannot change the picture. It is followed
 * anyway because `shapes` is what a golden fixture, a React `key` and a
 * shape-by-shape comparison with a real TNoodle SVG are all built from — and "the
 * order TNoodle draws in" is a reason a reader can check, where "the order this
 * package's `FACE_NORMALS` happens to enumerate" (`R U F L D B`) is not.
 */
const PAINT_ORDER: readonly Face[] = ['L', 'D', 'B', 'R', 'U', 'F'];

/**
 * `(face, row, col)` → facelet slot, built once per size alongside the model.
 *
 * Inverted from `faceletSlot` rather than listed: a hard-written index order is the
 * 54-entry table `nxn/geometry.ts` exists to avoid, and inverting the derivation
 * means a mistake in it shows up as a *missing* slot — which throws — rather than
 * as a plausible wrong picture.
 */
const slotIndexes = new Map<number, ReadonlyMap<string, number>>();

export function slotIndex(size: number): ReadonlyMap<string, number> {
  const cached = slotIndexes.get(size);
  if (cached) return cached;

  const { facelets } = modelForSize(size);
  const index = new Map<string, number>();
  for (let slot = 0; slot < facelets.length; slot += 1) {
    const facelet = facelets[slot]!;
    const { row, col } = faceletSlot(facelet.position, facelet.normal, facelet.face, size);
    index.set(`${facelet.face}${row},${col}`, slot);
  }
  if (index.size !== facelets.length) {
    // Two facelets landing on one `(face, row, col)` means the axis table above is
    // wrong in a way that would otherwise be invisible.
    throw new Error(
      `draw-cube: the net mapping is not injective for size ${size} ` +
        `(${index.size} slots for ${facelets.length} facelets)`,
    );
  }
  slotIndexes.set(size, index);
  return index;
}

/**
 * Applies one move, deriving its permutation if the shared model has none.
 *
 * `modelForSize` builds permutations for the *scramble* move set — outer blocks up
 * to halfway — plus the specific deeper blocks `nxn/orientation.ts` needs. For an
 * **odd** cube that deeper set is depth `ceil(size/2)` (`Rw` on a 3x3x3), because
 * that is the shallowest wide move that reorients an odd puzzle and therefore what
 * an official 3BLD scramble ends with. A full-depth block — a bare `x`, `y` or `z`
 * — is not in it.
 *
 * That is right for the *generator*: this package never emits `z` on a 3x3x3. It is
 * not enough for a *drawing*, which takes text a human may have pasted, and `z` is
 * ordinary cube notation. So the gap is filled here rather than by widening the
 * shared model's accepted move set: `deriveFaceletPermutation` is the same
 * geometric derivation the model itself uses, it is already exported, and keeping
 * the extra permutations in this cache means nothing about scramble *generation*
 * changes.
 */
const derivedPermutations = new Map<string, readonly number[]>();

export function applyMoveForDrawing(state: CubeNxNState, move: WideMove): CubeNxNState {
  const { facelets, permutations } = modelForSize(state.size);
  const key = `${moveLayerSet(move)}.${move.amount}`;
  let destination = permutations.get(key);
  if (!destination) {
    const cacheKey = `${state.size}:${key}`;
    destination = derivedPermutations.get(cacheKey);
    if (!destination) {
      destination = deriveFaceletPermutation(facelets, move, state.size);
      derivedPermutations.set(cacheKey, destination);
    }
  }
  const occupant = new Array<number>(state.occupant.length);
  for (let i = 0; i < destination.length; i += 1) {
    occupant[destination[i]!] = state.occupant[i]!;
  }
  return { size: state.size, occupant };
}

/** `paintCubeFace` — row-major squares at `x + col*cubieSize`, `y + row*cubieSize`. */
export function drawState(state: CubeNxNState, scheme: ColorScheme): readonly ImageShape[] {
  const { size } = state;
  const { facelets } = modelForSize(size);
  const index = slotIndex(size);
  const shapes: ImageShape[] = [];

  for (const face of PAINT_ORDER) {
    const [ox, oy] = faceOrigin(face, size);
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const slot = index.get(`${face}${row},${col}`);
        if (slot === undefined) {
          throw new Error(`draw-cube: no facelet at ${face}[${row}][${col}] on size ${size}`);
        }
        // The colour of a slot is the home face of whichever facelet is sitting in
        // it — precisely what `CubeNxNState.occupant` already tracks.
        const showing = facelets[state.occupant[slot]!]!.face;
        shapes.push({
          kind: 'rect',
          x: ox + col * CUBIE_SIZE,
          y: oy + row * CUBIE_SIZE,
          w: CUBIE_SIZE,
          h: CUBIE_SIZE,
          fill: colorFor(scheme, showing),
          stroke: BLACK,
          face: showing,
        });
      }
    }
  }

  return shapes;
}

export function drawCubeScramble(
  event: WcaEventId,
  scramble: string,
  scheme: ColorScheme,
): ScrambleImage {
  const size = eventCubeSize(event);
  const moves = scrambleToWideMoves(event, scramble, size);
  const state = moves.reduce(applyMoveForDrawing, solvedCubeNxN(size));

  return {
    event,
    width: cubeNetWidth(size),
    height: cubeNetHeight(size),
    strokeWidth: 1,
    shapes: drawState(state, scheme),
  };
}

export function cubeDrawerFor(event: WcaEventId): PuzzleDrawer {
  return {
    draw: (scramble, scheme) => drawCubeScramble(event, scramble, scheme),
    defaultScheme: CUBE_DEFAULT_SCHEME,
  };
}

/**
 * Registers all twelve cube-net events.
 *
 * `333fm`'s `R' U' F` padding and the blindfolded events' trailing whole-cube
 * rotations are ordinary tokens on this path, so neither is a special case.
 * `333mbf` draws **one picture per cube** — the consumer holds `result.scrambles`
 * and calls `drawScramble('333mbf', …)` per entry.
 */
export function registerCubeDrawers(): void {
  for (const event of CUBE_NET_EVENTS) {
    // One drawer per event rather than one for all twelve, because the event id is
    // what resolves the size and what `ScrambleImage.event` reports back.
    registerDrawers([event], cubeDrawerFor(event));
  }
}
