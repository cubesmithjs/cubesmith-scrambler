import { describe, expect, it } from 'vitest';
import { generateScramble } from '../index';
import { megaminxScrambleMoves } from '../puzzles/megaminx/solve';
import { parseMegaminxScramble } from '../puzzles/megaminx/notation';
import { applyMegaminxMoves, SOLVED_MEGAMINX_STATE } from '../puzzles/megaminx/state';
import { parseScrambleToken } from '../puzzles/nxn/notation';
import { CUBE_ORIENTATION_COUNT, orientationKey, orientationSuffixes } from '../puzzles/nxn/orientation';
import { applyWideMoves, solvedCubeNxN } from '../puzzles/nxn/state';
import { parsePyraminxScramble } from '../puzzles/pyraminx/notation';
import { createRandomSource } from '../random/random-source';
import { generateUnofficialScrambles } from './index';

/** χ² against a uniform distribution over `bins` outcomes. */
function chiSquare(counts: ReadonlyMap<string, number>, bins: number, n: number): number {
  const expected = n / bins;
  let chi = (bins - counts.size) * expected;
  for (const count of counts.values()) chi += (count - expected) ** 2 / expected;
  return chi;
}

describe('blindfolded variants', () => {
  it.each([
    ['222bf', 2],
    ['666bf', 6],
    ['777bf', 7],
  ] as const)('%s ends with an orientation suffix drawn from all 24', async (event, size) => {
    const suffixes = orientationSuffixes(size);
    expect(new Set(suffixes.map((s) => orientationKey(applyWideMoves(solvedCubeNxN(size), s)))).size).toBe(
      CUBE_ORIENTATION_COUNT,
    );

    const batch = await generateUnofficialScrambles(event, event === '222bf' ? 40 : 120, {
      seed: `bld-${event}`,
    });
    const tails = new Set<string>();
    for (const { moves } of batch) {
      const tokens = moves.split(' ').map((token) => parseScrambleToken(token, size));
      // The suffix's moves are the only ones a sighted scramble of this size
      // never contains: rotations on an even cube, ceil(n/2)-layer wide turns
      // on an odd one.
      const suffixDepth = size % 2 === 0 ? size : Math.ceil(size / 2);
      const tail = tokens.filter((move) => move.depth === suffixDepth);
      tails.add(JSON.stringify(tail));
      if (size === 2) expect(tokens.filter((move) => move.depth === 1).length).toBeGreaterThan(0);
    }
    expect(tails.size).toBeGreaterThan(event === '222bf' ? 10 : 15);
  });

  it('pyrambf is a plain random-state Pyraminx scramble: its frame is fixed by the axial pieces', async () => {
    const batch = await generateUnofficialScrambles('pyrambf', 5, { seed: 'pyrambf' });
    for (const { moves } of batch) expect(() => parsePyraminxScramble(moves)).not.toThrow();
  });

  it('🔴 minxbf needs no suffix: a WCA Megaminx scramble is already uniformly oriented', () => {
    // Pochmann's R++ and D++ turn the bulk of the puzzle, so they move the
    // centres. Measured at 30,000: all 60 orientations, χ² = 57.5 on 59 df.
    // 12,000 here keeps the suite fast; the 0.1% critical value for 59 df is
    // about 99.6.
    const random = createRandomSource('minxbf-orientation');
    const counts = new Map<string, number>();
    const n = 12000;
    for (let i = 0; i < n; i += 1) {
      const state = applyMegaminxMoves(SOLVED_MEGAMINX_STATE, megaminxScrambleMoves(random));
      const key = state.centerPermutation.join(',');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(60);
    expect(chiSquare(counts, 60, n)).toBeLessThan(99.6);
  });

  it('minxbf scrambles are WCA Megaminx scrambles', async () => {
    const [unofficial] = await generateUnofficialScrambles('minxbf', 1, { seed: 'same' });
    const wca = await generateScramble('minx', { seed: 'same' });
    expect(unofficial!.moves).toBe(wca.moves);
    expect(parseMegaminxScramble(unofficial!.moves)).toHaveLength(77);
  });
});
