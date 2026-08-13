import { beforeAll, describe, expect, it } from 'vitest';
// Imported for its registration side effects: the registry is populated by the
// package entry point, not by the core module.
import { generateScramble } from '../../index';
import { createRandomSource } from '../../random/random-source';
import { cubeScrambleIsFarEnough } from '../nxn/minimum';
import { parseWideMove } from '../nxn/notation';
import { randomCube444State } from './coordinates';
import { generate444Scramble, prepare444Tables, solve444 } from './solve';
import { apply444Moves, cube444StatesEqual, is444Solved, move444Tables, SOLVED_444_STATE } from './state';

/**
 * The tables, built once before anything is timed.
 *
 * Every test below solves a 4x4x4, and without this the first of them pays the whole
 * cold table build inside its own 180 s budget — which under `--coverage` and full
 * parallel load is enough to time it out. The build is not what any of these tests is
 * about, and `hookTimeout` is 10 s while `vitest.config.ts` only raises `testTimeout`,
 * so the hook needs its own.
 */
beforeAll(() => {
  prepare444Tables();
}, 900_000);

const indexOfMove = (token: string): number => {
  const move = parseWideMove(token);
  const index = move444Tables().findIndex(
    (table) =>
      table.move.face === move.face &&
      table.move.depth === move.depth &&
      table.move.amount === move.amount,
  );
  if (index < 0) throw new Error(`no 4x4x4 move for ${token}`);
  return index;
};

const applyScramble = (scramble: string): ReturnType<typeof apply444Moves> =>
  apply444Moves(
    SOLVED_444_STATE,
    scramble.split(/\s+/).filter(Boolean).map(indexOfMove),
  );

describe('checkpoint E: a scramble reproduces the exact state drawn', () => {
  it('holds for the solution-inverse identity', () => {
    const random = createRandomSource('444 checkpoint E');
    for (let trial = 0; trial < 3; trial += 1) {
      const drawn = randomCube444State(random);
      const solution = solve444(drawn);
      // The solution takes the drawn state to solved...
      expect(is444Solved(apply444Moves(drawn, solution))).toBe(true);
      // ...so its inverse takes solved back to exactly the drawn state, which is what
      // makes the printed scramble encode that state and no other. This is the
      // injectivity that section 11 rests on: the state is recoverable from the
      // scramble, so two states cannot share one.
      const inverse = [...solution].reverse().map((index) => {
        const { face, depth, amount } = move444Tables()[index]!.move;
        const wanted = amount === 2 ? 2 : amount === 1 ? 3 : 1;
        return move444Tables().findIndex(
          (table) =>
            table.move.face === face && table.move.depth === depth && table.move.amount === wanted,
        );
      });
      expect(cube444StatesEqual(apply444Moves(SOLVED_444_STATE, inverse), drawn)).toBe(true);
    }
  });
});

describe('generating 444 scrambles', () => {
  it('produces a scramble that is a legal, parseable move sequence', () => {
    const random = createRandomSource('444 generate');
    const scramble = generate444Scramble(random);
    expect(scramble.length).toBeGreaterThan(0);
    const tokens = scramble.split(/\s+/).filter(Boolean);
    for (const token of tokens) expect(() => parseWideMove(token)).not.toThrow();
    // The scramble does something: it is nowhere near solved.
    expect(is444Solved(applyScramble(scramble))).toBe(false);
  });

  it('is deterministic for a given seed, and differs between seeds', () => {
    const first = generate444Scramble(createRandomSource('seed one'));
    const again = generate444Scramble(createRandomSource('seed one'));
    const other = generate444Scramble(createRandomSource('seed two'));
    expect(first).toBe(again);
    expect(first).not.toBe(other);
  });

  it('is reachable through the registry, for both 444 and 444bf', async () => {
    for (const event of ['444', '444bf'] as const) {
      const result = await generateScramble(event, { seed: `cubesmith ${event}` });
      expect(result.event).toBe(event);
      expect(result.quality).toBe('random-state');

      // A `444bf` scramble ends with a whole-cube rotation, and the piece model
      // used here has no move for one — nor could it usefully have, since a
      // rotation moves no piece relative to any other. So the turns go through
      // this model, and the whole printed sequence, rotation included, goes
      // through the facelet model that `cubeScrambleIsFarEnough` uses.
      const turns = result.moves.split(/\s+/).filter((token) => !/^[xyz]/.test(token));
      expect(is444Solved(applyScramble(turns.join(' ')))).toBe(false);
      expect(cubeScrambleIsFarEnough(result.moves, 4)).toBe(true);
    }
  });
});
