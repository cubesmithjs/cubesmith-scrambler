import { describe, expect, it } from 'vitest';
import { RANDOM_MOVE_CUBES } from '../puzzles/nxn/solve';
import { isRedundantMove, randomMoveSequence } from '../puzzles/nxn/random-moves';
import { parseScrambleToken, inverseWideMoves } from '../puzzles/nxn/notation';
import { applyWideMoves, isSolvedNxN, modelForSize, solvedCubeNxN } from '../puzzles/nxn/state';
import { createRandomSource } from '../random/random-source';
import { BIG_CUBES } from './catalogue';
import { generateUnofficialScramble } from './index';

/**
 * χ² per degree of freedom of the per-sticker colour frequencies over `n`
 * random-moves scrambles of `length`: about 1 when every sticker position is
 * equally likely to show every colour, far above 1 while the scramble is too
 * short. An odd cube's six fixed centres never move under face and wide turns
 * and are left out, or they would dominate the statistic without measuring
 * anything about mixing.
 */
function mixing(size: number, length: number, n: number): number {
  const { facelets } = modelForSize(size);
  const faces = ['U', 'D', 'F', 'B', 'L', 'R'];
  const fixed = facelets.map(
    (f) => size % 2 === 1 && f.position.filter((c) => c === 0).length === 2,
  );
  const live = fixed.filter((isFixed) => !isFixed).length;
  const counts = new Float64Array(facelets.length * 6);
  const random = createRandomSource(`mixing-${size}-${length}`);
  for (let i = 0; i < n; i += 1) {
    const state = applyWideMoves(solvedCubeNxN(size), randomMoveSequence(random, size, length));
    for (let slot = 0; slot < facelets.length; slot += 1) {
      if (fixed[slot]) continue;
      const bin = slot * 6 + faces.indexOf(facelets[state.occupant[slot]!]!.face);
      counts[bin] = counts[bin]! + 1;
    }
  }
  const expected = n / 6;
  let chi = 0;
  for (let i = 0; i < counts.length; i += 1) {
    if (fixed[Math.floor(i / 6)]) continue;
    chi += (counts[i]! - expected) ** 2 / expected;
  }
  return chi / (live * 5);
}

/**
 * The margin the least conservative shipped WCA length keeps over its own knee:
 * `555` ships 60 moves and is indistinguishable from uniform by about 48
 * (measured 2026-10-21). A new length must keep at least this margin, so at
 * `length / 1.25` it must already be mixed.
 */
const SHIPPED_MARGIN = 1.25;
/** "Mixed": within sampling noise of 1. The df here run to thousands, so the noise is a few hundredths. */
const MIXED = 1.12;

describe('big cubes', () => {
  it('extends the shipped +20-per-size table', () => {
    const shipped = RANDOM_MOVE_CUBES.find((cube) => cube.size === 7)!;
    for (const { size, length } of BIG_CUBES) {
      expect(length).toBe(shipped.length + 20 * (size - 7));
    }
  });

  it.each(BIG_CUBES.map((cube) => [cube.event, cube] as const))(
    '%s is already mixed at length / 1.25, the margin the shipped 555 keeps',
    (_event, { size, length }) => {
      expect(mixing(size, Math.floor(length / SHIPPED_MARGIN), 1500)).toBeLessThan(MIXED);
    },
  );

  it('measures something: a length well short of the knee is visibly not mixed', () => {
    // Guards the statistic itself. If it read ~1 at 12 moves it would pass
    // any length and prove nothing.
    expect(mixing(9, 12, 1500)).toBeGreaterThan(10);
  });

  it.each(BIG_CUBES.map((cube) => [cube.event, cube] as const))(
    '%s: the right length, no redundant move, and the inverse solves it',
    async (event, { size, length }) => {
      const { moves } = await generateUnofficialScramble(event, { seed: `big-${event}` });
      const parsed = moves.split(' ').map((token) => parseScrambleToken(token, size));
      expect(parsed).toHaveLength(length);
      for (let i = 1; i < parsed.length; i += 1) {
        expect(isRedundantMove(parsed.slice(0, i), parsed[i]!)).toBe(false);
      }
      // Layer counts go up to floor(size / 2), so a 12x12x12 uses `6Rw`.
      expect(Math.max(...parsed.map((move) => move.depth))).toBeLessThanOrEqual(Math.floor(size / 2));
      const state = applyWideMoves(solvedCubeNxN(size), parsed);
      expect(isSolvedNxN(state)).toBe(false);
      expect(isSolvedNxN(applyWideMoves(state, inverseWideMoves(parsed)))).toBe(true);
    },
  );
});
