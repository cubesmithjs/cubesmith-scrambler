import { describe, expect, it } from 'vitest';
import { implementedEvents, isImplementedEvent } from './core/scrambler-registry';
import {
  AlgorithmSyntaxError,
  generateScramble,
  generateScrambles,
  invertAlgorithm,
  MAX_BATCH_COUNT,
  parseAlgorithm,
  prepareEvent,
  ScrambleSyntaxError,
  serializeAlgorithm,
  validateAlgorithm,
  validateScramble,
} from './index';
import { defaultColorScheme, drawScramble, scrambleImageToSvg } from './draw/index';
import { generateUnofficialScramble, unofficialEvents } from './unofficial/index';
import { drawableUnofficialEvents, drawUnofficialScramble } from './unofficial/draw/index';

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
// And on the second reason union, which is a separate type on purpose.
import SCRAMBLE_ERRORS_SOURCE from './core/scramble-errors.ts?raw';
// The `./draw` export path is a fact about the manifest, not about prose, and the
// README now tells a consumer to import it — so the manifest is read the same way.
import PACKAGE_JSON_SOURCE from '../package.json?raw';
// The README links out for detail rather than carrying it (2026-10-21). Importing each
// target is what proves the link resolves: a `?raw` import of a missing file fails the
// whole suite at load time.
import ARCHITECTURE from '../docs/architecture.md?raw';
import CONTRIBUTING from '../CONTRIBUTING.md?raw';
import CHANGELOG from '../CHANGELOG.md?raw';

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

const EVENT_TOTAL = 18;

