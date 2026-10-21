import { rotate120, vecDot, vecEquals, type Vec3 } from '../../utils/vec3';
import {
  CENTRE_A_POSITIONS,
  CENTRE_B_POSITIONS,
  CORNER_PLUS_FACES,
  CORNER_POSITIONS_FTO,
  EDGE_POSITIONS_FTO,
  FACE_NORMALS,
  FACELETS_FTO,
  faceParity,
} from './geometry';
import { FTO_FACES, type FtoAmount, type FtoFace, type FtoMove } from './notation';
import type { FtoState } from './state';

/**
 * The 48 symmetries of the octahedron, and what they do to a state.
 *
 * An FTO looks the same held any of 24 ways, and its mirror image is an FTO too.
 * So a state can be *re-expressed* in any of 48 frames and solved there, and the
 * solution translated back is a solution of the original. Each frame is a
 * genuinely different problem for the solver — a different corner becomes the
 * phase-1 block, different faces become `U` and `L` — so solving several and
 * keeping the shortest is the cheapest way to shorten a reduction solver's output.
 * It is what xyzzy's FTO solver gets from its wide turns, reached here without them.
 *
 * Everything goes through **stickers**, because a symmetry is simplest there: it
 * moves a sticker from point `p` to `Mp`, and a sticker coloured with the face
 * whose normal is `n` is recoloured with the face whose normal is `Mn`, so that
 * solved maps to solved. The piece model's corner twist is defined on the `+`
 * faces only, which a reflection or a 90° turn carries onto `−` faces, so working
 * at the piece level would need a separate rule per kind of symmetry.
 */

/** A symmetry as a signed permutation of the axes: `(Mv)[k] = sign[k] · v[axis[k]]`. */
export interface Symmetry {
  readonly axis: readonly [number, number, number];
  readonly sign: readonly [1 | -1, 1 | -1, 1 | -1];
  /** `+1` for a rotation, `−1` for a reflection — which turns every clockwise turn anticlockwise. */
  readonly det: 1 | -1;
}

export function applySymmetry(m: Symmetry, v: Vec3): Vec3 {
  return [m.sign[0] * v[m.axis[0]]!, m.sign[1] * v[m.axis[1]]!, m.sign[2] * v[m.axis[2]]!];
}

/** The inverse map, `M⁻¹ = Mᵀ`. */
export function applyInverseSymmetry(m: Symmetry, v: Vec3): Vec3 {
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k += 1) out[m.axis[k]!] = m.sign[k]! * v[k]!;
  return out;
}

const PERMUTATIONS: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [1, 2, 0],
  [2, 0, 1],
  [0, 2, 1],
  [2, 1, 0],
  [1, 0, 2],
];

/**
 * All 48, ordered so that a prefix is a meaningful set: the identity, then the
 * other eleven rotations of the tetrahedron (these keep each centre orbit on its
 * own faces), then the twelve other rotations of the octahedron, then the 24
 * mirror images. `SEARCH.frames` of 12, 24 or 48 therefore means exactly those
 * groups — the sets `fto-design.md` §5 measured.
 */
export const FTO_SYMMETRIES: readonly Symmetry[] = (() => {
  const all: Symmetry[] = [];
  PERMUTATIONS.forEach((axis, p) => {
    const permutationSign = p < 3 ? 1 : -1; // the first three are the even ones
    for (const s0 of [1, -1] as const) {
      for (const s1 of [1, -1] as const) {
        for (const s2 of [1, -1] as const) {
          all.push({ axis, sign: [s0, s1, s2], det: (permutationSign * s0 * s1 * s2) as 1 | -1 });
        }
      }
    }
  });
  const rank = (m: Symmetry): number =>
    m.det === -1 ? 2 : faceParity(applySymmetry(m, FACE_NORMALS.U)) === 1 ? 0 : 1;
  // A stable sort keeps the identity (first generated) at the front of its group.
  return all.map((m, i) => ({ m, i })).sort((a, b) => rank(a.m) - rank(b.m) || a.i - b.i).map(({ m }) => m);
})();

// ---------------------------------------------------------------------------
// Stickers ⇄ pieces
// ---------------------------------------------------------------------------

const key = (v: Vec3): string => v.join(',');
const FACELET_INDEX = new Map(FACELETS_FTO.map((f, i) => [key(f.point), i]));

function faceletAt(point: Vec3): number {
  const index = FACELET_INDEX.get(key(point));
  if (index === undefined) throw new Error(`fto-symmetry: no sticker at [${point.join(',')}]`);
  return index;
}

const FACE_BY_NORMAL = new Map(FTO_FACES.map((f) => [key(FACE_NORMALS[f]), f]));

