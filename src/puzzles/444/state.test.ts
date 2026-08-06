import { describe, expect, it } from 'vitest';
import { FACES } from '../../notation/move';
import { allMovesForSize, wideMoveToString } from '../nxn/notation';
import {
  applyWideMove,
  applyWideMoves,
  isIdentityNxN,
  isSolvedNxN,
  solvedCubeNxN,
} from '../nxn/state';
import {
  CENTRE_COUNT_444,
  CORNER_COUNT_444,
  pieces444,
  SIZE_444,
  WING_COUNT_444,
} from './pieces';
import {
  apply444Moves,
  apply444Table,
  cube444StatesEqual,
  faceletColoursOf444,
  faceletColoursOfNxN,
  from444Facelets,
  is444Solved,
  move444Tables,
  SOLVED_444_STATE,
} from './state';

function makeRandom(seed: number): (bound: number) => number {
  let state = seed;
  return (bound) => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % bound;
  };
}

describe('the pieces, read off the geometry', () => {
  const { cornerFacelets, wingFacelets, centreFacelets, centreFace } = pieces444();

  it('accounts for every facelet exactly once', () => {
    const seen = [
      ...cornerFacelets.flat(),
      ...wingFacelets.flat(),
      ...centreFacelets,
    ];
    expect(seen).toHaveLength(6 * SIZE_444 * SIZE_444);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('finds 8 corners of three, 24 wings of two and 24 centres of one', () => {
    expect(cornerFacelets).toHaveLength(CORNER_COUNT_444);
    expect(wingFacelets).toHaveLength(WING_COUNT_444);
    expect(centreFacelets).toHaveLength(CENTRE_COUNT_444);
    expect(cornerFacelets.every((c) => c.length === 3)).toBe(true);
    expect(wingFacelets.every((w) => w.length === 2)).toBe(true);
  });

  it('puts a corner facelet on U or D first, and never two of them', () => {
    const { facelets } = pieces444();
    for (const ids of cornerFacelets) {
      const faces = ids.map((id) => facelets[id]!.face);
      expect(['U', 'D']).toContain(faces[0]);
      expect(faces.filter((face) => face === 'U' || face === 'D')).toHaveLength(1);
    }
  });

  it('gives each face four centres', () => {
    for (const [face] of FACES.entries()) {
      expect(centreFace.filter((f) => f === face)).toHaveLength(4);
    }
  });

  it('pairs the wings onto 3x3x3 edges', () => {
    const { facelets } = pieces444();
    for (let edge = 0; edge < 12; edge += 1) {
      // The two wings of an edge wear the same pair of colours.
      const first = wingFacelets[2 * edge]!.map((id) => facelets[id]!.face).sort();
      const second = wingFacelets[2 * edge + 1]!.map((id) => facelets[id]!.face).sort();
      expect(first).toEqual(second);
    }
  });
});

/**
 * **Checkpoint A** of `docs/444-design.md`: the piece model must agree with the
 * facelet model on everything. The facelet model is the oracle — it tracks every
 * sticker individually and shares no code with the tables under test beyond the
 * geometry both are derived from.
 */
describe('checkpoint A: the piece model against the facelet oracle', () => {
  const tables = move444Tables();

  it('has a table for each of the 36 moves', () => {
    expect(tables).toHaveLength(36);
    expect(tables.map((t) => wideMoveToString(t.move))).toEqual(
      allMovesForSize(SIZE_444).map(wideMoveToString),
    );
  });

  it('agrees with the oracle on every single move', () => {
    const disagreements: string[] = [];
    for (const table of tables) {
      const viaPieces = faceletColoursOf444(apply444Table(SOLVED_444_STATE, table));
      const viaFacelets = faceletColoursOfNxN(applyWideMove(solvedCubeNxN(SIZE_444), table.move));
      if (JSON.stringify(viaPieces) !== JSON.stringify(viaFacelets)) {
        disagreements.push(wideMoveToString(table.move));
      }
    }
    expect(disagreements).toEqual([]);
  });

  it('agrees with the oracle on long random sequences', () => {
    const next = makeRandom(20260806);
    for (let trial = 0; trial < 40; trial += 1) {
      const indices = Array.from({ length: 30 }, () => next(tables.length));
      const viaPieces = faceletColoursOf444(apply444Moves(SOLVED_444_STATE, indices));
      const viaFacelets = faceletColoursOfNxN(
        applyWideMoves(solvedCubeNxN(SIZE_444), indices.map((index) => tables[index]!.move)),
      );
      expect(viaPieces).toEqual(viaFacelets);
    }
  });

  /**
   * Stronger than a round trip through one model: the two models are run
   * *independently* over the same moves and must arrive at the same piece state.
   */
  it('arrives at the same piece state as the oracle, read back', () => {
    const next = makeRandom(7);
    for (let trial = 0; trial < 30; trial += 1) {
      const indices = Array.from({ length: 20 }, () => next(tables.length));
      const viaPieces = apply444Moves(SOLVED_444_STATE, indices);
      const viaOracle = applyWideMoves(
        solvedCubeNxN(SIZE_444),
        indices.map((index) => tables[index]!.move),
      );
      expect(cube444StatesEqual(from444Facelets(viaOracle), viaPieces)).toBe(true);
    }
  });

  it('reads the oracle back into pieces, from the oracle side', () => {
    const next = makeRandom(11);
    for (let trial = 0; trial < 20; trial += 1) {
      const moves = Array.from({ length: 24 }, () => tables[next(tables.length)]!.move);
      const facelets = applyWideMoves(solvedCubeNxN(SIZE_444), moves);
      const pieces = from444Facelets(facelets);
      expect(faceletColoursOf444(pieces)).toEqual(faceletColoursOfNxN(facelets));
      expect(isSolvedNxN(facelets)).toBe(is444Solved(pieces));
    }
  });
});

describe('move algebra', () => {
  const tables = move444Tables();
  const byName = new Map(tables.map((table) => [wideMoveToString(table.move), table]));

  it('gives every quarter turn order four and every half turn order two', () => {
    for (const table of tables) {
      const order = table.move.amount === 2 ? 2 : 4;
      let state = SOLVED_444_STATE;
      for (let turn = 0; turn < order; turn += 1) state = apply444Table(state, table);
      expect(is444Solved(state), wideMoveToString(table.move)).toBe(true);
    }
  });

  it('makes a move and its inverse cancel', () => {
    for (const amount of [1, 2, 3] as const) {
      const forward = byName.get(`R${amount === 1 ? '' : amount === 2 ? '2' : "'"}`)!;
      const back = byName.get(`R${amount === 1 ? "'" : amount === 2 ? '2' : ''}`)!;
      expect(is444Solved(apply444Table(apply444Table(SOLVED_444_STATE, forward), back))).toBe(
        true,
      );
    }
  });

  it('lets opposite faces commute and adjacent ones not', () => {
    const [r, l, u] = [byName.get('R')!, byName.get('L')!, byName.get('U')!];
    expect(
      cube444StatesEqual(
        apply444Table(apply444Table(SOLVED_444_STATE, r), l),
        apply444Table(apply444Table(SOLVED_444_STATE, l), r),
      ),
    ).toBe(true);
    expect(
      cube444StatesEqual(
        apply444Table(apply444Table(SOLVED_444_STATE, r), u),
        apply444Table(apply444Table(SOLVED_444_STATE, u), r),
      ),
    ).toBe(false);
  });

  /**
   * The chirality rule in `pieces.ts` is only right if this holds: corner twists
   * sum to zero mod 3 however the cube is turned. It is the invariant that would
   * break first if the facelet triples ran opposite ways round on mirror-image
   * corners, so it is checked rather than assumed.
   */
  it('keeps the corner twist sum at zero mod 3', () => {
    const next = makeRandom(99);
    for (let trial = 0; trial < 40; trial += 1) {
      const state = apply444Moves(
        SOLVED_444_STATE,
        Array.from({ length: 25 }, () => next(tables.length)),
      );
      const sum = state.cornerOrientation.reduce((total, twist) => total + twist, 0);
      expect(sum % 3).toBe(0);
    }
  });

  /**
   * Wings can be permuted oddly while the corners stay even — that is 4x4x4
   * "parity", and it is the reason the state count of `docs/444-design.md` has no
   * correction factor. An inner slice quarter turn is the witness.
   */
  it('admits an odd wing permutation with an even corner permutation', () => {
    // `r = Rw R'` — the inner slice alone.
    const sliced = apply444Moves(
      SOLVED_444_STATE,
      [byName.get('Rw')!, byName.get("R'")!].map((table) => tables.indexOf(table)),
    );
    expect(parityOf(sliced.wingPermutation)).toBe(1);
    expect(parityOf(sliced.cornerPermutation)).toBe(0);
  });

  it('never disturbs a piece a move does not reach', () => {
    // `U` leaves the D-face centres alone, whatever else it does.
    const state = apply444Table(SOLVED_444_STATE, byName.get('U')!);
    const { centreFace } = pieces444();
    for (let slot = 0; slot < CENTRE_COUNT_444; slot += 1) {
      if (FACES[centreFace[slot]!] !== 'D') continue;
      expect(state.centreColour[slot]).toBe(SOLVED_444_STATE.centreColour[slot]);
    }
  });
});

describe('the solved state', () => {
  it('is solved, and wears every face its own colour', () => {
    expect(is444Solved(SOLVED_444_STATE)).toBe(true);
    expect(faceletColoursOf444(SOLVED_444_STATE)).toEqual(
      faceletColoursOfNxN(solvedCubeNxN(SIZE_444)),
    );
    expect(isIdentityNxN(solvedCubeNxN(SIZE_444))).toBe(true);
  });

  it('is not solved after one move, on either model', () => {
    for (const table of move444Tables()) {
      const state = apply444Table(SOLVED_444_STATE, table);
      expect(is444Solved(state), wideMoveToString(table.move)).toBe(false);
      expect(faceletColoursOf444(state)).not.toEqual(
        faceletColoursOfNxN(solvedCubeNxN(SIZE_444)),
      );
    }
  });
});

function parityOf(permutation: readonly number[]): number {
  const seen = new Array<boolean>(permutation.length).fill(false);
  let transpositions = 0;
  for (let start = 0; start < permutation.length; start += 1) {
    if (seen[start]) continue;
    let length = 0;
    for (let at = start; !seen[at]; at = permutation[at]!) {
      seen[at] = true;
      length += 1;
    }
    transpositions += length - 1;
  }
  return transpositions % 2;
}
