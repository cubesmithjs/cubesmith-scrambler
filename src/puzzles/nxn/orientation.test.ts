import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { parseWideMove, wideMoveToString } from './notation';
import {
  CUBE_ORIENTATION_COUNT,
  orientationDepth,
  orientationKey,
  orientationMoves,
  orientationSuffixes,
  randomOrientationSuffix,
  withRandomOrientation,
} from './orientation';
import { applyWideMoves, solvedCubeNxN } from './state';

describe('orientationDepth', () => {
  it('is the shallowest block that reaches the middle layer', () => {
    expect(orientationDepth(3)).toBe(2); // Rw
    expect(orientationDepth(5)).toBe(3); // 3Rw
    expect(orientationDepth(7)).toBe(4); // 4Rw
  });

  it('is deeper than any depth a scramble uses, which is the point', () => {
    for (const size of [3, 5, 7]) {
      expect(orientationDepth(size)).toBeGreaterThan(Math.floor(size / 2));
    }
  });

  it('gives the 3x3x3 exactly the Rw/Fw vocabulary official 3BLD scrambles end with', () => {
    const tokens = orientationMoves(3).map(wideMoveToString);
    expect(tokens).toContain('Rw');
    expect(tokens).toContain('Rw2');
    expect(tokens).toContain("Rw'");
    expect(tokens).toContain('Fw');
    expect(tokens).toHaveLength(18);
  });
});

/**
 * The regulation is specific — "equal probability for each orientation" — so
 * the suffix set has to be *complete*, and the obvious constructions aren't.
 */
describe('orientationSuffixes', () => {
  it('finds exactly 24 orientations for a 3x3x3, all distinct', () => {
    const suffixes = orientationSuffixes(3);
    expect(suffixes).toHaveLength(CUBE_ORIENTATION_COUNT);

    const solved = solvedCubeNxN(3);
    const reached = suffixes.map((s) => orientationKey(applyWideMoves(solved, s)));
    expect(new Set(reached).size).toBe(CUBE_ORIENTATION_COUNT);
  });

  it('includes the identity, so one scramble in 24 gets no suffix at all', () => {
    expect(orientationSuffixes(3).some((s) => s.length === 0)).toBe(true);
  });

  it('is short: at most two wide moves, matching what official 3BLD scrambles look like', () => {
    for (const suffix of orientationSuffixes(3)) {
      expect(suffix.length).toBeLessThanOrEqual(2);
    }
  });

  /**
   * Why the search exists. `Rw^a Fw^b` contributes rotations about two axes,
   * and `a, b ∈ 0..3` gives only 16 distinct rotations of the 24 — so a
   * hand-written two-token vocabulary of that shape cannot satisfy 4b3a.
   */
  it('needs more than the 16 orientations Rw^a Fw^b can reach', () => {
    const solved = solvedCubeNxN(3);
    const reached = new Set<string>();
    for (let a = 0; a < 4; a += 1) {
      for (let b = 0; b < 4; b += 1) {
        const suffix = [
          ...(a === 0 ? [] : [{ face: 'R' as const, depth: 2, amount: a as 1 | 2 | 3 }]),
          ...(b === 0 ? [] : [{ face: 'F' as const, depth: 2, amount: b as 1 | 2 | 3 }]),
        ];
        reached.add(orientationKey(applyWideMoves(solved, suffix)));
      }
    }
    expect(reached.size).toBe(16);
    expect(reached.size).toBeLessThan(CUBE_ORIENTATION_COUNT);
  });

  it('works for a 5x5x5 too', () => {
    expect(orientationSuffixes(5)).toHaveLength(CUBE_ORIENTATION_COUNT);
  });

  it('refuses an even cube, which has no fixed centres to orient', () => {
    expect(() => orientationSuffixes(4)).toThrow(/no fixed centres/);
    expect(() => orientationSuffixes(6)).toThrow(/no fixed centres/);
  });
});

describe('randomOrientationSuffix', () => {
  it('draws every orientation with equal probability (Regulation 4b3a)', () => {
    const random = createRandomSource('orientation-uniformity');
    const DRAWS = 48_000;
    const counts = new Map<string, number>();
    const solved = solvedCubeNxN(3);

    for (let trial = 0; trial < DRAWS; trial += 1) {
      const suffix = randomOrientationSuffix(random, 3);
      const moves = suffix.length === 0 ? [] : suffix.split(' ').map(parseWideMove);
      const key = orientationKey(applyWideMoves(solved, moves));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    expect(counts.size).toBe(CUBE_ORIENTATION_COUNT);
    const expected = DRAWS / CUBE_ORIENTATION_COUNT;
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.9);
      expect(count).toBeLessThan(expected * 1.1);
    }
  });

  it('every suffix it produces parses back', () => {
    const random = createRandomSource('orientation-parse');
    for (let trial = 0; trial < 500; trial += 1) {
      const suffix = randomOrientationSuffix(random, 3);
      if (suffix.length === 0) continue;
      for (const token of suffix.split(' ')) {
        expect(() => parseWideMove(token)).not.toThrow();
      }
    }
  });
});

describe('withRandomOrientation', () => {
  it('appends the suffix with a single space, or nothing for the identity', () => {
    const random = createRandomSource('orientation-append');
    for (let trial = 0; trial < 200; trial += 1) {
      const result = withRandomOrientation('R U F', random, 3);
      expect(result.startsWith('R U F')).toBe(true);
      expect(result).not.toMatch(/\s\s/);
      expect(result).not.toMatch(/\s$/);
    }
  });

  it('leaves some scrambles untouched — the identity orientation is a real outcome', () => {
    const random = createRandomSource('orientation-identity');
    const results = Array.from({ length: 500 }, () =>
      withRandomOrientation('R U F', random, 3),
    );
    expect(results.some((r) => r === 'R U F')).toBe(true);
    expect(results.some((r) => r !== 'R U F')).toBe(true);
  });
});
