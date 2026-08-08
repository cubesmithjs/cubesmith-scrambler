import { describe, expect, it } from 'vitest';
import { tokenizeWords } from './tokenize-words';

describe('tokenizeWords', () => {
  it('returns each word with the offset it starts at', () => {
    expect(tokenizeWords('R++ D-- U')).toEqual([
      { text: 'R++', offset: 0 },
      { text: 'D--', offset: 4 },
      { text: 'U', offset: 8 },
    ]);
  });

  /**
   * The classic off-by-one this function exists to get right: a splitter that
   * counted words rather than characters would report `0` here, and every
   * caret a consumer draws would sit one character to the left.
   */
  it('does not let leading whitespace shift an offset', () => {
    expect(tokenizeWords(' R')).toEqual([{ text: 'R', offset: 1 }]);
    expect(tokenizeWords('   U L')).toEqual([
      { text: 'U', offset: 3 },
      { text: 'L', offset: 5 },
    ]);
  });

  it('treats a run of separators as one, whatever the mixture', () => {
    expect(tokenizeWords('U   L')).toEqual([
      { text: 'U', offset: 0 },
      { text: 'L', offset: 4 },
    ]);
    expect(tokenizeWords('U\tL')).toEqual([
      { text: 'U', offset: 0 },
      { text: 'L', offset: 2 },
    ]);
    expect(tokenizeWords('U\nL')).toEqual([
      { text: 'U', offset: 0 },
      { text: 'L', offset: 2 },
    ]);
    expect(tokenizeWords('U \t\n L')).toEqual([
      { text: 'U', offset: 0 },
      { text: 'L', offset: 5 },
    ]);
  });

  it('ignores trailing whitespace rather than emitting an empty word', () => {
    expect(tokenizeWords('U  ')).toEqual([{ text: 'U', offset: 0 }]);
    expect(tokenizeWords(' U ')).toEqual([{ text: 'U', offset: 1 }]);
  });

  it('returns nothing for an empty or all-whitespace string', () => {
    expect(tokenizeWords('')).toEqual([]);
    expect(tokenizeWords('   ')).toEqual([]);
    expect(tokenizeWords('\n\t ')).toEqual([]);
  });

  it('never returns an empty word, and every offset indexes back to its own text', () => {
    const input = '  UR4+ \t DR3-\ny2  ALL2+ ';
    for (const word of tokenizeWords(input)) {
      expect(word.text.length).toBeGreaterThan(0);
      expect(input.slice(word.offset, word.offset + word.text.length)).toBe(word.text);
    }
  });
});
