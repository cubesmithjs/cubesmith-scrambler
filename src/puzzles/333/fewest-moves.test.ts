import { describe, expect, it } from 'vitest';
import { axisOf, parseMove, type FaceMove } from '../../notation/move';
import { createRandomSource } from '../../random/random-source';
import { cubeScrambleIsFarEnough } from '../nxn/minimum';
import {
  FEWEST_MOVES_PREFIX,
  FEWEST_MOVES_SUFFIX,
  generate333FewestMovesScramble,
} from './fewest-moves';
import { randomState } from './random-state';
import { solve333 } from './solve';
import { applyMoves, isSolved, SOLVED_STATE } from './state';

/**
 * The two restrictions the padding requires, restated here from the seams
 * rather than imported, so a test failure means the *behaviour* changed and
 * not merely that a constant moved.
 *
 * `R' U' F` + inner + `R' U' F`:
 *  - inner's first move abuts the prefix's last move, `F`  → not on the FB axis
 *  - inner's last move abuts the suffix's first move, `R'` → not on the RL axis
 *
 * They are different axes. TNoodle derives them the same way, and reading both
 * as `F` is the easy mistake.
 */
const FORBIDDEN_FIRST_AXIS = 'FB';
const FORBIDDEN_LAST_AXIS = 'RL';

/** Deterministic samples: a seeded source per index, so a failure names the seed. */
function scrambleForSeed(seed: string): string {
  return generate333FewestMovesScramble(createRandomSource(seed));
}

function tokensOf(scramble: string): string[] {
  return scramble.split(' ');
}

function innerTokensOf(scramble: string): string[] {
  const all = tokensOf(scramble);
  return all.slice(3, all.length - 3);
}

/**
 * The 3x3x3 solver is slow enough that every scramble in a sample is paid for.
 * Twenty is enough to see a ~1-in-3 seam violation many times over if the axis
 * restriction were dropped, while keeping the file inside a sane runtime under
 * V8 coverage instrumentation.
 */
const SAMPLE_SEEDS = Array.from({ length: 20 }, (_, i) => `fmc-${i}`);
const SAMPLE = SAMPLE_SEEDS.map(scrambleForSeed);

describe('333fm — the mandatory R\' U\' F padding', () => {
  it('starts with exactly the prefix and ends with exactly the suffix', () => {
    for (const [i, scramble] of SAMPLE.entries()) {
      expect(scramble.startsWith(`${FEWEST_MOVES_PREFIX} `), SAMPLE_SEEDS[i]).toBe(true);
      expect(scramble.endsWith(` ${FEWEST_MOVES_SUFFIX}`), SAMPLE_SEEDS[i]).toBe(true);
    }
  });

  it('pads with three moves at each end and nothing else — the whole sequence is 6 + inner', () => {
    for (const [i, scramble] of SAMPLE.entries()) {
      const tokens = tokensOf(scramble);
      const inner = innerTokensOf(scramble);
      expect(tokens.length, SAMPLE_SEEDS[i]).toBe(6 + inner.length);
      expect(tokens.slice(0, 3).join(' ')).toBe(FEWEST_MOVES_PREFIX);
      expect(tokens.slice(-3).join(' ')).toBe(FEWEST_MOVES_SUFFIX);
    }
  });

  it('never lets the inner scramble open on the prefix seam axis or close on the suffix seam axis', () => {
    for (const [i, scramble] of SAMPLE.entries()) {
      const inner = innerTokensOf(scramble).map(parseMove);
      expect(inner.length, SAMPLE_SEEDS[i]).toBeGreaterThan(0);
      expect(axisOf(inner[0]!.face), `${SAMPLE_SEEDS[i]} first`).not.toBe(FORBIDDEN_FIRST_AXIS);
      expect(axisOf(inner[inner.length - 1]!.face), `${SAMPLE_SEEDS[i]} last`).not.toBe(
        FORBIDDEN_LAST_AXIS,
      );
    }
  });

  it('leaves the padding itself intact — nothing merges within either three-move block or across its seam', () => {
    // Scoped to the padding on purpose. The *interior* of a 3x3x3 scramble can
    // still contain a same-face pair where phase 1 hands over to phase 2 —
    // a pre-existing defect of `333` itself, recorded in `docs/333-design.md`
    // §8 and not introduced or fixed here. What this task guarantees is that
    // the padding survives, which is what the axis restriction buys.
    for (const [i, scramble] of SAMPLE.entries()) {
      const moves = tokensOf(scramble).map(parseMove);
      const paddingRegions = [moves.slice(0, 4), moves.slice(-4)];
      for (const region of paddingRegions) {
        for (let m = 1; m < region.length; m += 1) {
          expect(region[m]!.face, `${SAMPLE_SEEDS[i]}`).not.toBe(region[m - 1]!.face);
        }
      }
    }
  });

  it('keeps the seams on different axes, not merely different faces — the restriction TNoodle uses', () => {
    // `… U' F | B …` would not merge, but F and B commute, so which order they
    // are printed in is arbitrary and the padding stops being a fixed marker.
    for (const [i, scramble] of SAMPLE.entries()) {
      const moves = tokensOf(scramble).map(parseMove);
      const seams: Array<[FaceMove, FaceMove]> = [
        [moves[2]!, moves[3]!],
        [moves[moves.length - 4]!, moves[moves.length - 3]!],
      ];
      for (const [before, after] of seams) {
        expect(axisOf(before.face), SAMPLE_SEEDS[i]).not.toBe(axisOf(after.face));
      }
    }
  });

  it('is a different scramble from 333 for the same seed — it is no longer an alias', () => {
    // The inner scramble is drawn from the same state distribution, but the
    // restricted solve takes a different route and the padding is unique to
    // this event, so equality here would mean the registration had regressed.
    const fmc = scrambleForSeed('alias-check');
    expect(fmc.startsWith(FEWEST_MOVES_PREFIX)).toBe(true);
    expect(innerTokensOf(fmc).join(' ')).not.toBe(fmc);
  });
});