function faceOf(normal: Vec3): FtoFace {
  const face = FACE_BY_NORMAL.get(key(normal));
  if (face === undefined) throw new Error(`fto-symmetry: [${normal.join(',')}] is not a face normal`);
  return face;
}

/**
 * The twelve rotations of the tetrahedron — the only motions a turn can give a
 * piece — as maps on vectors. A corner (with its twist) or an edge in a slot sits
 * there by exactly one of them, which is how a piece's stickers are read off.
 */
const TETRAHEDRAL: readonly ((v: Vec3) => Vec3)[] = (() => {
  type Map3 = readonly [Vec3, Vec3, Vec3]; // images of the basis
  const basis: Map3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const mul = (m: Map3, v: Vec3): Vec3 => [
    m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
    m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
    m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
  ];
  const generators: Map3[] = FTO_FACES.map((f) => basis.map((b) => rotate120(FACE_NORMALS[f], b, -1)) as unknown as Map3);
  const found: Map3[] = [basis];
  for (let i = 0; i < found.length; i += 1) {
    for (const g of generators) {
      const next = found[i]!.map((col) => mul(g, col)) as unknown as Map3;
      if (!found.some((m) => m.every((col, k) => vecEquals(col, next[k]!)))) found.push(next);
    }
  }
  return found.map((m) => (v: Vec3) => mul(m, v));
})();

const CORNER_FACES: readonly Vec3[][] = CORNER_POSITIONS_FTO.map((v) =>
  FTO_FACES.map((f) => FACE_NORMALS[f]).filter((n) => vecDot(n, v) > 0),
);

/** `CORNER_CARRY[piece][slot][twist]` — the rotation taking the piece home to that slot and twist. */
const CORNER_CARRY: readonly (readonly (readonly ((v: Vec3) => Vec3)[])[])[] = CORNER_POSITIONS_FTO.map((home, p) =>
  CORNER_POSITIONS_FTO.map((slot, i) =>
    [0, 1].map((twist) => {
      const g = TETRAHEDRAL.find(
        (r) => vecEquals(r(home), slot) && vecEquals(r(CORNER_PLUS_FACES[p]![0]), CORNER_PLUS_FACES[i]![twist]!),
      );
      // Unreachable placements (none exist for corners) would simply have no rotation.
      return g ?? ((v: Vec3) => v);
    }),
  ),
);

const EDGE_CARRY: readonly (readonly ((v: Vec3) => Vec3)[])[] = EDGE_POSITIONS_FTO.map((home) =>
  EDGE_POSITIONS_FTO.map((slot) => TETRAHEDRAL.find((r) => vecEquals(r(home), slot)) ?? ((v: Vec3) => v)),
);

/** The face each of the 72 stickers shows, in `FACELETS_FTO` order. */
export function ftoStickers(state: FtoState): FtoFace[] {
  const out = new Array<FtoFace>(FACELETS_FTO.length);

  CORNER_POSITIONS_FTO.forEach((v, slot) => {
    const g = CORNER_CARRY[state.cornerPermutation[slot]!]![slot]![state.cornerOrientation[slot]!]!;
    for (const n of CORNER_FACES[slot]!) {
      // The sticker now on face n faced, at home, whichever face g carried onto n.
      const home = TETRAHEDRAL_INVERSE(g, n);
      out[faceletAt([n[0] + 6 * v[0], n[1] + 6 * v[1], n[2] + 6 * v[2]])] = faceOf(home);
    }
  });

  EDGE_POSITIONS_FTO.forEach((e, slot) => {
    const g = EDGE_CARRY[state.edgePermutation[slot]!]![slot]!;
    for (const f of FTO_FACES) {
      const n = FACE_NORMALS[f];
      if (vecDot(e, n) !== 2) continue;
      out[faceletAt([n[0] + 3 * e[0], n[1] + 3 * e[1], n[2] + 3 * e[2]])] = faceOf(TETRAHEDRAL_INVERSE(g, n));
    }
  });

  CENTRE_A_POSITIONS.forEach((c, slot) => {
    out[faceletAt(c.point)] = CENTRE_A_POSITIONS[state.centreA[slot]!]!.face;
  });
  CENTRE_B_POSITIONS.forEach((c, slot) => {
    out[faceletAt(c.point)] = CENTRE_B_POSITIONS[state.centreB[slot]!]!.face;
  });
  return out;
}

/** `g⁻¹(n)`: the vector `g` carries onto `n`. A rotation is a bijection on face normals. */
function TETRAHEDRAL_INVERSE(g: (v: Vec3) => Vec3, n: Vec3): Vec3 {
  const source = FTO_FACES.map((f) => FACE_NORMALS[f]).find((m) => vecEquals(g(m), n));
  if (!source) throw new Error('fto-symmetry: a rotation failed to permute the face normals');
  return source;
}

