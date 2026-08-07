import { describe, expect, it } from 'vitest';
import { CFOP_CORPUS } from './cfop-corpus';
import { algorithmsEqual } from './equality';
import { parseAlgorithm } from './parse';
import { serializeAlgorithm } from './serialize';

const round = (s: string): string => serializeAlgorithm(parseAlgorithm(s));

describe('serializeAlgorithm — exact round trips', () => {
  it('returns canonical notation unchanged, character for character', () => {
    for (const input of [
      "R U R' U2 F2",
      "Rw Rw2 Rw'",
      "3Rw 4Lw2 2-3Rw'",
      "M E' S2",
      "x y2 z'",
      'R3 R4',
      "R2'",
      '(R U)',
      '(R U)2',
      "(R U)'",
      "(R U)2'",
      '[R, U]',
      '[R: U]',
      '[R, U]2',
      "[R: (U R U')2]",
      '[[R, U], D]',
      'R . U',
      '[(R U): [M, E]]',
    ]) {
      expect(round(input), input).toBe(input);
    }
  });
});

describe('serializeAlgorithm — the documented normalizations', () => {
  /** Each is behaviour, not formatting, so each is pinned rather than left to be discovered. */
  it('resolves a lowercase family to its "w" spelling', () => {
    expect(round('r')).toBe('Rw');
    expect(round("l'")).toBe("Lw'");
    expect(round('r2')).toBe('Rw2');
    expect(round('3r')).toBe('3Rw');
  });

  it('drops a redundant "2" prefix, matching what official scrambles print', () => {
    expect(round('2Rw')).toBe('Rw');
  });

  it('drops an explicit amount of 1, on moves and on repetitions alike', () => {
    expect(round('R1')).toBe('R');
    expect(round('(R U)1')).toBe('(R U)');
    expect(round('[R, U]1')).toBe('[R, U]');
  });

  it('collapses whitespace and newlines to single spaces', () => {
    expect(round('R   U')).toBe('R U');
    expect(round('R\n\tU')).toBe('R U');
    expect(round("RU'")).toBe("R U'");
  });

  it('discards comments — the one lossy case', () => {
    expect(round('R U // sexy\nF')).toBe('R U F');
  });

  it('is idempotent, which is what makes that list complete rather than hopeful', () => {
    const inputs = [...CFOP_CORPUS, '2Rw R1 (R U)1 // note', "3r l' M x", "[R: (U r U')2]"];
    for (const input of inputs) {
      const once = round(input);
      expect(round(once), input).toBe(once);
    }
  });
});

describe('serializeAlgorithm — against the corpora', () => {
  it('round-trips every CFOP algorithm through a stable tree', () => {
    for (const algorithm of CFOP_CORPUS) {
      expect(
        algorithmsEqual(parseAlgorithm(algorithm), parseAlgorithm(round(algorithm))),
        algorithm,
      ).toBe(true);
    }
  });
});