describe('the README status claims', () => {
  it('states the number of working events that the registry actually holds', () => {
    const count = [...implementedEvents()].length;
    // "Eighteen of the eighteen" would be true and badly written, so the
    // complete case gets its own sentence — and this test still fails the
    // moment the registry stops holding all of them.
    if (count === EVENT_TOTAL) {
      expect(README).toContain('**All eighteen WCA events work end to end.**');
      return;
    }
    const word = NUMBER_WORDS[count];
    expect(word, `no word for ${count}`).toBeDefined();
    expect(README).toContain(`**${word} of the eighteen WCA events work end to end.**`);
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
    // The source-tree tour moved to docs/architecture.md, so the claim is checked there too.
    for (const text of [README, ARCHITECTURE]) {
      for (const directory of populated) {
        expect(text).not.toContain(`src/puzzles/{444,square1}/\`** — empty`);
        expect(text).not.toMatch(new RegExp(`puzzles/${directory}/\`\\*\\* — empty`));
      }
    }
  });

  it('links out for the detail it no longer carries, and every target exists', () => {
    for (const target of ['./CHANGELOG.md', './CONTRIBUTING.md', './docs/architecture.md']) {
      expect(README, target).toContain(`](${target})`);
    }
    // The moved sections really moved, rather than being dropped.
    expect(ARCHITECTURE).toContain('## 1. Source layout');
    expect(ARCHITECTURE).toContain('Scramble shape');
    expect(ARCHITECTURE).toContain('## 4. Independence');
    expect(CONTRIBUTING).toContain('npm run ci');
    expect(CHANGELOG).toContain('## 0.15.0');
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

/**
 * The `validateScramble` examples, run for the same reason as the ones above.
 *
 * This section is the whole of what 0.12 adds to the public surface, and every
 * value commented in it is asserted here. A wrong output comment is a failing
 * build.
 */
describe('the README validateScramble examples', () => {
  it('validates the four events the first snippet names', () => {
    expect(validateScramble('minx', 'R++ D-- U').valid).toBe(true);
    expect(validateScramble('sq1', '(1, 0) / (0, -2) /').valid).toBe(true);
    expect(validateScramble('333', "R U R' U'").valid).toBe(true);
    expect(validateScramble('fto', "U BR' F L' BL D").valid).toBe(true);
  });

  it('rejects the Clock example with exactly the reason, offset, span and hour it claims', () => {
    const bad = validateScramble('clock', 'UR4+ UR9+');
    expect(bad.valid).toBe(false);
    if (bad.valid || bad.notation === 'cube') {
      expect.fail('expected a Clock failure');
    }
    expect(bad.error.reason).toBe('clock-hour-out-of-range');
    expect(bad.error.offset).toBe(5);
    expect(bad.error.length).toBe(4);
    expect(bad.error.hours).toBe(9);
  });

  /** 🔴 The `instanceof` the README shows returning `false`, run rather than described. */
  it('keeps the two error classes apart, in both directions', () => {
    const clock = validateScramble('clock', 'UR9+');
    expect(clock.valid).toBe(false);
    if (!clock.valid) {
      expect(clock.error instanceof AlgorithmSyntaxError).toBe(false);
      expect(clock.error).toBeInstanceOf(ScrambleSyntaxError);
    }

    const cube = validateScramble('333', 'R U Q');
    expect(cube.valid).toBe(false);
    if (!cube.valid) {
      expect(cube.error instanceof ScrambleSyntaxError).toBe(false);
      expect(cube.error).toBeInstanceOf(AlgorithmSyntaxError);
    }
  });

  it('returns a valid arm carrying the notation and no parsed form, as it says', () => {
    expect(validateScramble('minx', 'R++')).toEqual({ valid: true, notation: 'megaminx' });
    expect(validateScramble('333', '')).toEqual({ valid: true, notation: 'cube' });
  });

  /**
   * "one of thirteen documented string codes" is another number written in
   * prose. `ScrambleErrorReason` is a type and erased at run time, so the
   * declaration is read as text and counted — the same standard the cube
   * union's count is held to.
   *
   * The character class differs from the cube one: these codes carry digits
   * (`square1-zero-turn`), which `[a-z-]+` would silently skip.
   */
  it('states the number of scramble reason codes the union actually declares', () => {
    const union =
      SCRAMBLE_ERRORS_SOURCE.split('export type ScrambleErrorReason =')[1]?.split(';')[0] ?? '';
    const codes = [...union.matchAll(/'([a-z0-9-]+)'/g)].map(([, code]) => code!);
    expect(codes.length, 'no codes parsed out of the union').toBeGreaterThan(0);
    expect(new Set(codes).size, 'duplicate reason code').toBe(codes.length);

    // Every code but the shared residual names the grammar that produces it.
    for (const code of codes) {
      if (code === 'unexpected-token') continue;
      expect(code, code).toMatch(/^(megaminx|clock|pyraminx|skewb|square1|fto)-/);
    }

    const word = NUMBER_WORDS[codes.length];
    expect(word, `no word for ${codes.length} — extend NUMBER_WORDS`).toBeDefined();
    expect(README).toContain(`one of ${word!.toLowerCase()} documented string codes`);
  });

  it('documents the event-keyed entry point and the second error class it now exports', () => {
    expect(README).toContain('validateScramble');
    expect(README).toContain('`ScrambleErrorReason`');
    expect(README).toContain('ScrambleSyntaxError');
    // The boundary, stated in the same breath as the feature.
    expect(README).toContain('is this valid notation for this event');
  });
});

/**
 * The 0.13.0 sections, run rather than described.
 *
 * The batch section makes a claim a reader will act on — "a caller-side loop is
 * silently wrong under a seed" — and a claim that is easy to get backwards, about
 * which of two `await`s is a real yield point. Both are asserted here, on the
 * README's own example code.
 */
describe('the README batch and drawing examples', () => {
  it('runs the batch example, and `result[i]` really is the i-th draw', async () => {
    await prepareEvent('222');
    const seen: [number, number][] = [];
    const round = await generateScrambles('222', 20, {
      seed: 'comp-42-round-1',
      onProgress: (done, total) => {
        seen.push([done, total]);
      },
    });
    expect(round).toHaveLength(20);
    expect(seen[0]).toEqual([1, 20]);
    expect(seen).toHaveLength(20);
    // The same seed gives the same twenty, and they are twenty different scrambles.
    const again = await generateScrambles('222', 20, { seed: 'comp-42-round-1' });
    expect(again.map((r) => r.moves)).toEqual(round.map((r) => r.moves));
    expect(new Set(round.map((r) => r.moves)).size).toBe(20);
  });

  it('🔴 demonstrates the trap the README warns about, so the warning stays true', async () => {
    const loop = await Promise.all([
      generateScramble('222', { seed: 'trap' }),
      generateScramble('222', { seed: 'trap' }),
    ]);
    expect(loop[0]!.moves).toBe(loop[1]!.moves);
    // Whitespace-normalised, because the sentence wraps in the source and a reader
    // editing the wrap should not be able to break a test about the claim.
    expect(README.replace(/\s+/g, ' ')).toContain(
      'a seeded loop returns the same scramble N times',
    );
  });

  it('runs the multi-blind composition example', async () => {
    const attempts = await generateScrambles('333mbf', 3, { cubesPerAttempt: 12 });
    expect(attempts).toHaveLength(3);
    expect(attempts[0]!.scrambles).toHaveLength(12);
  });

  it('states MAX_BATCH_COUNT as the number the code actually exports', () => {
    expect(README).toContain(`\`1..MAX_BATCH_COUNT\` (${MAX_BATCH_COUNT})`);
  });

  it('runs the drawing example, with the exact numbers the README prints', () => {
    const image = drawScramble('333', "R U R' U' F2 D");
    expect(image.width).toBe(130);
    expect(image.height).toBe(98);
    expect(image.shapes).toHaveLength(54);
    expect(image.shapes[0]!.kind).toBe('rect');
    expect(scrambleImageToSvg(image).startsWith('<svg')).toBe(true);
    // 🔴 The claim that the schemes are not interchangeable, as a value.
    expect(defaultColorScheme('skewb').R).toBe('#0000ff');
    expect(defaultColorScheme('333').R).toBe('#ff0000');
  });

  it('documents the second entry point by the path a consumer imports', () => {
    expect(README).toContain('@cubesmith/scrambler/draw');
    // …and that path resolves, which is a fact about `package.json`, not prose.
    expect(PACKAGE_JSON_SOURCE).toContain('"./draw"');
  });
});

/** The 0.15.0 unofficial-events section: the unofficial entry points, run rather than described. */
describe('the README unofficial-events section', () => {
  it('runs the example, with the exact values the README prints', async () => {
    const big = await generateUnofficialScramble('888');
    expect(big.quality).toBe('random-moves');
    expect(big.moves.split(' ')).toHaveLength(120);
    expect((await generateUnofficialScramble('fisher')).quality).toBe('random-state-mechanism');
    expect(drawUnofficialScramble('888', big.moves).width).toBe(330);
    expect(drawUnofficialScramble('fisher', "R U R' U'").shapes[0]!.kind).toBe('polygon');
    expect(drawUnofficialScramble('mirror', 'R U', undefined, { view: 'height-map' }).width).toBe(130);
  });

  it('says "sixteen", lists every event, and marks exactly the undrawn ones', () => {
    expect(README).toContain('Sixteen puzzles the WCA does not hold');
    expect(unofficialEvents()).toHaveLength(16);
    for (const event of unofficialEvents()) expect(README, event).toContain(`\`${event}\``);
    const undrawn = unofficialEvents().filter((e) => !drawableUnofficialEvents().includes(e));
    expect(undrawn).toEqual(['axis', 'windmill', 'ghost']);
    expect(README).toContain('| `axis` `windmill` `ghost` | the `333` scramble | none yet');
  });

  it('documents both new entry points by the path a consumer imports, and both resolve', () => {
    expect(README).toContain("from '@cubesmith/scrambler/unofficial'");
    expect(README).toContain("from '@cubesmith/scrambler/unofficial/draw'");
    expect(PACKAGE_JSON_SOURCE).toContain('"./unofficial"');
    expect(PACKAGE_JSON_SOURCE).toContain('"./unofficial/draw"');
  });

  it('keeps the main entry answering no for an unofficial id, as the section claims', () => {
    expect(isImplementedEvent('888' as never)).toBe(false);
  });
});
