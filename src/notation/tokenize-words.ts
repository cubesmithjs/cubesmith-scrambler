/**
 * A whitespace splitter that **keeps positions**.
 *
 * `text.split(/\s+/)` throws them away, which is why the three token-based
 * bespoke notations — Megaminx, Pyraminx, Skewb — could not report an offset:
 * their parsers are per-token functions that never see the whole string, so the
 * position has to come from whoever split it. Clock's parser split the same way
 * and had the same gap.
 *
 * It lives here rather than in each puzzle module because all four want exactly
 * this and would otherwise each grow their own off-by-one.
 */

export interface WordToken {
  /** The word itself, with no surrounding whitespace. Never empty. */
  readonly text: string;
  /** Where its first character sits in the original string. */
  readonly offset: number;
}

/**
 * Splits on runs of whitespace, returning each word with its offset.
 *
 * Spaces, tabs and newlines are one separator, matching what the cube
 * tokenizer skips — a multi-line scramble is one scramble. Leading and
 * trailing whitespace produce no empty words and, more importantly, do not
 * shift an offset: `tokenizeWords(' R')[0].offset` is `1`, not `0`.
 */
export function tokenizeWords(input: string): WordToken[] {
  const words: WordToken[] = [];
  let i = 0;

  while (i < input.length) {
    if (/\s/.test(input[i]!)) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < input.length && !/\s/.test(input[i]!)) i += 1;
    words.push({ text: input.slice(start, i), offset: start });
  }

  return words;
}