/**
 * The state a sticker picture describes. Corners and edges are recovered
 * exactly. Centres come back as *some* labelling with the right colours — three
 * of a colour look alike, so the picture cannot say which is which, and nothing
 * that reads a state for solving cares.
 */
export function ftoStateFromStickers(stickers: readonly FtoFace[]): FtoState {
  const colourAt = (point: Vec3): Vec3 => FACE_NORMALS[stickers[faceletAt(point)]!];

  const cornerPermutation: number[] = [];
  const cornerOrientation: number[] = [];
  CORNER_POSITIONS_FTO.forEach((v, slot) => {
    const colours = CORNER_FACES[slot]!.map((n) => colourAt([n[0] + 6 * v[0], n[1] + 6 * v[1], n[2] + 6 * v[2]]));
    // A corner's four faces sum to four times its vertex.
    const sum = colours.reduce<Vec3>((s, c) => [s[0] + c[0], s[1] + c[1], s[2] + c[2]], [0, 0, 0]);
    const piece = CORNER_POSITIONS_FTO.findIndex((p) => vecEquals([4 * p[0], 4 * p[1], 4 * p[2]], sum));
    const reference = CORNER_PLUS_FACES[piece]![0];
    const twist = CORNER_PLUS_FACES[slot]!.findIndex((face) => {
      const at = colourAt([face[0] + 6 * v[0], face[1] + 6 * v[1], face[2] + 6 * v[2]]);
      return vecEquals(at, reference);
    });
    if (piece < 0 || twist < 0) throw new Error('fto-symmetry: the stickers are not a corner');
    cornerPermutation[slot] = piece;
    cornerOrientation[slot] = twist;
  });

  const edgePermutation = EDGE_POSITIONS_FTO.map((e) => {
    const sides = FTO_FACES.map((f) => FACE_NORMALS[f]).filter((n) => vecDot(e, n) === 2);
    const colours = sides.map((n) => colourAt([n[0] + 3 * e[0], n[1] + 3 * e[1], n[2] + 3 * e[2]]));
    // An edge's two faces sum to twice its midpoint.
    const sum: Vec3 = [colours[0]![0] + colours[1]![0], colours[0]![1] + colours[1]![1], colours[0]![2] + colours[1]![2]];
    const piece = EDGE_POSITIONS_FTO.findIndex((p) => vecEquals([2 * p[0], 2 * p[1], 2 * p[2]], sum));
    if (piece < 0) throw new Error('fto-symmetry: the stickers are not an edge');
    return piece;
  });

  const labelCentres = (positions: typeof CENTRE_A_POSITIONS): number[] => {
    const unused = new Map<FtoFace, number[]>();
    positions.forEach((c, label) => unused.set(c.face, [...(unused.get(c.face) ?? []), label]));
    return positions.map((c) => {
      const pool = unused.get(stickers[faceletAt(c.point)]!);
      const label = pool?.shift();
      if (label === undefined) throw new Error('fto-symmetry: a centre has a colour of the other orbit');
      return label;
    });
  };

  return {
    cornerPermutation,
    cornerOrientation,
    edgePermutation,
    centreA: labelCentres(CENTRE_A_POSITIONS),
    centreB: labelCentres(CENTRE_B_POSITIONS),
  };
}

// ---------------------------------------------------------------------------
// Conjugation
// ---------------------------------------------------------------------------

/**
 * The state as it looks after the whole puzzle is moved by `m` — every sticker
 * carried from `p` to `Mp` and recoloured from face `n` to face `Mn`, so that a
 * solved puzzle stays solved. Solving this and {@link moveFromFrame mapping the
 * moves back} solves the original.
 */
export function conjugateFtoState(state: FtoState, m: Symmetry): FtoState {
  const stickers = ftoStickers(state);
  const out = new Array<FtoFace>(stickers.length);
  FACELETS_FTO.forEach((facelet, i) => {
    out[faceletAt(applySymmetry(m, facelet.point))] = faceOf(applySymmetry(m, FACE_NORMALS[stickers[i]!]));
  });
  return ftoStateFromStickers(out);
}

/**
 * A move made in the frame `m` describes, as the move it is in the original
 * frame: the face whose normal `m` carries onto this one, turned the same way —
 * or the other way, if `m` is a mirror.
 */
export function moveFromFrame(move: FtoMove, m: Symmetry): FtoMove {
  const face = faceOf(applyInverseSymmetry(m, FACE_NORMALS[move.face]));
  const amount = (m.det === 1 ? move.amount : 3 - move.amount) as FtoAmount;
  return { face, amount };
}

/** Whether `m` keeps each centre orbit on its own faces — the twelve tetrahedral rotations do. */
export function preservesParity(m: Symmetry): boolean {
  return faceParity(applySymmetry(m, FACE_NORMALS.U)) === 1;
}
