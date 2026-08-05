import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { permutationParity } from '../../utils/permutation';
import { randomInt } from '../../utils/random-int';
import {
  allMovesForSize,
  inverseWideMoves,
  wideMoveToString,
  type WideMove,
} from './notation';
import { buildFacelets } from './geometry';
import {
  applyWideMove,
  applyWideMoves,
  cubeNxNStatesEqual,
  faceletCount,
  isIdentityNxN,
  isSolvedNxN,
  misplacedFaceletCount,
  modelForSize,
  solvedCubeNxN,
  type CubeNxNState,
} from './state';

const SIZES = [4, 5, 6, 7] as const;

describe('the facelet model', () => {
  it('has 6n^2 facelets, all distinct', () => {
    for (const size of SIZES) {
      const facelets = buildFacelets(size);
      expect(facelets).toHaveLength(faceletCount(size));
      const keys = facelets.map((f) => `${f.position.join(',')}|${f.normal.join(',')}`);
      expect(new Set(keys).size).toBe(facelets.length);
    }
  });

  it('gives every face exactly n^2 facelets', () => {
    for (const size of SIZES) {
      const counts = new Map<string, number>();
      for (const facelet of buildFacelets(size)) {
        counts.set(facelet.face, (counts.get(facelet.face) ?? 0) + 1);
      }
      expect(counts.size).toBe(6);
      for (const count of counts.values()) expect(count).toBe(size * size);
    }
  });

  /**
   * The distinction the module doc calls out: a facelet's position always has
   * one coordinate at ±size, so layer membership has to be read off the
   * *cubie* (position minus normal), never the facelet itself. If it were read
   * off the position, every R-face sticker would count as being in the
   * outermost layer of all three axes.
   */
  it('puts every facelet exactly one unit outside its cubie, on the surface', () => {
    for (const size of SIZES) {
      for (const facelet of buildFacelets(size)) {
        const outer = facelet.position.filter((c) => Math.abs(c) === size);
        expect(outer).toHaveLength(1);
        const center = facelet.position.map((c, i) => c - facelet.normal[i]!);
        // Centers run over `2i - size + 1`, so they share their parity with
        // `size - 1`: odd on an even cube, and even on an odd cube — where the
        // middle layer sits at 0, right on each axis.
        expect(
          center.every(
            (c) => Math.abs(c) <= size - 1 && (c - (size - 1)) % 2 === 0,
          ),
        ).toBe(true);
      }
    }
  });

  it('has a facelet dead-centre on each face exactly when the cube is odd', () => {
    for (const size of SIZES) {
      const onAxis = buildFacelets(size).filter((f) =>
        f.position.every((c, i) => c === f.normal[i]! * size || c === 0),
      );
      expect(onAxis).toHaveLength(size % 2 === 1 ? 6 : 0);
    }
  });
});

describe('every move has order 4', () => {
  for (const size of SIZES) {
    it(`on ${size}x${size}x${size}`, () => {
      for (const move of allMovesForSize(size)) {
        let state = solvedCubeNxN(size);
        for (let i = 0; i < 4; i += 1) state = applyWideMove(state, move);
        expect(isIdentityNxN(state)).toBe(true);
      }
    });
  }
});

describe('move amounts compose', () => {
  it('a half turn is two quarters and a prime is three, on every size', () => {
    for (const size of SIZES) {
      for (const move of allMovesForSize(size)) {
        if (move.amount !== 1) continue;
        const twice = applyWideMoves(solvedCubeNxN(size), [move, move]);
        const half = applyWideMove(solvedCubeNxN(size), { ...move, amount: 2 });
        expect(cubeNxNStatesEqual(twice, half)).toBe(true);

        const thrice = applyWideMoves(solvedCubeNxN(size), [move, move, move]);
        const prime = applyWideMove(solvedCubeNxN(size), { ...move, amount: 3 });
        expect(cubeNxNStatesEqual(thrice, prime)).toBe(true);
      }
    }
  });
});

describe('round trip: a sequence followed by its inverse returns to the identity', () => {
  it('holds for many random sequences on every size', () => {
    for (const size of SIZES) {
      const random = createRandomSource(`nxn-round-trip-${size}`);
      const moves = allMovesForSize(size);
      for (let trial = 0; trial < 40; trial += 1) {
        const sequence = Array.from(
          { length: 1 + randomInt(random, 30) },
          () => moves[randomInt(random, moves.length)]!,
        );
        const scrambled = applyWideMoves(solvedCubeNxN(size), sequence);
        const restored = applyWideMoves(scrambled, inverseWideMoves(sequence));
        expect(isIdentityNxN(restored)).toBe(true);
      }
    }
  });
});

/**
 * Independent oracles, all resting on one structural fact: a quarter turn of a
 * depth-`d` block is a product of *disjoint 4-cycles*, one per orbit of four
 * facelets. That pins down the moved count and the permutation parity as two
 * separately-computable quantities that have to agree.
 */
