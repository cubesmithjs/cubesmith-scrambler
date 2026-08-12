import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { mergeWideMoves } from './cancel';
import {
  allMovesForSize,
  parseWideMove,
  wideMovesToString,
  type WideMove,
} from './notation';
import { isRedundantMove, randomMoveSequence } from './random-moves';
import { applyWideMoves, solvedCubeNxN, type CubeNxNState } from './state';

const parse = (text: string): WideMove[] =>
  text.trim().length === 0 ? [] : text.trim().split(/\s+/).map(parseWideMove);

const merge = (text: string): string => wideMovesToString(mergeWideMoves(parse(text)));

/** Two sequences land the same cube in the same place. */
function sameState(size: number, a: readonly WideMove[], b: readonly WideMove[]): boolean {
  const key = (state: CubeNxNState): string => state.occupant.join(',');
  return (
    key(applyWideMoves(solvedCubeNxN(size), a)) === key(applyWideMoves(solvedCubeNxN(size), b))
  );
}

describe('mergeWideMoves', () => {
  it('composes two turns of one layer set', () => {
    expect(merge('R R')).toBe('R2');
    expect(merge("R2 R'")).toBe('R');
    expect(merge("R' R'")).toBe('R2');
    expect(merge('R2 R2')).toBe('');
    expect(merge("R R'")).toBe('');
  });

  it('reaches across a commuting run, which is why the rule is not "same face"', () => {
    // R and L are the same axis and commute, so the two R turns can be brought
    // together — `R L R'` collapses to `L`.
    expect(merge("R L R'")).toBe('L');
    // A wide move is a *different* layer set on the same axis, so it neither
    // merges nor blocks: `R Rw R'` collapses the same way.
    expect(merge("R Rw R'")).toBe('Rw');
    // …and both of those stay put once there is nothing to merge with.
    expect(merge('R L')).toBe('R L');
    expect(merge('R Rw')).toBe('R Rw');
  });

  it('stops at the end of a run, so a move on another axis blocks the merge', () => {
    expect(merge("R U R'")).toBe("R U R'");
    expect(merge("R U U' R'")).toBe('');
  });

  it('cascades: a cancellation can expose a merge that was not adjacent before', () => {
    // U and U' cancel, which brings the two R turns into one run.
    expect(merge("R U U' R")).toBe('R2');
    // Three deep.
    expect(merge("Rw R U U' R' Rw")).toBe('Rw2');
  });

  it('leaves an already-canonical sequence untouched', () => {
    const random = createRandomSource('cancel-canonical');
    for (const size of [3, 4, 5]) {
      for (let trial = 0; trial < 40; trial += 1) {
        const sequence = randomMoveSequence(random, size, 30);
        expect(mergeWideMoves(sequence)).toEqual(sequence);
      }
    }
  });

  /**
   * 🔴 The property that lets a random-state solver use this at all: merging is
   * a set of identity rewrites, so the sequence lands in exactly the same place.
   * Checked on a real facelet model rather than argued.
   */
  it('never changes where the sequence lands, over random redundant input', () => {
    const random = createRandomSource('cancel-preserves-state');
    for (const size of [3, 4, 5]) {
      const available = allMovesForSize(size);
      for (let trial = 0; trial < 60; trial += 1) {
        // Deliberately *unfiltered*, so redundancy is common — this is what a
        // staged solver's concatenated output looks like.
        const raw = Array.from(
          { length: 40 },
          () => available[randomInt(random, available.length)]!,
        );
        const merged = mergeWideMoves(raw);
        expect(merged.length).toBeLessThanOrEqual(raw.length);
        expect(sameState(size, raw, merged), wideMovesToString(raw)).toBe(true);
      }
    }
  });

  it('leaves nothing `isRedundantMove` would have refused to emit', () => {
    const random = createRandomSource('cancel-no-redundancy-left');
    for (const size of [3, 4, 5]) {
      const available = allMovesForSize(size);
      for (let trial = 0; trial < 60; trial += 1) {
        const raw = Array.from(
          { length: 40 },
          () => available[randomInt(random, available.length)]!,
        );
        const merged = mergeWideMoves(raw);
        for (let index = 0; index < merged.length; index += 1) {
          expect(isRedundantMove(merged.slice(0, index), merged[index]!)).toBe(false);
        }
      }
    }
  });

  it('handles the empty sequence and the single move', () => {
    expect(mergeWideMoves([])).toEqual([]);
    expect(merge('R')).toBe('R');
  });
});
