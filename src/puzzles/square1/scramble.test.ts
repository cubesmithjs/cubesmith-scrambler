import { describe, expect, it } from 'vitest';
import { generateScramble } from '../../core/generate-scramble';
import { createRandomSource } from '../../random/random-source';
import { square1DistanceCappedAt } from './distance';
import { parseSquare1Scramble } from './notation';
import { generateSquare1Scramble, MIN_SQUARE1_SOLVE_DISTANCE } from './solve';
import {
  applySquare1Moves,
  isSliceLegal,
  isSquare1Solved,
  isWellFormedSquare1State,
  SOLVED_SQUARE1_STATE,
} from './state';

/**
 * An **independent validator**, written from the notation rules rather than
 * from this package's parser, and sharing no code with it.
 *
 * A Square-1 scramble is a sequence of layer-turn pairs, each followed by a
 * slice: `(x, y) / (x, y) / …`. The numbers count 30° units, so they live in
 * `Z12`, and `(0, 0)` turns nothing. Anything else — a stray token, an
 * unbalanced parenthesis, a value out of range — is a malformed scramble.
 */
function validateWithFreshRules(scramble: string): {
  readonly pairs: number[][];
  readonly slices: number;
  readonly tokens: number;
} {
  const pairs: number[][] = [];
  let slices = 0;
  let tokens = 0;

  const words = scramble.trim().split(/\s+/).filter((word) => word.length > 0);
  let index = 0;
  while (index < words.length) {
    const word = words[index]!;
    if (word === '/') {
      slices += 1;
      tokens += 1;
      index += 1;
      continue;
    }
    // A pair is written "(x," then "y)" once split on whitespace.
    const opening = /^\((-?\d+),$/.exec(word);
    const closing = index + 1 < words.length ? /^(-?\d+)\)$/.exec(words[index + 1]!) : null;
    if (!opening || !closing) {
      throw new Error(`independent validator: unexpected "${word}"`);
    }
    const top = Number(opening[1]);
    const bottom = Number(closing[1]);
    if (!Number.isInteger(top) || !Number.isInteger(bottom)) {
      throw new Error(`independent validator: non-integer amount in "${word}"`);
    }
    if (top <= -6 || top > 6 || bottom <= -6 || bottom > 6) {
      throw new Error(`independent validator: amount out of range in "${word}"`);
    }
    if (top === 0 && bottom === 0) {
      throw new Error('independent validator: (0, 0) turns nothing');
    }
    pairs.push([top, bottom]);
    tokens += 1;
    index += 2;
  }

  return { pairs, slices, tokens };
}

describe('the independent validator', () => {
  it('accepts a real official scramble and rejects malformed ones', () => {
    const official =
      '(-2, 0) / (-3, -3) / (2, 5) / (0, 3) / (-3, 0) / (-5, -2) / (-4, 0) / (-3, 3) / (3, 0) / (1, 2) / (0, 2) / (6, 0) /';
    const parsed = validateWithFreshRules(official);
    expect(parsed.pairs).toHaveLength(12);
    expect(parsed.slices).toBe(12);

    for (const bad of ['(1, 0) x', '(0, 0) /', '(7, 0) /', '(1, 0', '1, 0 /']) {
      expect(() => validateWithFreshRules(bad), bad).toThrow();
    }
  });
});

describe('generated scrambles', () => {
  const random = createRandomSource('square-1 scrambles');
  const scrambles = Array.from({ length: 12 }, () => generateSquare1Scramble(random));

  it('satisfy rules rewritten from the notation, not from the parser', () => {
    for (const scramble of scrambles) {
      const parsed = validateWithFreshRules(scramble);
      expect(parsed.pairs.length).toBeGreaterThan(0);
      // Turns and slices alternate, so the counts can differ by at most one.
      expect(Math.abs(parsed.pairs.length - parsed.slices)).toBeLessThanOrEqual(1);
      expect(parsed.tokens).toBe(parsed.pairs.length + parsed.slices);
    }
  });

  /**
   * The gate the whole package is judged on: apply the scramble to a solved
   * puzzle and it must produce a real, unsolved, still-twistable state.
   */
  it('apply to a solved puzzle without jamming, and leave it scrambled', () => {
    for (const scramble of scrambles) {
      const state = applySquare1Moves(SOLVED_SQUARE1_STATE, parseSquare1Scramble(scramble));
      expect(isWellFormedSquare1State(state)).toBe(true);
      expect(isSquare1Solved(state)).toBe(false);
      // Regulation 4b3d, second clause: a `/` must be applicable straight away.
      expect(isSliceLegal(state)).toBe(true);
    }
  });

  /** Regulation 4b3d, first clause — verified on the scramble, not on the draw. */
  it('leave the puzzle at least eleven moves from solved', () => {
    for (const scramble of scrambles) {
      const state = applySquare1Moves(SOLVED_SQUARE1_STATE, parseSquare1Scramble(scramble));
      const capped = square1DistanceCappedAt(state, MIN_SQUARE1_SOLVE_DISTANCE - 1);
      expect(capped).toBe(MIN_SQUARE1_SOLVE_DISTANCE);
    }
  });

  it('are not all the same, and each is a different state', () => {
    expect(new Set(scrambles).size).toBe(scrambles.length);
    const states = scrambles.map((scramble) =>
      applySquare1Moves(SOLVED_SQUARE1_STATE, parseSquare1Scramble(scramble)).slots.join(','),
    );
    expect(new Set(states).size).toBe(scrambles.length);
  });

  it('are reproducible from a seed, and differ between seeds', () => {
    const first = generateSquare1Scramble(createRandomSource('seed-a'));
    const again = generateSquare1Scramble(createRandomSource('seed-a'));
    const other = generateSquare1Scramble(createRandomSource('seed-b'));
    expect(again).toBe(first);
    expect(other).not.toBe(first);
  });
});

describe('the registered event', () => {
  it('produces a Square-1 scramble through the public entry point', async () => {
    await import('../../index');
    const result = await generateScramble('sq1', { seed: 'public-api' });
    expect(result.event).toBe('sq1');
    expect(result.quality).toBe('random-state');
    const parsed = validateWithFreshRules(result.moves);
    expect(parsed.pairs.length).toBeGreaterThan(5);
    expect(
      isSquare1Solved(applySquare1Moves(SOLVED_SQUARE1_STATE, parseSquare1Scramble(result.moves))),
    ).toBe(false);
  });
});
