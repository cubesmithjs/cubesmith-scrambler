import { describe, expect, it } from 'vitest';
import { generateScramble, isImplementedEvent, UnimplementedEventError } from './index';
import { implementedEvents } from './core/scrambler-registry';
import type { WcaEventId } from './core/types';
import { parseMove } from './notation/move';

/**
 * Every member of `WcaEventId`, spelled out. `WcaEventId` is a type, so there
 * is no runtime list to check against — keeping one here at least makes the
 * "N of seventeen" claim testable. Promoting this to a real export is on the
 * API-review list.
 */
const EVERY_WCA_EVENT: readonly WcaEventId[] = [
  '222',
  '333',
  '444',
  '555',
  '666',
  '777',
  '333bf',
  '333fm',
  '333oh',
  '333mbf',
  '444bf',
  '555bf',
  'minx',
  'pyram',
  'clock',
  'skewb',
  'sq1',
];
import { applyMoves, isSolved, solve333, SOLVED_STATE } from './puzzles/333';
import {
  applyMoves222,
  isSolved222,
  solve222,
  SOLVED_222_STATE,
} from './puzzles/222';
import {
  applyPyraminxMoves,
  isSolvedPyraminx,
  parsePyraminxMove,
  solvePyraminx,
  SOLVED_PYRAMINX_STATE,
} from './puzzles/pyraminx';
import {
  applySkewbMoves,
  isSolvedSkewb,
  parseSkewbMove,
  solveSkewb,
  SOLVED_SKEWB_STATE,
} from './puzzles/skewb';
import {
  applyClockTokens,
  isSolvedClock,
  parseClockScramble,
  solveClock,
  SOLVED_CLOCK_STATE,
} from './puzzles/clock';
import {
  applyMegaminxMoves,
  inverseMegaminxMoves,
  isSolvedMegaminx,
  parseMegaminxMove,
  SOLVED_MEGAMINX_STATE,
} from './puzzles/megaminx';
import {
  applyWideMoves,
  inverseWideMoves,
  isIdentityNxN,
  isSolvedNxN,
  parseWideMove,
  solvedCubeNxN,
} from './puzzles/nxn';
import { orientationKey } from './puzzles/nxn/orientation';

