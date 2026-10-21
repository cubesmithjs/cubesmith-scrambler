import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { rotate120, vecDot, vecEquals, type Vec3 } from '../../utils/vec3';
import { groupOrder } from './__tests__/schreier-sims';
import {
  CENTRE_A_POSITIONS,
  CENTRE_B_POSITIONS,
  CORNER_PLUS_FACES,
  CORNER_POSITIONS_FTO,
  deriveFaceletTurn,
  deriveTurnTableFto,
  EDGE_POSITIONS_FTO,
  FACE_NORMALS,
  FACELETS_FTO,
  faceParity,
} from './geometry';
import { allMovesFto, FTO_FACES, type FtoFace, type FtoMove } from './notation';
import {
  applyFtoMove,
  applyFtoMoves,
  ftoStatesEqual,
  ftoStatesLookEqual,
  isSolvedFto,
  SOLVED_FTO_STATE,
  type FtoState,
} from './state';

const MOVES = allMovesFto();

function randomMoves(seed: string, count: number): FtoMove[] {
  const random = createRandomSource(seed);
  return Array.from({ length: count }, () => MOVES[randomInt(random, MOVES.length)]!);
}

/** A turn as a permutation of 48 points: 12 (corner slot, twist) pairs, 12 edges, 12 + 12 centres. */
function asPermutation(face: FtoFace): number[] {
  const t = deriveTurnTableFto(face);
  const p: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    for (let o = 0; o < 2; o += 1) p[2 * i + o] = 2 * t.cornerDestination[i]! + (o ^ t.cornerTwist[i]!);
  }
  t.edgeDestination.forEach((d, i) => (p[12 + i] = 12 + d));
  t.centreADestination.forEach((d, i) => (p[24 + i] = 24 + d));
  t.centreBDestination.forEach((d, i) => (p[36 + i] = 36 + d));
  return p;
}

const factorial = (k: number): bigint => (k <= 1 ? 1n : BigInt(k) * factorial(k - 1));

describe('the move tables', () => {
  it('give every turn order 3, and its double the same as its prime', () => {
    for (const face of FTO_FACES) {
      const cw: FtoMove = { face, amount: 1 };
      const thrice = applyFtoMoves(SOLVED_FTO_STATE, [cw, cw, cw]);
      expect(ftoStatesEqual(thrice, SOLVED_FTO_STATE), face).toBe(true);
      const twice = applyFtoMoves(SOLVED_FTO_STATE, [cw, cw]);
      expect(ftoStatesEqual(twice, applyFtoMove(SOLVED_FTO_STATE, { face, amount: 2 })), face).toBe(true);
    }
  });

  it('let opposite faces commute, and neighbouring ones not', () => {
    const scrambled = applyFtoMoves(SOLVED_FTO_STATE, randomMoves('commute', 30));
    const both = (a: FtoMove, b: FtoMove): FtoState => applyFtoMoves(scrambled, [a, b]);
    for (const [a, b] of [['U', 'D'], ['F', 'B'], ['R', 'BL'], ['L', 'BR']] as const) {
      const x: FtoMove = { face: a, amount: 1 };
      const y: FtoMove = { face: b, amount: 2 };
      expect(ftoStatesEqual(both(x, y), both(y, x)), `${a} ${b}`).toBe(true);
    }
    const u: FtoMove = { face: 'U', amount: 1 };
    const r: FtoMove = { face: 'R', amount: 1 };
    expect(ftoStatesEqual(both(u, r), both(r, u))).toBe(false);
  });
});

/**
 * 🔴 How many states the tables reach — derived, not asserted. Schreier–Sims over
 * the eight derived turns gives the exact order of the group they generate, and
 * the test then checks it is precisely the product the random-state draw assumes:
 * an even corner permutation with an even twist sum, even permutations of the
 * edges and of each centre orbit, and nothing linking any two of them.
 */
