import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { moveAxis, moveLayerSet, wideMoveToString, type WideMove } from './notation';
import { isRedundantMove, randomMoveSequence } from './random-moves';

const R: WideMove = { face: 'R', depth: 1, amount: 1 };
const RPRIME: WideMove = { face: 'R', depth: 1, amount: 3 };
const RW: WideMove = { face: 'R', depth: 2, amount: 1 };
const L: WideMove = { face: 'L', depth: 1, amount: 1 };
const U: WideMove = { face: 'U', depth: 1, amount: 1 };

describe('isRedundantMove', () => {
  it('nothing is redundant at the start', () => {
    expect(isRedundantMove([], R)).toBe(false);
  });

  it('the same layer set twice in a row is redundant — R R and R R\' both merge', () => {
    expect(isRedundantMove([R], R)).toBe(true);
    expect(isRedundantMove([R], RPRIME)).toBe(true);
    expect(isRedundantMove([R], { face: 'R', depth: 1, amount: 2 })).toBe(true);
  });

  /**
   * The part that makes this stronger than "don't repeat the previous move".
   * Same-axis moves commute, so in `R Rw R'` the two R moves can be brought
   * together and merged — the sequence is just as redundant as `R R'`, and a
   * scrambler that only checked the immediately preceding move would emit it.
   */
  it('the same layer set anywhere in a same-axis run is redundant', () => {
    expect(isRedundantMove([R, RW], RPRIME)).toBe(true);
    expect(isRedundantMove([R, RW, L], RPRIME)).toBe(true);
    expect(isRedundantMove([RW, L, R], RW)).toBe(true);
  });

  it('but a different layer set on the same axis is fine — R L R\' is a real sequence', () => {
    expect(isRedundantMove([R], RW)).toBe(false);
    expect(isRedundantMove([R], L)).toBe(false);
    expect(isRedundantMove([R, L], RW)).toBe(false);
  });

  it('a move on a different axis ends the run, so an earlier repeat is allowed again', () => {
    // R U R' is a perfectly good sequence: U breaks the x-axis run, so the
    // two R moves can no longer be brought together.
    expect(isRedundantMove([R, U], RPRIME)).toBe(false);
    expect(isRedundantMove([R, RW, U], R)).toBe(false);
  });

  it('is symmetric in the two faces of an axis', () => {
    expect(isRedundantMove([L], { face: 'L', depth: 1, amount: 2 })).toBe(true);
    expect(isRedundantMove([L, R], { face: 'L', depth: 1, amount: 2 })).toBe(true);
  });
});

describe('randomMoveSequence', () => {
  const sizes = [4, 5, 6, 7] as const;

  it('produces exactly the requested number of moves', () => {
    for (const size of sizes) {
      const random = createRandomSource(`nxn-count-${size}`);
      for (const count of [1, 5, 40, 100]) {
        expect(randomMoveSequence(random, size, count)).toHaveLength(count);
      }
    }
  });

  it('contains no redundant move anywhere', () => {
    for (const size of sizes) {
      const random = createRandomSource(`nxn-no-redundancy-${size}`);
      for (let trial = 0; trial < 50; trial += 1) {
        const moves = randomMoveSequence(random, size, 100);
        for (let i = 0; i < moves.length; i += 1) {
          expect(isRedundantMove(moves.slice(0, i), moves[i]!)).toBe(false);
        }
      }
    }
  });

  it('never repeats a layer set consecutively, and never has a 3-move same-axis repeat', () => {
    const random = createRandomSource('nxn-explicit-checks');
    for (let trial = 0; trial < 50; trial += 1) {
      const moves = randomMoveSequence(random, 7, 100);
      for (let i = 1; i < moves.length; i += 1) {
        expect(moveLayerSet(moves[i]!)).not.toBe(moveLayerSet(moves[i - 1]!));
      }
      for (let i = 2; i < moves.length; i += 1) {
        const sameAxis =
          moveAxis(moves[i]!) === moveAxis(moves[i - 1]!) &&
          moveAxis(moves[i]!) === moveAxis(moves[i - 2]!);
        if (sameAxis) {
          expect(moveLayerSet(moves[i]!)).not.toBe(moveLayerSet(moves[i - 2]!));
        }
      }
    }
  });

  it('uses every available move across a long sample', () => {
    for (const size of sizes) {
      const random = createRandomSource(`nxn-coverage-${size}`);
      const seen = new Set<string>();
      for (let trial = 0; trial < 40; trial += 1) {
        for (const move of randomMoveSequence(random, size, 100)) {
          seen.add(wideMoveToString(move));
        }
      }
      expect(seen.size).toBe(6 * Math.floor(size / 2) * 3);
    }
  });

  it('spreads the moves roughly evenly rather than favouring any of them', () => {
    const random = createRandomSource('nxn-uniformity');
    const counts = new Map<string, number>();
    const TOTAL = 200 * 100;
    for (let trial = 0; trial < 200; trial += 1) {
      for (const move of randomMoveSequence(random, 7, 100)) {
        const key = wideMoveToString(move);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    // Not expected to be *exactly* uniform: each step draws uniformly among
    // the moves that are legal right then, and which moves are excluded
    // depends on the history — so a move's marginal share dips slightly with
    // how often it gets ruled out. The tolerance is ~3 standard deviations of
    // ordinary sampling noise, wide enough not to flake and tight enough that
    // a genuinely favoured or starved move would show.
    const expected = TOTAL / 54;
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.85);
      expect(count).toBeLessThan(expected * 1.15);
    }
  });

  it('is deterministic given a seed', () => {
    const a = randomMoveSequence(createRandomSource('same'), 5, 60);
    const b = randomMoveSequence(createRandomSource('same'), 5, 60);
    expect(a).toEqual(b);
  });
});
