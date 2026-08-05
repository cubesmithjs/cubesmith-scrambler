import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { distancePyraminx } from './pruning';
import { toPyraminxCoordinate } from './coordinates';
import { parsePyraminxMove, PYRAMINX_VERTICES } from './notation';
import { randomPyraminxState } from './random-state';
import { pyraminxLayerSolveDistance, solvePyraminxLayers } from './search';
import {
  generatePyraminxScramble,
  MIN_PYRAMINX_SCRAMBLE_LENGTH,
  MIN_PYRAMINX_SOLVE_DISTANCE,
  solvePyraminx,
} from './solve';
import { applyPyraminxMoves, isSolvedPyraminx, SOLVED_PYRAMINX_STATE } from './state';

describe('solvePyraminxLayers', () => {
  it('returns an optimal solution — its length always equals the exact table distance', () => {
    const random = createRandomSource('pyraminx-optimality');
    for (let trial = 0; trial < 400; trial += 1) {
      const state = randomPyraminxState(random);
      const solution = solvePyraminxLayers(state);
      expect(solution).toHaveLength(distancePyraminx(toPyraminxCoordinate(state)));
    }
  });

  it('actually solves the layers (edges and axials), for many random states', () => {
    const random = createRandomSource('pyraminx-layer-solve');
    for (let trial = 0; trial < 400; trial += 1) {
      const state = randomPyraminxState(random);
      const solved = applyPyraminxMoves(state, solvePyraminxLayers(state));
      expect(solved.edgePermutation).toEqual([0, 1, 2, 3, 4, 5]);
      expect(solved.edgeOrientation).toEqual([0, 0, 0, 0, 0, 0]);
      expect(solved.axialOrientation).toEqual([0, 0, 0, 0]);
    }
  });

  it('returns an empty solution for an already-solved state', () => {
    expect(solvePyraminxLayers(SOLVED_PYRAMINX_STATE)).toEqual([]);
  });

  it('never repeats a vertex on consecutive moves', () => {
    const random = createRandomSource('pyraminx-no-repeats');
    for (let trial = 0; trial < 200; trial += 1) {
      const solution = solvePyraminxLayers(randomPyraminxState(random));
      for (let i = 1; i < solution.length; i += 1) {
        expect(solution[i]!.vertex).not.toBe(solution[i - 1]!.vertex);
      }
    }
  });

  it('rejects an unreachable state', () => {
    expect(() =>
      solvePyraminxLayers({ ...SOLVED_PYRAMINX_STATE, edgePermutation: [1, 0, 2, 3, 4, 5] }),
    ).toThrow(/not reachable/);
  });

  it('finds an equally optimal solution under any move order', () => {
    const random = createRandomSource('pyraminx-move-order');
    for (let trial = 0; trial < 200; trial += 1) {
      const state = randomPyraminxState(random);
      const shuffled = [7, 2, 5, 0, 3, 6, 1, 4];
      const a = solvePyraminxLayers(state);
      const b = solvePyraminxLayers(state, shuffled);
      expect(b).toHaveLength(a.length);
      expect(isSolvedPyraminx({ ...applyPyraminxMoves(state, b), tipOrientation: [0, 0, 0, 0] }))
        .toBe(true);
    }
  });
});

describe('solvePyraminx (layers + tips)', () => {
  it('solves the complete puzzle including tips', () => {
    const random = createRandomSource('pyraminx-full-solve');
    for (let trial = 0; trial < 400; trial += 1) {
      const state = randomPyraminxState(random);
      expect(isSolvedPyraminx(applyPyraminxMoves(state, solvePyraminx(state)))).toBe(true);
    }
  });

  it('appends at most four tip turns, all distinct vertices, all at the end', () => {
    const random = createRandomSource('pyraminx-tip-shape');
    for (let trial = 0; trial < 200; trial += 1) {
      const solution = solvePyraminx(randomPyraminxState(random));
      const firstTip = solution.findIndex((m) => m.tip);
      if (firstTip !== -1) {
        expect(solution.slice(firstTip).every((m) => m.tip)).toBe(true);
      }
      const tips = solution.filter((m) => m.tip);
      expect(tips.length).toBeLessThanOrEqual(4);
      expect(new Set(tips.map((m) => m.vertex)).size).toBe(tips.length);
    }
  });
});