describe('333fm — the scramble is still a real, uniformly-drawn cube state', () => {
  it('scrambles a solved cube and is re-solvable, for every sample', () => {
    for (const [i, scramble] of SAMPLE.entries()) {
      const state = applyMoves(SOLVED_STATE, tokensOf(scramble).map(parseMove));
      expect(isSolved(state), SAMPLE_SEEDS[i]).toBe(false);
      expect(isSolved(applyMoves(state, solve333(state))), SAMPLE_SEEDS[i]).toBe(true);
    }
  });

  it('satisfies Regulation 4b3 measured on the padded sequence, which is what a competitor is handed', () => {
    for (const [i, scramble] of SAMPLE.entries()) {
      expect(cubeScrambleIsFarEnough(scramble, 3), SAMPLE_SEEDS[i]).toBe(true);
    }
  });

  /**
   * The uniformity argument, as a test rather than as a comment.
   *
   * Regulation 4b3 wants equal probability for each qualifying state. The seam
   * restriction is a property of the *solution*, so filtering drawn states on
   * it would exclude some states outright — roughly one draw in nine — and the
   * distribution would no longer be uniform over all of them. Restricting the
   * search instead means every state still gets a conforming solution, so no
   * state is ever skipped and the drawn distribution is untouched.
   *
   * What is checked below is exactly that claim: over many independent draws,
   * the restricted solve always succeeds, always obeys both restrictions, and
   * always reproduces the state it was given.
   */
  it('solves every drawn state under the restriction — no state is rejected, so the draw stays uniform', () => {
    const random = createRandomSource('no-state-is-excluded');
    for (let i = 0; i < 40; i += 1) {
      const state = randomState(random);
      const solution = solve333(state, {
        firstMoveAxis: FORBIDDEN_LAST_AXIS,
        lastMoveAxis: FORBIDDEN_FIRST_AXIS,
      });
      expect(isSolved(applyMoves(state, solution)), `draw ${i}`).toBe(true);
      expect(axisOf(solution[0]!.face), `draw ${i} first`).not.toBe(FORBIDDEN_LAST_AXIS);
      expect(axisOf(solution[solution.length - 1]!.face), `draw ${i} last`).not.toBe(
        FORBIDDEN_FIRST_AXIS,
      );
    }
  });

  it('is deterministic for a seed and different across seeds', () => {
    expect(scrambleForSeed('repeatable')).toBe(scrambleForSeed('repeatable'));
    expect(scrambleForSeed('repeatable')).not.toBe(scrambleForSeed('different'));
  });

  it('honours the last-move restriction even when phase 2 has nothing to do', () => {
    // `solve333` normally hands the last-move restriction to phase 2. When
    // phase 2 comes back empty the solution ends on phase 1's last move
    // instead, and phase 1 has to carry the restriction — the one branch a
    // random draw will not reach in the lifetime of this package.
    //
    // `F'` reaches it deterministically: phase 1 solves it outright with `F`,
    // leaving phase 2 empty and the solution ending on the barred FB axis.
    // The state is one move from solved, which Regulation 4b3 excludes from
    // real scrambles — that is exactly why it takes a hand-built input.
    const state = applyMoves(SOLVED_STATE, [{ face: 'F', amount: 3 }]);
    const solution = solve333(state, { lastMoveAxis: 'FB' });

    expect(isSolved(applyMoves(state, solution))).toBe(true);
    expect(axisOf(solution[solution.length - 1]!.face)).not.toBe('FB');
  });
});
