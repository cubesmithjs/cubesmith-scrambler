import { describe, expect, it } from 'vitest';
// Imported for its registration side effects: the registry is populated by the
// package entry point, not by the core module.
import { generateScramble } from '../../index';
import { NON_CUBE_EVENTS } from '../../core/event-notation';
import { implementedEvents } from '../../core/scrambler-registry';
import { CFOP_CORPUS } from './cfop-corpus';
import { collectMoves } from './equality';
import { invertAlgorithm } from './invert';
import { parseAlgorithm } from './parse';
import { serializeAlgorithm } from './serialize';
import { AlgorithmSyntaxError } from './types';

/**
 * The two corpora that make this parser worth having, as opposed to one that
 * merely satisfies its own tests.
 *
 * A grammar tested only against strings written while writing the grammar will
 * pass. These two were not: one is what the package itself prints, the other is
 * a library from another repository that a different parser already validates.
 */

/**
 * The events whose *cube* notation this parser is meant to read. The other six
 * are deliberately excluded: Megaminx's Pochmann tokens, Clock's pin/hour
 * syntax, Pyraminx's, Skewb's and the FTO's order-3 turns and Square-1's
 * `(a,b)/` are different notations that happen to be written with letters, and folding them
 * into this AST would be actively wrong — a Pyraminx `2` means
 * *counterclockwise*, not a half turn.
 *
 * The five used to be a literal here. Since v0.12 `validateScramble` needs the
 * same split to dispatch on, so it lives in `core/event-notation.ts` and both
 * import it — a second copy is the drift this package designs against. Every
 * assertion below is unchanged.
 */
const CUBE_EVENTS = [...implementedEvents()].filter((event) => !NON_CUBE_EVENTS.has(event));

describe('the package can read its own output', () => {
  /**
   * The coherence gap this layer exists to close, and all three operations on
   * the same generated scramble.
   *
   * Before it, `parseMove` accepted `/^([UDFBLR])(2|')?$/` while
   * `generateScramble` emitted `Rw2`, `3Rw` and `x2 y'` — the package printed
   * notation it could not read. The load-bearing cases are named rather than
   * left implicit: `333bf`/`555bf` for wide-move suffixes, `555`/`666`/`777`
   * for `3Rw`, and `444bf` for the whole-cube rotations task 05 added.
   *
   * Parse, serialize and invert are checked together here rather than split
   * across three test files on purpose. Generating a `333` scramble builds the
   * pruning tables, and Vitest isolates by file, so three files asking for one
   * would build them three times — under `--coverage` that was enough to blow
   * the 180 s timeout. One file pays the cost; the other two stay pure unit
   * tests.
   */
  it.each(CUBE_EVENTS)('parses, re-serializes and inverts a generated %s scramble', async (event) => {
    const result = await generateScramble(event, { seed: `parse-${event}` });
    const parsed = parseAlgorithm(result.moves);

    expect(parsed.nodes.length).toBeGreaterThan(0);
    // Every node is a plain move: a scramble has no groups or brackets in it.
    expect(collectMoves(parsed)).toHaveLength(parsed.nodes.length);
    // And no move was silently dropped.
    expect(parsed.nodes).toHaveLength(result.moves.split(' ').length);

    // The package's own output is already canonical, so it must come back
    // untouched — a stricter check than comparing trees.
    expect(serializeAlgorithm(parsed)).toBe(result.moves);

    const inverted = serializeAlgorithm(invertAlgorithm(parsed));
    expect(() => parseAlgorithm(inverted)).not.toThrow();
    expect(serializeAlgorithm(invertAlgorithm(parseAlgorithm(inverted)))).toBe(result.moves);
  });

  it('parses the multi-blind set, every cube of it', async () => {
    const result = await generateScramble('333mbf', { count: 3, seed: 'parse-mbf' });
    for (const scramble of result.scrambles!) {
      expect(parseAlgorithm(scramble).nodes.length).toBeGreaterThan(0);
    }
  });

  /**
   * Totality over the package's own output, across many seeds rather than one.
   * Restricted to the events with no pruning table, because the point is
   * coverage of the *notation* and a few hundred 3x3x3 solves would cost
   * minutes for no extra notation.
   */
  it('is total over hundreds of generated scrambles', async () => {
    for (const event of ['555', '666', '777'] as const) {
      for (let seed = 0; seed < 100; seed += 1) {
        const result = await generateScramble(event, { seed: `total-${event}-${seed}` });
        expect(() => parseAlgorithm(result.moves), `${event} ${seed}`).not.toThrow();
      }
    }
  });

  it('refuses the bespoke notations it can tell apart rather than mis-reading them', async () => {
    // Three of the six, not all of them: a Pyraminx, Skewb or FTO scramble is
    // made of capital letters and primes, which cube notation reads as cube
    // turns (`BR` as `B R`). That is why `validateScramble` dispatches on the
    // event rather than guessing the grammar from the text.
    // Not a limitation to apologise for — it is the design. A parser that
    // quietly accepted `R++` or `(3,-2)/` would be claiming they mean
    // something in this grammar, and they do not.
    for (const event of ['minx', 'clock', 'sq1'] as const) {
      const result = await generateScramble(event, { seed: `foreign-${event}` });
      expect(() => parseAlgorithm(result.moves), event).toThrow(AlgorithmSyntaxError);
    }
  });
});

describe('the CFOP corpus from cube-manager-frontend', () => {
  it('has the shape it was copied with', () => {
    expect(CFOP_CORPUS.length).toBe(122);
    expect(new Set(CFOP_CORPUS).size).toBe(CFOP_CORPUS.length);
  });

  it('parses every algorithm', () => {
    for (const algorithm of CFOP_CORPUS) {
      expect(() => parseAlgorithm(algorithm), algorithm).not.toThrow();
    }
  });

  it('reads every token, dropping none', () => {
    // A parser that silently skipped what it did not understand would pass the
    // test above. This one counts.
    for (const algorithm of CFOP_CORPUS) {
      const parsed = parseAlgorithm(algorithm);
      expect(parsed.nodes, algorithm).toHaveLength(algorithm.split(/\s+/).length);
    }
  });

  it('covers the spellings a hand-rolled grammar gets wrong', () => {
    // Stated as a property of the corpus, so that a future trim of it fails
    // here rather than quietly weakening the test above.
    const all = CFOP_CORPUS.join(' ');
    expect(all).toMatch(/\br'?\d?\b/); // lowercase wide
    expect(all).toMatch(/\bl'/); // lowercase wide, inverted
    expect(all).toMatch(/\bM'/); // slice
    expect(all).toMatch(/\bx'/); // rotation
    expect(all).toMatch(/\by'/);
  });
});
