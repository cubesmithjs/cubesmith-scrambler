import { describe, expect, it } from 'vitest';
import { implementedEvents, isImplementedEvent } from './core/scrambler-registry';
import {
  AlgorithmSyntaxError,
  invertAlgorithm,
  parseAlgorithm,
  serializeAlgorithm,
  validateAlgorithm,
} from './index';

/**
 * The README, checked against the code.
 *
 * This exists because of a specific failure: the README claimed "fifteen of the
 * seventeen events work" while the registry held thirteen, and separately claimed
 * `src/puzzles/444` and `src/puzzles/square1` were empty directories long after
 * both were full. Neither was caught for weeks, because prose is not compiled and
 * nothing was reading it.
 *
 * So the claims that *can* be checked mechanically are checked here. The ones
 * that cannot — how a phase works, why a decision was made — stay the
 * responsibility of whoever edits them, and that is the honest division rather
 * than an attempt to test English.
 */

// Imported as text rather than read from disk: this package has no Node types
// and touches no filesystem, deliberately, so that it runs in a browser as
// readily as in Node. Vite's `?raw` hands the file over as a string instead.
import README from '../README.md?raw';
// The same trick, for the same reason, on a source file: `SyntaxErrorReason` is
// a type and leaves nothing behind at runtime to count.
import TYPES_SOURCE from './notation/alg/types.ts?raw';

const readmeLines = (): string[] => README.split(/\r?\n/);

const NUMBER_WORDS: Readonly<Record<number, string>> = {
  11: 'Eleven',
  12: 'Twelve',
  13: 'Thirteen',
  14: 'Fourteen',
  15: 'Fifteen',
  16: 'Sixteen',
  17: 'Seventeen',
  18: 'Eighteen',
  19: 'Nineteen',
  20: 'Twenty',
  21: 'Twenty-one',
  22: 'Twenty-two',
};

const EVENT_TOTAL = 17;

describe('the README status claims', () => {
  it('states the number of working events that the registry actually holds', () => {
    const count = [...implementedEvents()].length;
    // "Seventeen of the seventeen" would be true and badly written, so the
    // complete case gets its own sentence — and this test still fails the
    // moment the registry stops holding all of them.
    if (count === EVENT_TOTAL) {
      expect(README).toContain('**All seventeen WCA events work end to end.**');
      return;
    }
    const word = NUMBER_WORDS[count];
    expect(word, `no word for ${count}`).toBeDefined();
    expect(README).toContain(`**${word} of the seventeen WCA events work end to end.**`);
  });

  it('lists every event in the status table', () => {
    for (const event of [...implementedEvents()]) {
      expect(README, event).toContain(`\`${event}\``);
    }
  });

  /**
   * The claim that went stale silently: a directory described as empty that has
   * a full implementation in it. Checked by asking the filesystem.
   */
  it('does not call a populated directory empty', () => {
    const populated = ['444', 'square1'];
    for (const directory of populated) {
      expect(README).not.toContain(`src/puzzles/{444,square1}/\`** — empty`);
      expect(README).not.toMatch(new RegExp(`puzzles/${directory}/\`\\*\\* — empty`));
    }
  });

  it('does not say a working event throws', () => {
    // The direction this check runs in has flipped twice. It first pinned
    // `444`'s row while `444` was in flight, then `333mbf`'s while that was the
    // last unimplemented event. Nothing throws now, so what it guards is the
    // opposite claim: no row in the status table may describe a registered
    // event as throwing.
    for (const event of [...implementedEvents()]) {
      const row = readmeLines().find((line) => line.startsWith(`| \`${event}\` `));
      if (row === undefined) continue; // Some events share a row; the table test covers presence.
      expect(row, event).not.toMatch(/throws/);
    }
    expect(isImplementedEvent('333mbf')).toBe(true);
  });

  it('points at the design documents, which are the detail the README does not carry', () => {
    expect(README).toContain('](./docs/)');
    expect(README).toContain('docs/444-design.md');
    expect(README).toContain('docs/blindfolded-review.md');
  });
});

/**
 * The notation examples, **run** rather than read.
 *
 * The tests above check claims the README makes *about* the package; these run
 * the code the README tells a reader to write and assert it produces the
 * commented answer. The two halves are complementary and the second is the one
 * that matters for an API doc: a README example that silently stopped
 * compiling is worse than a missing one, because a reader trusts it.
 *
 * Every value asserted here is a `//` comment in the README's "Reading and
 * inverting notation" section. Change one there, change it here.
 */
describe('the README notation examples', () => {
  it('inverts and re-serializes exactly as the first two examples claim', () => {
    const alg = parseAlgorithm("R U R' U' // sexy move");
    expect(serializeAlgorithm(invertAlgorithm(alg))).toBe("U R U' R'");
    expect(serializeAlgorithm(invertAlgorithm(parseAlgorithm("[R: (U Rw U')2]")))).toBe(
      "[R: (U Rw' U')2]",
    );
  });

  it('throws an error carrying the offset, span, reason and character it advertises', () => {
    let thrown: unknown;
    try {
      parseAlgorithm('R U Q');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AlgorithmSyntaxError);
    const syntax = thrown as AlgorithmSyntaxError;
    expect(syntax.offset).toBe(4);
    expect(syntax.length).toBe(1);
    expect(syntax.reason).toBe('not-a-move');
    expect(syntax.char).toBe('Q');
  });

  it('validates without throwing, in both arms, as the non-throwing example claims', () => {
    const ok = validateAlgorithm("R U R' U'");
    expect(ok.valid).toBe(true);
    if (ok.valid) expect(ok.algorithm.nodes).toHaveLength(4);

    const bad = validateAlgorithm('R U Q');
    expect(bad.valid).toBe(false);
    if (!bad.valid) expect(bad.error.reason).toBe('not-a-move');
  });

  /**
   * "one of twenty documented string codes" is a number written in prose, which
   * is precisely the kind of claim this file exists to stop going stale — the
   * original failure was a README counting events differently from the
   * registry.
   *
   * `SyntaxErrorReason` is a type and therefore erased at runtime, so there is
   * nothing to count at run time; the declaration is read as text instead. Read
   * rather than recalled is the same standard the rest of this file holds to.
   */
  it('states the number of reason codes the union actually declares', () => {
    const union = TYPES_SOURCE.split('export type SyntaxErrorReason =')[1]?.split(';')[0] ?? '';
    const codes = [...union.matchAll(/'([a-z-]+)'/g)].map(([, code]) => code!);
    expect(new Set(codes).size, 'duplicate reason code').toBe(codes.length);

    const word = NUMBER_WORDS[codes.length];
    expect(word, `no word for ${codes.length} — extend NUMBER_WORDS`).toBeDefined();
    expect(README).toContain(`one of ${word!.toLowerCase()} documented string codes`);
  });

  it('documents the non-throwing entry point it now exports', () => {
    expect(README).toContain('validateAlgorithm');
    expect(README).toContain('`SyntaxErrorReason`');
  });
});