describe('the group the turns generate', () => {
  const expected = (factorial(6) / 2n) * 2n ** 5n * (factorial(12) / 2n) ** 3n;

  it('is exactly A6 ⋉ Z2^5 × A12 × A12 × A12 — the piece model', () => {
    expect(groupOrder(FTO_FACES.map(asPermutation))).toBe(expected);
  });

  it('is the same group in the independent 72-sticker model', () => {
    expect(groupOrder(FTO_FACES.map((f) => [...deriveFaceletTurn(f)]))).toBe(expected);
  });

  /**
   * The published figure counts what the eye can tell apart, up to holding the
   * puzzle differently: divide out the 648 even rearrangements of identical
   * centres in each orbit (`3!^4 / 2`), and the 12 rotations of the whole puzzle,
   * which are themselves in the group (every turn is a tetrahedral rotation of a
   * layer, and the twelve tetrahedral rotations of the whole are even on every
   * piece type).
   */
  it('gives the published 31,408,133,379,194,880,000,000 distinct positions', () => {
    const visible = expected / 648n / 648n;
    expect(visible / 12n).toBe(31_408_133_379_194_880_000_000n);
    expect(visible % 12n).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// The piece model, read back as stickers, against the sticker model.
// ---------------------------------------------------------------------------

type Matrix = readonly [Vec3, Vec3, Vec3]; // images of the x, y, z basis vectors

const apply = (m: Matrix, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
  m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
  m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
];

/** The twelve rotations of a tetrahedron, as the closure of the eight face turns. */
const ROTATIONS: readonly Matrix[] = (() => {
  const basis: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const generators: Matrix[] = FTO_FACES.map(
    (f) => basis.map((b) => rotate120(FACE_NORMALS[f], b, -1)) as unknown as Matrix,
  );
  const found: Matrix[] = [basis as unknown as Matrix];
  for (let i = 0; i < found.length; i += 1) {
    for (const g of generators) {
      const composed = found[i]!.map((col) => apply(g, col)) as unknown as Matrix;
      if (!found.some((m) => m.every((col, k) => vecEquals(col, composed[k]!)))) found.push(composed);
    }
  }
  return found;
})();

const faceOf = (normal: Vec3): FtoFace => FTO_FACES.find((f) => vecEquals(FACE_NORMALS[f], normal))!;

const BASIS: readonly Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

function inverse(g: Matrix): Matrix {
  return ROTATIONS.find((m) => g.every((col, k) => vecEquals(apply(m, col), BASIS[k]!)))!;
}

/**
 * A piece at `slot` that came from `home` was carried there by a rotation `g`;
 * the sticker it shows on the face with outward normal `normal` is the one that,
 * at home, faced `g⁻¹(normal)` — so it wears that face's colour.
 */
const colourThrough = (g: Matrix, normal: Vec3): FtoFace => faceOf(apply(inverse(g), normal));

const scaled = (normal: Vec3, k: number, v: Vec3): Vec3 => [
  normal[0] + k * v[0],
  normal[1] + k * v[1],
  normal[2] + k * v[2],
];

/** The colour a piece-level state shows on every facelet, in `FACELETS_FTO` order. */
function stickersOf(state: FtoState): FtoFace[] {
  return FACELETS_FTO.map((facelet) => {
    const normal = FACE_NORMALS[facelet.face];
    const p = facelet.point;

    if (facelet.kind === 'centre') {
      const isA = faceParity(normal) === 1;
      const orbit = isA ? CENTRE_A_POSITIONS : CENTRE_B_POSITIONS;
      const slot = orbit.findIndex((c) => vecEquals(c.point, p));
      return orbit[(isA ? state.centreA : state.centreB)[slot]!]!.face;
    }

    if (facelet.kind === 'corner') {
      const slot = CORNER_POSITIONS_FTO.findIndex((v) => vecEquals(scaled(normal, 6, v), p));
      const piece = state.cornerPermutation[slot]!;
      const twist = state.cornerOrientation[slot]!;
      // The one rotation taking the piece home → slot with its reference sticker
      // on the + face its twist names.
      const g = ROTATIONS.find(
        (m) =>
          vecEquals(apply(m, CORNER_POSITIONS_FTO[piece]!), CORNER_POSITIONS_FTO[slot]!) &&
          vecEquals(apply(m, CORNER_PLUS_FACES[piece]![0]), CORNER_PLUS_FACES[slot]![twist]!),
      )!;
      return colourThrough(g, normal);
    }

    const slot = EDGE_POSITIONS_FTO.findIndex(
      (e) => vecDot(e, normal) === 2 && vecEquals(scaled(normal, 3, e), p),
    );
    const piece = state.edgePermutation[slot]!;
    const g = ROTATIONS.find((m) =>
      vecEquals(apply(m, EDGE_POSITIONS_FTO[piece]!), EDGE_POSITIONS_FTO[slot]!),
    )!;
    return colourThrough(g, normal);
  });
}

function simulateStickers(moves: readonly FtoMove[]): FtoFace[] {
  let colours: FtoFace[] = FACELETS_FTO.map((f) => f.face);
  for (const move of moves) {
    const once = deriveFaceletTurn(move.face);
    const turn = move.amount === 1 ? once : once.map((d) => once[d]!);
    const next = new Array<FtoFace>(colours.length);
    colours.forEach((c, i) => (next[turn[i]!] = c));
    colours = next;
  }
  return colours;
}

describe('the piece model', () => {
  it('has twelve tetrahedral rotations to read stickers through', () => {
    expect(ROTATIONS).toHaveLength(12);
  });

  /**
   * The two models share only the geometry of a single turn. Corner orientation —
   * the one thing the piece model encodes rather than tracks — has to come out
   * sticker-for-sticker identical after hundreds of turns, or its convention is wrong.
   */
  it('shows exactly the stickers the sticker model shows, after many turns', () => {
    for (let trial = 0; trial < 20; trial += 1) {
      const moves = randomMoves(`agree-${trial}`, 40);
      expect(stickersOf(applyFtoMoves(SOLVED_FTO_STATE, moves)), `trial ${trial}`).toEqual(
        simulateStickers(moves),
      );
    }
  });

  it('never moves a centre sticker to a face of the other orbit', () => {
    const colours = simulateStickers(randomMoves('orbits', 500));
    FACELETS_FTO.forEach((facelet, i) => {
      if (facelet.kind !== 'centre') return;
      expect(faceParity(FACE_NORMALS[colours[i]!])).toBe(faceParity(FACE_NORMALS[facelet.face]));
    });
  });
});

describe('solved, as the eye sees it', () => {
  it('ignores which of a colour’s three centres is where', () => {
    const swapped: FtoState = { ...SOLVED_FTO_STATE, centreA: [1, 0, 2, ...SOLVED_FTO_STATE.centreA.slice(3)] };
    expect(ftoStatesEqual(swapped, SOLVED_FTO_STATE)).toBe(false);
    expect(ftoStatesLookEqual(swapped, SOLVED_FTO_STATE)).toBe(true);
    expect(isSolvedFto(swapped)).toBe(true);
  });

  it('sees one turn as unsolved', () => {
    for (const move of MOVES) expect(isSolvedFto(applyFtoMove(SOLVED_FTO_STATE, move))).toBe(false);
  });
});