/** A smoke test of the package's actual public entry point (`src/index.ts`), not an internal module. */
describe('@cubesmith/scrambler public entry point', () => {
  /**
   * Registration only. Each event's generation is exercised by its own tests
   * below and in its puzzle module; re-generating here would mean four more
   * 3x3x3 solves (`333`, `333bf`, `333fm`, `333oh`) for no extra coverage, and
   * a 3x3x3 solve is by far the slowest thing in this suite.
   */
  it('registers exactly the fourteen events that are implemented', () => {
    const implemented = [
      '222',
      '333',
      '333bf',
      '333fm',
      '333oh',
      '555',
      '555bf',
      '666',
      '777',
      'clock',
      'minx',
      'pyram',
      'skewb',
      'sq1',
    ] as const;
    const unimplemented = ['444', '444bf', '333mbf'] as const;

    for (const event of implemented) expect(isImplementedEvent(event)).toBe(true);
    for (const event of unimplemented) expect(isImplementedEvent(event)).toBe(false);

    // The count is asserted rather than described in prose, because "fifteen of
    // seventeen" sat in the README and in this test's own name while the real
    // number was thirteen — a hand-maintained claim with nothing checking it.
    expect([...implementedEvents()].sort()).toEqual([...implemented].sort());
    expect(implemented.length).toBe(14);
    expect(implemented.length + unimplemented.length).toBe(EVERY_WCA_EVENT.length);
  });

  it('the cheap events all produce a non-empty scramble through the public entry point', async () => {
    for (const event of ['222', '555', '666', '777', 'clock', 'minx', 'pyram', 'skewb'] as const) {
      const result = await generateScramble(event, { seed: 'smoke' });
      expect(result.event).toBe(event);
      expect(result.moves.length).toBeGreaterThan(0);
    }
  });

  /**
   * The ones that aren't, and why — each is a deliberate state, not an
   * oversight, and each throws rather than returning something plausible.
   */
  it('444 and 444bf throw UnimplementedEventError; 333mbf is out of scope by design', async () => {
    for (const event of ['444', '444bf', '333mbf'] as const) {
      expect(isImplementedEvent(event)).toBe(false);
      await expect(generateScramble(event)).rejects.toBeInstanceOf(UnimplementedEventError);
    }
  });

  /**
   * The one event so far whose `quality` is not `random-state`. WCA
   * Regulation 4b3e specifies random-*moves* for Megaminx, so reporting
   * random-state would overclaim.
   */
  it('reports the quality actually used per event', async () => {
    expect((await generateScramble('333', { seed: 'q' })).quality).toBe('random-state');
    expect((await generateScramble('minx', { seed: 'q' })).quality).toBe('random-moves');
  });

  it('generateScramble("333") returns a well-formed, random-state-quality result', async () => {
    const result = await generateScramble('333');
    expect(result.event).toBe('333');
    expect(result.quality).toBe('random-state');
    expect(result.moves.length).toBeGreaterThan(0);
    // Every token must parse as a legal face-move.
    for (const token of result.moves.split(' ')) {
      expect(() => parseMove(token)).not.toThrow();
    }
  });

  it('is deterministic given a seed, and varies without one', async () => {
    const a = await generateScramble('333', { seed: 'fixed' });
    const b = await generateScramble('333', { seed: 'fixed' });
    expect(a.moves).toBe(b.moves);

    const c = await generateScramble('333');
    const d = await generateScramble('333');
    expect(c.moves).not.toBe(d.moves);
  });

  it('the returned 333 scramble is a genuine, solvable cube state: applying it un-solves a solved cube, and solve333 re-solves it', async () => {
    const result = await generateScramble('333', { seed: 'end-to-end-check' });
    const moves = result.moves.split(' ').map(parseMove);

    const scrambledState = applyMoves(SOLVED_STATE, moves);
    expect(isSolved(scrambledState)).toBe(false);

    const solution = solve333(scrambledState);
    const resolvedState = applyMoves(scrambledState, solution);
    expect(isSolved(resolvedState)).toBe(true);
  });

  it('holds across many different seeds for 333, not just one', async () => {
    for (let i = 0; i < 15; i += 1) {
      const result = await generateScramble('333', { seed: `seed-${i}` });
      const moves = result.moves.split(' ').map(parseMove);
      const scrambledState = applyMoves(SOLVED_STATE, moves);
      expect(isSolved(scrambledState)).toBe(false);
      const solution = solve333(scrambledState);
      expect(isSolved(applyMoves(scrambledState, solution))).toBe(true);
    }
  });

  it('generateScramble("222") returns a well-formed result that genuinely scrambles and re-solves', async () => {
    const result = await generateScramble('222', { seed: '222-end-to-end' });
    expect(result.event).toBe('222');
    expect(result.quality).toBe('random-state');
    expect(result.moves.length).toBeGreaterThan(0);

    const moves = result.moves.split(' ').map(parseMove);
    for (const move of moves) {
      expect(['U', 'R', 'F']).toContain(move.face);
    }

    const scrambledState = applyMoves222(SOLVED_222_STATE, moves);
    expect(isSolved222(scrambledState)).toBe(false);

    const solution = solve222(scrambledState);
    expect(isSolved222(applyMoves222(scrambledState, solution))).toBe(true);
  });

  it('holds across many different seeds for 222, not just one', async () => {
    for (let i = 0; i < 15; i += 1) {
      const result = await generateScramble('222', { seed: `222-seed-${i}` });
      const moves = result.moves.split(' ').map(parseMove);
      const scrambledState = applyMoves222(SOLVED_222_STATE, moves);
      expect(isSolved222(scrambledState)).toBe(false);
      const solution = solve222(scrambledState);
      expect(isSolved222(applyMoves222(scrambledState, solution))).toBe(true);
    }
  });

  it('generateScramble("pyram") returns a well-formed result that genuinely scrambles and re-solves', async () => {
    const result = await generateScramble('pyram', { seed: 'pyram-end-to-end' });
    expect(result.event).toBe('pyram');
    expect(result.quality).toBe('random-state');
    expect(result.moves.length).toBeGreaterThan(0);

    const moves = result.moves.split(' ').map(parsePyraminxMove);
    const scrambledState = applyPyraminxMoves(SOLVED_PYRAMINX_STATE, moves);
    expect(isSolvedPyraminx(scrambledState)).toBe(false);

    const solution = solvePyraminx(scrambledState);
    expect(isSolvedPyraminx(applyPyraminxMoves(scrambledState, solution))).toBe(true);
  });

  it('holds across many different seeds for pyram, not just one', async () => {
    for (let i = 0; i < 15; i += 1) {
      const result = await generateScramble('pyram', { seed: `pyram-seed-${i}` });
      const moves = result.moves.split(' ').map(parsePyraminxMove);
      const scrambledState = applyPyraminxMoves(SOLVED_PYRAMINX_STATE, moves);
      expect(isSolvedPyraminx(scrambledState)).toBe(false);
      const solution = solvePyraminx(scrambledState);
      expect(isSolvedPyraminx(applyPyraminxMoves(scrambledState, solution))).toBe(true);
    }
  });

  it('generateScramble("skewb") returns a well-formed result that genuinely scrambles and re-solves', async () => {
    const result = await generateScramble('skewb', { seed: 'skewb-end-to-end' });
    expect(result.event).toBe('skewb');
    expect(result.quality).toBe('random-state');
    expect(result.moves.split(' ')).toHaveLength(11);

    const moves = result.moves.split(' ').map(parseSkewbMove);
    const scrambledState = applySkewbMoves(SOLVED_SKEWB_STATE, moves);
    expect(isSolvedSkewb(scrambledState)).toBe(false);

    expect(isSolvedSkewb(applySkewbMoves(scrambledState, solveSkewb(scrambledState)))).toBe(true);
  });

  it('holds across many different seeds for skewb, not just one', async () => {
    for (let i = 0; i < 15; i += 1) {
      const result = await generateScramble('skewb', { seed: `skewb-seed-${i}` });
      const moves = result.moves.split(' ').map(parseSkewbMove);
      const scrambledState = applySkewbMoves(SOLVED_SKEWB_STATE, moves);
      expect(isSolvedSkewb(scrambledState)).toBe(false);
      expect(isSolvedSkewb(applySkewbMoves(scrambledState, solveSkewb(scrambledState)))).toBe(true);
    }
  });

  it('generateScramble("clock") returns the official token template, and it round-trips', async () => {
    const result = await generateScramble('clock', { seed: 'clock-end-to-end' });
    expect(result.event).toBe('clock');
    expect(result.quality).toBe('random-state');
    expect(result.moves).toContain('y2');

    const tokens = parseClockScramble(result.moves);
    const scrambledState = applyClockTokens(SOLVED_CLOCK_STATE, tokens);
    expect(isSolvedClock(scrambledState)).toBe(false);

    expect(isSolvedClock(applyClockTokens(scrambledState, solveClock(scrambledState)))).toBe(true);
  });

  it('holds across many different seeds for clock, not just one', async () => {
    for (let i = 0; i < 15; i += 1) {
      const result = await generateScramble('clock', { seed: `clock-seed-${i}` });
      const scrambledState = applyClockTokens(SOLVED_CLOCK_STATE, parseClockScramble(result.moves));
      expect(isSolvedClock(scrambledState)).toBe(false);
      expect(isSolvedClock(applyClockTokens(scrambledState, solveClock(scrambledState)))).toBe(true);
    }
  });

  /**
   * Megaminx is random-moves, so there is no solver to round-trip against —
   * the check is scramble-then-invert, which still covers generation,
   * rendering, parsing and the derived move tables.
   */
  /**
   * The variant events. `333fm`/`333oh` are the same scramble as `333` — same
   * puzzle, only the human constraint differs — while the blindfolded ones
   * must additionally orient the puzzle randomly (Regulation 4b3a), so they
   * are *not* plain aliases.
   */
  describe('variant events', () => {
    it('333fm and 333oh reproduce 333 exactly for the same seed', async () => {
      const base = await generateScramble('333', { seed: 'variant' });
      expect((await generateScramble('333fm', { seed: 'variant' })).moves).toBe(base.moves);
      expect((await generateScramble('333oh', { seed: 'variant' })).moves).toBe(base.moves);
    });

    it('333bf is a 333 scramble plus a wide-move orientation suffix', async () => {
      const base = await generateScramble('333', { seed: 'bf' });
      const bf = await generateScramble('333bf', { seed: 'bf' });
      expect(bf.moves.startsWith(base.moves)).toBe(true);

      // Every extra token is a wide move — the only thing that can move a
      // centre, and therefore the only thing that can reorient the cube.
      const extra = bf.moves.slice(base.moves.length).trim();
      for (const token of extra.split(' ').filter(Boolean)) {
        expect(parseWideMove(token).depth).toBeGreaterThanOrEqual(2);
      }
    });

    /**
     * That the *draw* covers all 24 orientations uniformly is established in
     * `puzzles/nxn/orientation.test.ts`, where it costs nothing. Here the point
     * is only that `333bf` is wired to it at all. Kept to a few seeds because a
     * 3x3x3 solve is the slowest operation in this package.
     */
    it('333bf actually varies the orientation', async () => {
      const solved = solvedCubeNxN(3);
      const orientations = new Set<string>();
      for (let seed = 0; seed < 8; seed += 1) {
        const bf = await generateScramble('333bf', { seed: `bf-${seed}` });
        orientations.add(
          orientationKey(applyWideMoves(solved, bf.moves.split(' ').map(parseWideMove))),
        );
      }
      expect(orientations.size).toBeGreaterThan(1);
    });

    /**
     * And the gap Regulation 4b3a closes, argued structurally rather than by
     * sampling: a `333` scramble is *only* single-layer turns, and a
     * single-layer turn cannot move a centre — so the orientation it leaves the
     * cube in is always the same one, whatever the seed.
     */
    it('a sighted 333 scramble contains no wide move, so it can never reorient the cube', async () => {
      const result = await generateScramble('333', { seed: 'depth-check' });
      for (const token of result.moves.split(' ')) {
        expect(parseWideMove(token).depth).toBe(1);
      }
      const solved = solvedCubeNxN(3);
      const after = applyWideMoves(solved, result.moves.split(' ').map(parseWideMove));
      expect(orientationKey(after)).toBe(orientationKey(solved));
    });

    it('555bf is a 555 scramble plus an orientation suffix, and still round-trips', async () => {
      const base = await generateScramble('555', { seed: 'bf5' });
      const bf = await generateScramble('555bf', { seed: 'bf5' });
      expect(bf.moves.startsWith(base.moves)).toBe(true);
      expect(bf.quality).toBe('random-moves');

      const moves = bf.moves.split(' ').map(parseWideMove);
      const scrambled = applyWideMoves(solvedCubeNxN(5), moves);
      expect(isSolvedNxN(scrambled)).toBe(false);
      expect(isIdentityNxN(applyWideMoves(scrambled, inverseWideMoves(moves)))).toBe(true);
    });
  });

  describe('the big cubes', () => {
    for (const [event, size, length] of [
      ['555', 5, 60],
      ['666', 6, 80],
      ['777', 7, 100],
    ] as const) {
      it(`${event} is ${length} random moves that scramble and invert cleanly`, async () => {
        const result = await generateScramble(event, { seed: `${event}-e2e` });
        expect(result.quality).toBe('random-moves');
        const moves = result.moves.split(' ').map(parseWideMove);
        expect(moves).toHaveLength(length);

        const scrambled = applyWideMoves(solvedCubeNxN(size), moves);
        expect(isSolvedNxN(scrambled)).toBe(false);
        expect(isIdentityNxN(applyWideMoves(scrambled, inverseWideMoves(moves)))).toBe(true);
      });
    }
  });

  it('generateScramble("minx") returns 77 moves that scramble and invert cleanly', async () => {
    for (let i = 0; i < 15; i += 1) {
      const result = await generateScramble('minx', { seed: `minx-seed-${i}` });
      expect(result.moves.split(' ')).toHaveLength(77);
      const moves = result.moves.split(' ').map(parseMegaminxMove);

      const scrambledState = applyMegaminxMoves(SOLVED_MEGAMINX_STATE, moves);
      expect(isSolvedMegaminx(scrambledState)).toBe(false);
      expect(
        isSolvedMegaminx(applyMegaminxMoves(scrambledState, inverseMegaminxMoves(moves))),
      ).toBe(true);
    }
  });
});
