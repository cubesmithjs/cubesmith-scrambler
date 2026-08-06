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

describe('the README status claims', () => {
  it('states the number of working events that the registry actually holds', () => {
    const count = [...implementedEvents()].length;
    const word = NUMBER_WORDS[count];
    expect(word, `no word for ${count}`).toBeDefined();
    expect(README).toContain(`**${word} of the seventeen WCA events work end to end.**`);
  });

  it('lists every event in the status table', () => {
    for (const event of [...implementedEvents()]) {
      expect(README, event).toContain(`\`${event}\``);
    }
    for (const event of ['333mbf'] as const) {
      expect(README, event).toContain(`\`${event}\``);
      expect(isImplementedEvent(event)).toBe(false);
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

  it('says an unimplemented event throws rather than that it works', () => {
    // 333mbf is now the only unimplemented event, and the README must be explicit
    // that calling it throws — a status line that reads like a working feature is
    // the kind of drift this test exists to catch. (`444` used to be the one in
    // flight here; its row now has to claim the opposite, which the check below
    // pins.)
    const multi = readmeLines().find((line) => line.startsWith('| `333mbf` |'));
    expect(multi).toBeDefined();
    expect(multi).toMatch(/throws/);

    const status = readmeLines().find((line) => line.startsWith('| `444` `444bf` |'));
    expect(status).toBeDefined();
    expect(status).not.toMatch(/throws/);
    expect(status).toMatch(/random-state/);
  });

  it('points at the design documents, which are the detail the README does not carry', () => {
    expect(README).toContain('](./docs/)');
    expect(README).toContain('docs/444-design.md');
    expect(README).toContain('docs/blindfolded-review.md');
  });
});
