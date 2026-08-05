import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { inverseWideMoves, maxDepthForSize, parseWideMove } from './notation';
import {
  applyWideMoves,
  faceletCount,
  isIdentityNxN,
  isSolvedNxN,
  misplacedFaceletCount,
  solvedCubeNxN,
} from './state';
import { generateCubeNxNScramble, RANDOM_MOVE_CUBES } from './solve';

describe('the random-moves cube events', () => {
  it('are 555, 666 and 777 at the conventional lengths', () => {
    expect(RANDOM_MOVE_CUBES).toEqual([
      { event: '555', size: 5, length: 60 },
      { event: '666', size: 6, length: 80 },
      { event: '777', size: 7, length: 100 },
    ]);
  });

  it('does not include 444 — that one is random-state, not random-moves', () => {
    // Regulation 4b3e lists 5x5x5, 6x6x6, 7x7x7 and Megaminx. 4x4x4 is
    // conspicuously absent, so it falls under the random-state default.
    expect(RANDOM_MOVE_CUBES.some((c) => c.event === '444')).toBe(false);
  });
});

for (const { event, size, length } of RANDOM_MOVE_CUBES) {
  describe(`${event} (${size}x${size}x${size})`, () => {
    const scrambles = Array.from({ length: 200 }, (_, seed) =>
      generateCubeNxNScramble(createRandomSource(`${event}-shape-${seed}`), size, length),
    );

    it(`is ${length} space-separated wide-move tokens`, () => {
      for (const scramble of scrambles) {
        expect(scramble.split(' ')).toHaveLength(length);
      }
    });

    it('every token parses and is within this cube’s depth limit', () => {
      const maxDepth = maxDepthForSize(size);
      for (const scramble of scrambles) {
        for (const token of scramble.split(' ')) {
          const move = parseWideMove(token);
          expect(move.depth).toBeGreaterThanOrEqual(1);
          expect(move.depth).toBeLessThanOrEqual(maxDepth);
        }
      }
    });

    it('re-parses and re-prints to the identical string', () => {
      for (const scramble of scrambles) {
        const moves = scramble.split(' ').map(parseWideMove);
        expect(moves.map((m) => (m.depth >= 3 ? String(m.depth) : '') + m.face + (m.depth >= 2 ? 'w' : '') + (m.amount === 2 ? '2' : m.amount === 3 ? "'" : '')).join(' ')).toBe(scramble);
      }
    });

    /**
     * The end-to-end gate, in the form a random-moves event admits: there is no
     * solver by design (Regulation 4b3e), so the round trip is
     * scramble-then-invert. It still exercises generation, rendering, parsing
     * and the geometrically derived facelet permutations in one pass.
     */
    it('scrambles, and inverts back to exactly the identity', () => {
      for (let seed = 0; seed < 60; seed += 1) {
        const scramble = generateCubeNxNScramble(
          createRandomSource(`${event}-e2e-${seed}`),
          size,
          length,
        );
        const moves = scramble.split(' ').map(parseWideMove);

        const scrambled = applyWideMoves(solvedCubeNxN(size), moves);
        expect(isSolvedNxN(scrambled)).toBe(false);
        expect(isIdentityNxN(scrambled)).toBe(false);

        const restored = applyWideMoves(scrambled, inverseWideMoves(moves));
        expect(isIdentityNxN(restored)).toBe(true);
      }
    });

    /**
     * What "sufficiently many random moves" actually has to mean. A length that
     * left large patches of the cube intact would satisfy the letter of 4b3e
     * and be a bad scramble; this measures the thing that matters.
     */
    it(`${length} moves leaves almost every facelet on the wrong face`, () => {
      let best = faceletCount(size);
      for (let seed = 0; seed < 200; seed += 1) {
        const scramble = generateCubeNxNScramble(
          createRandomSource(`${event}-depth-${seed}`),
          size,
          length,
        );
        const state = applyWideMoves(
          solvedCubeNxN(size),
          scramble.split(' ').map(parseWideMove),
        );
        best = Math.min(best, misplacedFaceletCount(state));
      }
      // A uniformly random colouring would leave 5/6 ≈ 0.83 of facelets on the
      // wrong face, and that is the ceiling to compare against — reduced a
      // little on odd cubes, whose six dead-centre facelets sit on the
      // rotation axes of every move the notation offers and so never move at
      // all. Even the least-scrambled of 200 samples clears 0.6.
      expect(best / faceletCount(size)).toBeGreaterThan(0.6);
    });

    it('no face is ever left solved', () => {
      for (let seed = 0; seed < 100; seed += 1) {
        const scramble = generateCubeNxNScramble(
          createRandomSource(`${event}-faces-${seed}`),
          size,
          length,
        );
        const state = applyWideMoves(
          solvedCubeNxN(size),
          scramble.split(' ').map(parseWideMove),
        );
        expect(isSolvedNxN(state)).toBe(false);
      }
    });

    it('is deterministic given a seed and varies without one', () => {
      expect(generateCubeNxNScramble(createRandomSource('fixed'), size, length)).toBe(
        generateCubeNxNScramble(createRandomSource('fixed'), size, length),
      );
      expect(new Set(scrambles).size).toBe(scrambles.length);
    });
  });
}