describe('group invariants', () => {
  /** `n^2` on the face itself, plus `d` rings of `4n` side facelets — less the one facelet that sits on the rotation axis when the cube is odd. */
  const expectedMoved = (size: number, depth: number): number =>
    size * size + 4 * size * depth - (size % 2 === 1 ? 1 : 0);

  it('a depth-d quarter turn moves exactly the facelets its block owns', () => {
    for (const size of SIZES) {
      const { permutations } = modelForSize(size);
      for (let depth = 1; depth <= Math.floor(size / 2); depth += 1) {
        const destination = permutations.get(`R${depth}.1`)!;
        const moved = destination.filter((d, i) => d !== i).length;
        expect(moved).toBe(expectedMoved(size, depth));
      }
    }
  });

  it('and that count is always a multiple of 4, as disjoint 4-cycles require', () => {
    for (const size of SIZES) {
      for (let depth = 1; depth <= Math.floor(size / 2); depth += 1) {
        expect(expectedMoved(size, depth) % 4).toBe(0);
      }
    }
  });

  it('every move permutation is a bijection', () => {
    for (const size of SIZES) {
      const { permutations } = modelForSize(size);
      for (const destination of permutations.values()) {
        expect(new Set(destination).size).toBe(faceletCount(size));
      }
    }
  });

  /**
   * The cross-check: each 4-cycle is three transpositions, so a quarter turn's
   * parity must equal `(moved / 4) mod 2` — odd on a 5x5x5 and even on a
   * 4x4x4, for instance. The parity is computed from the permutation and the
   * count from the geometry, so agreeing is a real constraint rather than a
   * restatement.
   */
  it('a quarter turn’s parity matches its 4-cycle count, and a half turn is always even', () => {
    for (const size of SIZES) {
      const { permutations } = modelForSize(size);
      for (const move of allMovesForSize(size)) {
        const destination = permutations.get(`${move.face}${move.depth}.${move.amount}`)!;
        const parity = permutationParity(destination);
        if (move.amount === 2) {
          // A half turn is disjoint 2-cycles: two transpositions per 4-cycle
          // of the quarter turn, hence always even.
          expect(parity).toBe(0);
        } else {
          const cycles = expectedMoved(size, move.depth) / 4;
          expect(parity).toBe(((cycles * 3) % 2) as 0 | 1);
        }
      }
    }
  });
});

describe('solved versus identity', () => {
  it('a solved cube is both', () => {
    for (const size of SIZES) {
      expect(isSolvedNxN(solvedCubeNxN(size))).toBe(true);
      expect(isIdentityNxN(solvedCubeNxN(size))).toBe(true);
      expect(misplacedFaceletCount(solvedCubeNxN(size))).toBe(0);
    }
  });

  /**
   * The two notions genuinely differ, and this is the case that shows it:
   * turning the whole cube's inner slices around can leave every face one
   * colour while no facelet is in its original slot. `isSolvedNxN` is the real
   * question; `isIdentityNxN` is the stricter one the round trip needs.
   */
  it('differ: a same-face facelet swap is solved but not the identity', () => {
    const size = 5;
    const solved = solvedCubeNxN(size);
    // Swap two facelets that both belong to the U face.
    const { facelets } = modelForSize(size);
    const uSlots = facelets
      .map((f, i) => (f.face === 'U' ? i : -1))
      .filter((i) => i >= 0);
    const occupant = [...solved.occupant];
    const [a, b] = [uSlots[0]!, uSlots[1]!];
    [occupant[a], occupant[b]] = [occupant[b]!, occupant[a]!];
    const state: CubeNxNState = { size, occupant };

    expect(isSolvedNxN(state)).toBe(true);
    expect(isIdentityNxN(state)).toBe(false);
  });

  it('a single move is neither', () => {
    for (const size of SIZES) {
      for (const move of allMovesForSize(size)) {
        const state = applyWideMove(solvedCubeNxN(size), move);
        expect(isIdentityNxN(state)).toBe(false);
        expect(isSolvedNxN(state)).toBe(false);
      }
    }
  });
});

describe('the modelled move set', () => {
  /**
   * A size's model covers the moves its scrambles use (depth up to
   * `floor(n/2)`) *plus* the one deeper block `orientation.ts` needs to
   * reorient the puzzle for the blindfolded events. So `3Rw` is applicable to
   * a 5x5x5 even though a 5x5x5 scramble never contains one.
   */
  it('includes the orientation depth as well as the scramble depths', () => {
    expect(() =>
      applyWideMove(solvedCubeNxN(5), { face: 'R', depth: 3, amount: 1 }),
    ).not.toThrow();
    expect(() =>
      applyWideMove(solvedCubeNxN(3), { face: 'R', depth: 2, amount: 1 }),
    ).not.toThrow();
  });

  it('rejects a depth beyond that', () => {
    const illegal: WideMove = { face: 'R', depth: 4, amount: 1 };
    expect(wideMoveToString(illegal)).toBe('4Rw');
    expect(() => applyWideMove(solvedCubeNxN(5), illegal)).toThrow(/not a legal move/);
    expect(() => applyWideMove(solvedCubeNxN(3), { face: 'R', depth: 3, amount: 1 })).toThrow(
      /not a legal move/,
    );
  });
});
