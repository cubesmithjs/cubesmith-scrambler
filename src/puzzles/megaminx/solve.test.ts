import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import {
  allMovesMegaminx,
  inverseMegaminxMoves,
  megaminxMovesToString,
  megaminxMoveToString,
  parseMegaminxMove,
} from './notation';
import {
  applyMegaminxMoves,
  CORNER_COUNT_MINX,
  EDGE_COUNT_MINX,
  isSolvedMegaminx,
  megaminxStatesEqual,
  misplacedPieceCount,
  SOLVED_MEGAMINX_STATE,
} from './state';
import {
  generateMegaminxScramble,
  MEGAMINX_LINES,
  MEGAMINX_MOVES_PER_LINE,
  MEGAMINX_SCRAMBLE_LENGTH,
  megaminxScrambleIsFarEnough,
  megaminxScrambleMoves,
} from './solve';

const scrambles = Array.from({ length: 400 }, (_, seed) =>
  generateMegaminxScramble(createRandomSource(`minx-shape-${seed}`)),
);

describe('the scramble template', () => {
  it('is seven lines of ten alternating R/D moves plus a U — 77 moves', () => {
    expect(MEGAMINX_LINES).toBe(7);
    expect(MEGAMINX_MOVES_PER_LINE).toBe(10);
    expect(MEGAMINX_SCRAMBLE_LENGTH).toBe(77);
  });

  it('every scramble follows it exactly', () => {
    for (const scramble of scrambles) {
      const tokens = scramble.split(' ');
      expect(tokens).toHaveLength(MEGAMINX_SCRAMBLE_LENGTH);
      for (let line = 0; line < MEGAMINX_LINES; line += 1) {
        const start = line * (MEGAMINX_MOVES_PER_LINE + 1);
        for (let i = 0; i < MEGAMINX_MOVES_PER_LINE; i += 1) {
          expect(tokens[start + i]).toMatch(i % 2 === 0 ? /^R(\+\+|--)$/ : /^D(\+\+|--)$/);
        }
        expect(tokens[start + MEGAMINX_MOVES_PER_LINE]).toMatch(/^U'?$/);
      }
    }
  });

  it('re-parses and re-prints to the identical string', () => {
    for (const scramble of scrambles) {
      const moves = scramble.split(' ').map(parseMegaminxMove);
      expect(moves.map(megaminxMoveToString).join(' ')).toBe(scramble);
    }
  });
});

describe('the randomness is exactly the 77 directions', () => {
  it('each of the 77 positions takes both directions across the sample, roughly evenly', () => {
    const counts = new Array<number>(MEGAMINX_SCRAMBLE_LENGTH).fill(0);
    for (const scramble of scrambles) {
      scramble.split(' ').forEach((token, i) => {
        if (token === 'U' || token.endsWith('++')) counts[i]! += 1;
      });
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(scrambles.length * 0.35);
      expect(count).toBeLessThan(scrambles.length * 0.65);
    }
  });

  it('is deterministic given a seed and varies without one', () => {
    expect(generateMegaminxScramble(createRandomSource('fixed'))).toBe(
      generateMegaminxScramble(createRandomSource('fixed')),
    );
    expect(new Set(scrambles).size).toBe(scrambles.length);
  });
});

/**
 * The end-to-end gate, adapted honestly for a random-moves event: there is no
 * solver, by design and per Regulation 4b3e, so the round trip is
 * scramble-then-invert rather than scramble-then-solve. It still exercises
 * generation, rendering, parsing and the geometrically derived move tables in
 * one pass — and the "genuinely scrambles" half below is what a string
 * generator with no state model could never check.
 */
describe('end-to-end round trip', () => {
  it('every scramble parses, scrambles, and inverts back to exactly solved', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const scramble = generateMegaminxScramble(createRandomSource(`minx-e2e-${seed}`));
      const moves = scramble.split(' ').map(parseMegaminxMove);

      const scrambled = applyMegaminxMoves(SOLVED_MEGAMINX_STATE, moves);
      expect(isSolvedMegaminx(scrambled)).toBe(false);

      const restored = applyMegaminxMoves(scrambled, inverseMegaminxMoves(moves));
      expect(megaminxStatesEqual(restored, SOLVED_MEGAMINX_STATE)).toBe(true);
    }
  });

  it('77 random moves really is "sufficiently many" — essentially every piece ends up displaced', () => {
    const total = CORNER_COUNT_MINX + EDGE_COUNT_MINX; // 50
    let worst = total;
    for (let seed = 0; seed < 400; seed += 1) {
      const state = applyMegaminxMoves(
        SOLVED_MEGAMINX_STATE,
        megaminxScrambleMoves(createRandomSource(`minx-depth-${seed}`)),
      );
      worst = Math.min(worst, misplacedPieceCount(state));
    }
    // Even the least-scrambled of 400 leaves nearly the whole puzzle displaced.
    expect(worst).toBeGreaterThan(total - 6);
  });

  /**
   * A sharp constraint on the model, and one a wrong one would fail loudly.
   * Centers only ever move as a rigid body — `R` and `D` reorient the whole
   * puzzle — so the center permutation after any sequence must be one of the
   * dodecahedron's **60** rotations, never an arbitrary permutation of 12
   * things. Across 2,000 scrambles the number of distinct center permutations
   * therefore cannot exceed 60, while an unconstrained model would show
   * hundreds.
   */
  it('the center permutation is always one of the 60 dodecahedral rotations', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 2_000; seed += 1) {
      const state = applyMegaminxMoves(
        SOLVED_MEGAMINX_STATE,
        megaminxScrambleMoves(createRandomSource(`minx-orientation-${seed}`)),
      );
      seen.add(state.centerPermutation.join(','));
    }
    expect(seen.size).toBeLessThanOrEqual(60);
    // And they are well spread rather than stuck on a handful.
    expect(seen.size).toBeGreaterThan(40);
  });
});

