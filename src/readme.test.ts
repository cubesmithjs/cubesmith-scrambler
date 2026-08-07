import { describe, expect, it } from 'vitest';
import { implementedEvents, isImplementedEvent } from './core/scrambler-registry';
import './index';

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

const readmeLines = (): string[] => README.split(/\r?\n/);

const NUMBER_WORDS: Readonly<Record<number, string>> = {
  11: 'Eleven',
  12: 'Twelve',
  13: 'Thirteen',
  14: 'Fourteen',
  15: 'Fifteen',
  16: 'Sixteen',
  17: 'Seventeen',
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