/**
 * The gate: generate a scramble string, parse it back from text (so the
 * notation layer is on the hook too, not just the internal move objects),
 * apply it to a solved Pyraminx, confirm it is no longer solved, then solve
 * it and confirm it returns to exactly solved.
 */
describe('end-to-end round trip', () => {
  it('every scramble scrambles, and re-solves to exactly solved', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const scramble = generatePyraminxScramble(createRandomSource(`pyraminx-e2e-${seed}`));
      const moves = scramble.split(' ').filter(Boolean).map(parsePyraminxMove);

      const scrambled = applyPyraminxMoves(SOLVED_PYRAMINX_STATE, moves);
      expect(isSolvedPyraminx(scrambled)).toBe(false);

      const resolved = applyPyraminxMoves(scrambled, solvePyraminx(scrambled));
      expect(isSolvedPyraminx(resolved)).toBe(true);
    }
  });
});

describe('generatePyraminxScramble output shape', () => {
  const scrambles = Array.from({ length: 400 }, (_, seed) =>
    generatePyraminxScramble(createRandomSource(`pyraminx-shape-${seed}`)),
  );

  it('matches WCA layout: layer turns first, then up to four tip turns', () => {
    for (const scramble of scrambles) {
      expect(scramble).toMatch(/^[ULRB]'?( [ULRB]'?)*( [ulrb]'?){0,4}$/);
    }
  });

  it('never repeats a vertex on consecutive layer turns', () => {
    for (const scramble of scrambles) {
      const layers = scramble
        .split(' ')
        .map(parsePyraminxMove)
        .filter((m) => !m.tip);
      for (let i = 1; i < layers.length; i += 1) {
        expect(layers[i]!.vertex).not.toBe(layers[i - 1]!.vertex);
      }
    }
  });

  it('emits tip turns in u, l, r, b order', () => {
    for (const scramble of scrambles) {
      const tips = scramble
        .split(' ')
        .map(parsePyraminxMove)
        .filter((m) => m.tip)
        .map((m) => PYRAMINX_VERTICES.indexOf(m.vertex));
      for (let i = 1; i < tips.length; i += 1) {
        expect(tips[i]!).toBeGreaterThan(tips[i - 1]!);
      }
    }
  });

  it('always has exactly 11 layer turns — the length WCA scramble sheets print', () => {
    for (const scramble of scrambles) {
      const layers = scramble
        .split(' ')
        .map(parsePyraminxMove)
        .filter((m) => !m.tip);
      expect(layers).toHaveLength(MIN_PYRAMINX_SCRAMBLE_LENGTH);
    }
  });

  /** WCA Regulation 4b3f — a claim about the state, not the printed length. */
  it('the state it reaches always needs at least 6 layer turns to solve (Regulation 4b3f)', () => {
    for (const scramble of scrambles) {
      const state = applyPyraminxMoves(
        SOLVED_PYRAMINX_STATE,
        scramble.split(' ').map(parsePyraminxMove),
      );
      expect(pyraminxLayerSolveDistance(state)).toBeGreaterThanOrEqual(
        MIN_PYRAMINX_SOLVE_DISTANCE,
      );
    }
  });

  it('uses all four vertices and both directions across the sample', () => {
    const seen = new Set(scrambles.flatMap((s) => s.split(' ')));
    for (const vertex of PYRAMINX_VERTICES) {
      expect(seen.has(vertex)).toBe(true);
      expect(seen.has(`${vertex}'`)).toBe(true);
      expect(seen.has(vertex.toLowerCase())).toBe(true);
      expect(seen.has(`${vertex.toLowerCase()}'`)).toBe(true);
    }
  });

  it('is deterministic given a seed and varies without one', () => {
    expect(generatePyraminxScramble(createRandomSource('fixed'))).toBe(
      generatePyraminxScramble(createRandomSource('fixed')),
    );
    const distinct = new Set(
      Array.from({ length: 50 }, (_, i) =>
        generatePyraminxScramble(createRandomSource(`vary-${i}`)),
      ),
    );
    expect(distinct.size).toBeGreaterThan(45);
  });
});
