import { describe, expect, it } from 'vitest';
import { generateScrambles } from '../../index';
import { parseMove, type FaceMove } from '../../notation/move';
import { isRedundantAfter } from './redundancy';

const moves = (text: string): FaceMove[] => (text ? text.split(' ').map(parseMove) : []);

describe('isRedundantAfter', () => {
  it('refuses the same face twice in a row, whatever the amounts', () => {
    for (const [before, next] of [
      ['U', "U'"],
      ['U', 'U2'],
      ['R2', "R'"],
    ]) {
      expect(isRedundantAfter(moves(before!), [], parseMove(next!))).toBe(true);
    }
  });

  it('refuses a face repeated through its opposite face, since the two commute', () => {
    expect(isRedundantAfter(moves('R L'), [], parseMove("R'"))).toBe(true);
    expect(isRedundantAfter(moves('U2 D'), [], parseMove('U'))).toBe(true);
  });

  it('allows the opposite face, and anything after a different axis', () => {
    expect(isRedundantAfter(moves('R'), [], parseMove('L'))).toBe(false);
    expect(isRedundantAfter(moves('R U'), [], parseMove('R'))).toBe(false);
    expect(isRedundantAfter([], [], parseMove('R'))).toBe(false);
  });

  it('🔴 reads the context before the path: the join between the two search phases', () => {
    // Phase 1 ended with R2; phase 2 may not open with any R.
    expect(isRedundantAfter([], moves('F R2'), parseMove("R'"))).toBe(true);
    // ...nor with L and then R, which slides back next to phase 1's R2.
    expect(isRedundantAfter(moves('L'), moves('F R2'), parseMove('R'))).toBe(true);
    // A different axis in between ends the run.
    expect(isRedundantAfter(moves('U'), moves('F R2'), parseMove('R'))).toBe(false);
  });
});

describe('the 3x3x3 family prints no redundant move', () => {
  // Before 2026-10-21 about one 333 scramble in ten carried `R2 R'` where the
  // two phases met, and about one in a hundred carried `R2 L2 R'`.
  const redundant = (scramble: string): string | undefined => {
    const all = moves(scramble);
    for (let i = 1; i < all.length; i += 1) {
      if (isRedundantAfter(all.slice(0, i), [], all[i]!)) return all.slice(Math.max(0, i - 2), i + 1).map(String).join();
    }
    return undefined;
  };

  it.each(['333', '333oh', '333fm'] as const)('%s', async (event) => {
    const count = event === '333' ? 60 : 20;
    for (const { moves: text } of await generateScrambles(event, count, { seed: `no-seam-${event}` })) {
      expect(redundant(text), text).toBeUndefined();
    }
  });
});
