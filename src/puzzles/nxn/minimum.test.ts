import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { isAtLeastTwoMovesFromSolved } from '../../core/scramble-shape';
import { generate333BlindfoldedScramble, generate555BlindfoldedScramble } from '../variants';
import { cubeScrambleIsFarEnough, withMinimumDistance } from './minimum';
import { allMovesForSize, wideMoveToString } from './notation';
import { generateCubeNxNScramble } from './solve';
import { applyWideMove, isUniformlyColouredNxN, solvedCubeNxN } from './state';

describe('the two-move floor', () => {
  it('rejects solved and every state one move from it, and nothing else nearby', () => {
    expect(cubeScrambleIsFarEnough('', 3)).toBe(false);
    for (const move of allMovesForSize(3)) {
      expect(cubeScrambleIsFarEnough(wideMoveToString(move), 3), wideMoveToString(move)).toBe(
        false,
      );
    }
    // Two moves that do not cancel is far enough, by definition.
    expect(cubeScrambleIsFarEnough('R U', 3)).toBe(true);
    // …and two that do cancel is not, because the state is solved.
    expect(cubeScrambleIsFarEnough("R R'", 3)).toBe(false);
  });

  it('sees through a wide move to the state it leaves', () => {
    // `Uw` is a rotation composed with a turn, so it leaves a cube one move from
    // solved even though the sequence has a move in it.
    expect(cubeScrambleIsFarEnough('Uw', 3)).toBe(false);
    expect(cubeScrambleIsFarEnough('3Uw', 5)).toBe(false);
    // A whole-cube rotation of a 5x5x5 by wide moves leaves it solved outright.
    expect(cubeScrambleIsFarEnough('3Uw 3Uw2 3Uw', 5)).toBe(false);
  });

  it('is the same predicate as the generic helper it is built on', () => {
    const state = applyWideMove(solvedCubeNxN(3), allMovesForSize(3)[7]!);
    expect(
      isAtLeastTwoMovesFromSolved(
        state,
        allMovesForSize(3),
        applyWideMove,
        isUniformlyColouredNxN,
      ),
    ).toBe(false);
  });

  it('gives up loudly rather than looping forever', () => {
    expect(() => withMinimumDistance(3, () => 'R', 3)).toThrow(/within one move of solved/);
  });
});

describe('the generators it guards', () => {
  it('produces 5x5x5 scrambles that clear the floor', () => {
    const random = createRandomSource('nxn floor');
    for (let trial = 0; trial < 5; trial += 1) {
      expect(cubeScrambleIsFarEnough(generateCubeNxNScramble(random, 5, 60), 5)).toBe(true);
    }
  });

  /**
   * The case the check exists for: a blindfolded scramble is the drawn state
   * *plus* an orientation suffix, and the suffix moves the state. Checking the
   * draw alone would not check what a competitor is handed.
   */
  it('produces blindfolded scrambles that clear the floor after the orientation suffix', () => {
    const random = createRandomSource('bld floor');
    for (let trial = 0; trial < 4; trial += 1) {
      expect(cubeScrambleIsFarEnough(generate333BlindfoldedScramble(random), 3)).toBe(true);
    }
    for (let trial = 0; trial < 2; trial += 1) {
      expect(cubeScrambleIsFarEnough(generate555BlindfoldedScramble(random), 5)).toBe(true);
    }
  });
});
