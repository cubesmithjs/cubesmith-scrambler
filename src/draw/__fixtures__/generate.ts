/**
 * Regenerates the golden fixtures. Run with:
 *
 * ```
 * npx tsx src/draw/__fixtures__/generate.ts     # or: node --experimental-strip-types
 * ```
 *
 * 🔴 **Regenerating is a review step, not a fix.** A fixture's whole job is to make a
 * geometry change show up as a diff on a file a human reads. If a test fails, the
 * question is whether the *new* numbers are right — and answering it means checking
 * them against `02-tnoodle-drawing-spec.md` or against the structural invariants in
 * `__tests__/invariants.ts`, not running this and committing the result.
 */
import { writeFileSync } from 'node:fs';
import { drawScramble } from '../index';
import { FIXTURE_CASES } from './cases';
import { serializeFixtures, type Fixture } from './serialize';

const fixtures: Record<string, Fixture> = {};
for (const { name, event, scramble } of FIXTURE_CASES) {
  fixtures[name] = { scramble, image: drawScramble(event, scramble) };
}

const path = new URL('golden.json', import.meta.url);
writeFileSync(path, serializeFixtures(fixtures));
// eslint-disable-next-line no-console -- this is a developer script, not shipped code
console.log(`wrote ${Object.keys(fixtures).length} fixtures to ${path.pathname}`);
