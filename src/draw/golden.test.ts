import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXTURE_CASES } from './__fixtures__/cases';
import { serializeFixtures, type Fixture } from './__fixtures__/serialize';
import { drawScramble } from './index';

/**
 * Golden fixtures — the second half of how parity gets *verified* rather than
 * asserted (`02-tnoodle-drawing-spec.md` §9).
 *
 * The structural invariants in `puzzles.test.ts` and `cube.test.ts` catch a
 * transposed offset or a mirrored face. What they cannot catch is a *uniform* shift:
 * every constant one pixel out, or a `gap` applied twice, is still self-consistent
 * and still passes every one of them. A committed fixture turns that into a diff on
 * a reviewable file.
 *
 * 🔴 What a fixture does **not** prove: that the numbers were ever right. It proves
 * they have not changed. Being right is what the quoted constants and the invariants
 * are for, and pixel-exact equality with a real TNoodle SVG remains out of reach
 * without building TNoodle — see §9's note, and the separate task it names.
 */
const GOLDEN = new URL('./__fixtures__/golden.json', import.meta.url);

function currentFixtures(): Record<string, Fixture> {
  const fixtures: Record<string, Fixture> = {};
  for (const { name, event, scramble } of FIXTURE_CASES) {
    fixtures[name] = { scramble, image: drawScramble(event, scramble) };
  }
  return fixtures;
}

describe('golden fixtures', () => {
  it('match the committed file, shape for shape', () => {
    const current = currentFixtures();

    if (!existsSync(GOLDEN)) {
      // First run on a fresh checkout of this task's branch: write the file rather
      // than fail, then say so loudly. A missing fixture is a setup state, not a
      // regression — but a silently created one would be a fixture nobody reviewed.
      writeFileSync(GOLDEN, serializeFixtures(current));
      throw new Error(
        'golden.json did not exist and has been written. Review the numbers against ' +
          '02-tnoodle-drawing-spec.md, then commit it.',
      );
    }

    const committed = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, Fixture>;
    expect(Object.keys(current).sort()).toEqual(Object.keys(committed).sort());

    for (const name of Object.keys(current)) {
      // Per fixture rather than one whole-object compare, so a failure names the
      // puzzle instead of dumping eighteen pictures.
      expect(current[name], name).toEqual(committed[name]);
    }
  });

  it('covers every size and every bespoke puzzle', () => {
    const events = new Set(FIXTURE_CASES.map((c) => c.event));
    for (const event of ['222', '333', '444', '555', '666', '777', '333bf', '444bf', 'clock', 'pyram', 'skewb', 'minx', 'sq1']) {
      expect(events.has(event as never), event).toBe(true);
    }
  });
});