/**
 * Regulation 4b3e's floor. Megaminx has no solver and no distance function, so
 * the only threshold available without one is the base case — solved, or one
 * move from solved — which is exactly the threshold the regulation names.
 */
describe('the two-move floor (Regulation 4b3e)', () => {
  it('rejects the solved state', () => {
    expect(megaminxScrambleIsFarEnough([])).toBe(false);
  });

  it('rejects every state one move from solved, in both directions of all three kinds', () => {
    for (const move of allMovesMegaminx()) {
      expect(megaminxScrambleIsFarEnough([move]), megaminxMoveToString(move)).toBe(false);
    }
    // The inverses too — one move from solved means either direction.
    for (const move of allMovesMegaminx()) {
      expect(megaminxScrambleIsFarEnough(inverseMegaminxMoves([move]))).toBe(false);
    }
  });

  it('accepts a two-move state, so the floor is a floor and not a blanket', () => {
    expect(
      megaminxScrambleIsFarEnough([
        { kind: 'R', direction: 1 },
        { kind: 'U', direction: 1 },
      ]),
    ).toBe(true);
  });

  it('holds for every generated scramble', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const moves = megaminxScrambleMoves(createRandomSource(`minx-floor-${seed}`));
      expect(megaminxScrambleIsFarEnough(moves), `seed ${seed}`).toBe(true);
    }
  });

  it('does not change what a seed produces — the first draw passes essentially always', () => {
    // The redraw loop is a requirement, not a filter that bites. If this ever
    // fails, the floor is rejecting real scrambles and something is wrong with
    // the check rather than with the draw.
    for (let seed = 0; seed < 50; seed += 1) {
      const random = createRandomSource(`minx-additive-${seed}`);
      const drawn = megaminxMovesToString(megaminxScrambleMoves(random));
      expect(generateMegaminxScramble(createRandomSource(`minx-additive-${seed}`))).toBe(drawn);
    }
  });
});
