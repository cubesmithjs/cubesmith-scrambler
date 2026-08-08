import { describe, expect, it } from 'vitest';
import {
  generateScramble,
  InvalidScrambleCountError,
  isImplementedEvent,
  MAX_SCRAMBLE_COUNT,
} from './index';
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
import {
  applyMoves,
  generate333Scramble,
  generate333ScrambleWithFloor,
  isSolved,
  solve333,
  SOLVED_STATE,
} from './puzzles/333';
import { createRandomSource } from './random/random-source';
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
import { cubeScrambleIsFarEnough } from './puzzles/nxn/minimum';

/** A smoke test of the package's actual public entry point (`src/index.ts`), not an internal module. */
describe('@cubesmith/scrambler public entry point', () => {
  /**
   * Registration only. Each event's generation is exercised by its own tests
   * below and in its puzzle module; re-generating here would mean four more
   * 3x3x3 solves (`333`, `333bf`, `333fm`, `333oh`) for no extra coverage, and
   * a 3x3x3 solve is by far the slowest thing in this suite.
   */
  /**
   * The structural guard for Regulation 4b3's floor.
   *
   * The floor was missing on four events for months while `README.md` claimed
   * it was enforced everywhere, and `src/readme.test.ts` did not catch it
   * because the claim was prose rather than a runnable example. Asserting the
   * property for all sixteen events would mean generating sixteen scrambles
   * and building every pruning table in this file — minutes, not seconds — so
   * instead each event has to name *where* its floor lives, and the list is
   * checked against the registry.
   *
   * This is a manifest, not a proof: it cannot tell that a named check is
   * correct, only that no event was added without one being named. The
   * property itself is asserted per event in that event's own tests.
   */
  it('every registered event names where its 4b3 floor is enforced', () => {
    const floorEnforcedBy: Record<WcaEventId, string> = {
      '222': 'puzzles/222/solve.ts — drawStateAtLeastMovesFromSolved, 4b3b minimum 4',
      '333': 'puzzles/333/solve.ts — generate333ScrambleWithFloor',
      '333bf': 'puzzles/variants.ts — withMinimumDistance, after the orientation suffix',
      '333fm': 'puzzles/333/fewest-moves.ts — withMinimumDistance, on the padded sequence',
      '333mbf': 'puzzles/variants.ts — generate333BlindfoldedScramble, per cube',
      '333oh': 'puzzles/variants.ts — generate333ScrambleWithFloor',
      '444': 'puzzles/444/solve.ts — isAtLeastTwoMovesFromSolved, on the drawn state',
      '444bf': 'puzzles/variants.ts — withMinimumDistance, after the rotation suffix',
      '555': 'puzzles/nxn/solve.ts — withMinimumDistance',
      '555bf': 'puzzles/variants.ts — withMinimumDistance, after the orientation suffix',
      '666': 'puzzles/nxn/solve.ts — withMinimumDistance',
      '777': 'puzzles/nxn/solve.ts — withMinimumDistance',
      clock: 'puzzles/clock/solve.ts — drawStateAtLeastMovesFromSolved',
      minx: 'puzzles/megaminx/solve.ts — megaminxScrambleIsFarEnough',
      pyram: 'puzzles/pyraminx/solve.ts — drawStateAtLeastMovesFromSolved, 4b3f minimum 6',
      skewb: 'puzzles/skewb/solve.ts — drawStateAtLeastMovesFromSolved, 4b3c minimum 7',
      sq1: 'puzzles/square1/solve.ts — drawStateAtLeastMovesFromSolved, 4b3d minimum 11',
    } as Record<WcaEventId, string>;

    expect(Object.keys(floorEnforcedBy).sort()).toEqual([...implementedEvents()].sort());
  });

  it('registers all seventeen WCA events', () => {
    const implemented = [
      '222',
      '333',
      '333bf',
      '333fm',
      '333mbf',
      '333oh',
      '444',
      '444bf',
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

    for (const event of implemented) expect(isImplementedEvent(event)).toBe(true);

    // The count is asserted rather than described in prose, because "fifteen of
    // seventeen" sat in the README and in this test's own name while the real
    // number was thirteen — a hand-maintained claim with nothing checking it.
    expect([...implementedEvents()].sort()).toEqual([...implemented].sort());
    expect(implemented.length).toBe(17);
    expect(implemented.length).toBe(EVERY_WCA_EVENT.length);
  });

  it('the cheap events all produce a non-empty scramble through the public entry point', async () => {
    for (const event of ['222', '555', '666', '777', 'clock', 'minx', 'pyram', 'skewb'] as const) {
      const result = await generateScramble(event, { seed: 'smoke' });
      expect(result.event).toBe(event);
      expect(result.moves.length).toBeGreaterThan(0);
    }
  });

  /**
   * `333mbf` used to be the one event that threw, "out of scope by design"
   * because one inspection over many cubes was said not to fit a
   * one-scramble-per-call API. Multi-blind is not a different scramble though,
   * only a different number of them, so it needed an optional `count` rather
   * than a new API. Nothing unimplemented is left, so
   * `UnimplementedEventError` now has no event to fire on — which is why it is
   * still exported and still tested, in `core/generate-scramble.test.ts`,
   * against a deliberately empty registry.
   */
  it('333mbf is a real event, and by default is exactly one 333bf scramble', async () => {
    expect(isImplementedEvent('333mbf')).toBe(true);
    const bf = await generateScramble('333bf', { seed: 'mbf-shape' });
    const mbf = await generateScramble('333mbf', { seed: 'mbf-shape' });
    expect(mbf.moves).toBe(bf.moves);
    expect(mbf.quality).toBe('random-state');
    expect(mbf.scrambles).toEqual([bf.moves]);
  });

  it('333mbf draws count independent cubes, each clearing the 4b3 floor after its own suffix', async () => {
    const result = await generateScramble('333mbf', { count: 4, seed: 'mbf-many' });
    expect(result.scrambles).toHaveLength(4);
    expect(result.moves).toBe(result.scrambles![0]);
    // Four independent uniform draws collide with probability ~0, so this
    // checks independence without forbidding a repeat.
    expect(new Set(result.scrambles).size).toBe(4);
    for (const scramble of result.scrambles!) {
      expect(cubeScrambleIsFarEnough(scramble, 3)).toBe(true);
    }
  });

  it('count is rejected on a single-scramble event, naming it', async () => {
    await expect(generateScramble('333', { count: 2 })).rejects.toBeInstanceOf(
      InvalidScrambleCountError,
    );
    await expect(generateScramble('333', { count: 2 })).rejects.toThrow(/"333"/);
  });

  it('exports the count bound, and rejects past it before generating anything', async () => {
    expect(MAX_SCRAMBLE_COUNT).toBe(100);
    // Rejected on validation, so this costs nothing — a hundred and one
    // random-state 3x3x3 solves would take minutes.
    await expect(
      generateScramble('333mbf', { count: MAX_SCRAMBLE_COUNT + 1 }),
    ).rejects.toBeInstanceOf(InvalidScrambleCountError);
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
   * The variant events. `333oh` is the same scramble as `333` — same puzzle,
   * only the human constraint differs — while the blindfolded ones must
   * additionally orient the puzzle randomly (Regulation 4b3a), so they are
   * *not* plain aliases.
   *
   * `333fm` used to be asserted here as a plain alias too. It is not one: an
   * official Fewest Moves scramble is padded with `R' U' F` at both ends, and
   * this test asserted the absence of that padding as if it were correct. Its
   * own event tests are in `puzzles/333/fewest-moves.test.ts`.
   */
  describe('variant events', () => {
    it('333oh reproduces 333 exactly for the same seed', async () => {
      const base = await generateScramble('333', { seed: 'variant' });
      expect((await generateScramble('333oh', { seed: 'variant' })).moves).toBe(base.moves);
    });

    it('333fm does not — it is a puzzle of its own, with the FMC padding', async () => {
      const base = await generateScramble('333', { seed: 'variant' });
      const fmc = await generateScramble('333fm', { seed: 'variant' });
      expect(fmc.moves).not.toBe(base.moves);
      expect(fmc.moves.startsWith("R' U' F ")).toBe(true);
      expect(fmc.moves.endsWith(" R' U' F")).toBe(true);
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
     * `444bf` used to be the deliberate exception with no orientation suffix at
     * all — an even cube has no fixed centre, so its orientation is not a
     * property of its state. TNoodle appends one anyway, and appends a *pure
     * rotation* rather than a wide move, which concedes the same point: it is
     * telling the competitor how to hold the puzzle, not changing it.
     */
    it('444bf is a 444 scramble plus a whole-cube rotation', async () => {
      const base = await generateScramble('444', { seed: 'bf4' });
      const bf = await generateScramble('444bf', { seed: 'bf4' });
      expect(bf.moves.startsWith(base.moves)).toBe(true);

      const extra = bf.moves.slice(base.moves.length).trim();
      for (const token of extra.split(' ').filter(Boolean)) {
        expect(token).toMatch(/^[xyz](2|')?$/);
      }
    });

    it('444bf actually varies the orientation, and only ever by rotating', async () => {
      const suffixes = new Set<string>();
      for (let seed = 0; seed < 8; seed += 1) {
        const base = await generateScramble('444', { seed: `bf4-${seed}` });
        const bf = await generateScramble('444bf', { seed: `bf4-${seed}` });
        suffixes.add(bf.moves.slice(base.moves.length).trim());
      }
      expect(suffixes.size).toBeGreaterThan(1);
      // A rotation cannot bring a scramble closer to solved, but the floor is
      // still measured on the printed sequence rather than on the draw.
      for (let seed = 0; seed < 4; seed += 1) {
        const bf = await generateScramble('444bf', { seed: `bf4-${seed}` });
        expect(cubeScrambleIsFarEnough(bf.moves, 4)).toBe(true);
      }
    });

    /**
     * Regulation 4b3's two-move floor, asserted as a property of the output
     * rather than trusted to a wrapper being in place.
     *
     * It is asserted here rather than in a new file because these three events
     * are 3x3x3 solves, by far the slowest thing in this suite, and this file
     * has already built the pruning tables by the time it gets here.
     */
    it('every 3x3x3 event clears the 4b3 two-move floor', async () => {
      for (const event of ['333', '333oh', '333fm'] as const) {
        const result = await generateScramble(event, { seed: `floor-${event}` });
        expect(cubeScrambleIsFarEnough(result.moves, 3), event).toBe(true);
      }
    });

    it('the floor is additive: it does not change what a 333 seed produces', async () => {
      // The first draw clears the floor with probability 1 − 4×10⁻¹⁹, so adding
      // the check consumes the random stream identically. A change here would
      // mean the floor is rejecting real scrambles, which would be a bug in the
      // check rather than a fact about the draw.
      const direct = generate333Scramble(createRandomSource('floor-additive'));
      expect(generate333ScrambleWithFloor(createRandomSource('floor-additive'))).toBe(direct);
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

/**
 * The exported surface, asserted rather than assumed.
 *
 * v0.12 added a second notation door and a second error class, and "this
 * release is purely additive" is the kind of claim that is easy to make and
 * easy to get wrong. Types are erased at run time, so this covers the values
 * only — the type exports are pinned by `dist/index.d.ts`, which the release
 * diffs against the previous version.
 */
describe('the exported surface', () => {
  it('is exactly these values, so an accidental export fails here', async () => {
    const surface = await import('./index');
    expect(Object.keys(surface).sort()).toEqual([
      'AMOUNTS',
      'AlgorithmSyntaxError',
      'FACES',
      'InvalidScrambleCountError',
      'MAX_SCRAMBLE_COUNT',
      'ScrambleSyntaxError',
      'UnimplementedEventError',
      'createRandomSource',
      'generateScramble',
      'inverseMove',
      'inverseMoves',
      'invertAlgorithm',
      'isImplementedEvent',
      'moveToString',
      'movesToString',
      'notationForEvent',
      'parseAlgorithm',
      'parseMove',
      'serializeAlgorithm',
      'validateAlgorithm',
      'validateScramble',
    ]);
  });

  /**
   * 🔴 The five bespoke ASTs stay private. Exporting a type freezes it, and
   * `Square1Move`, `ClockToken` and friends were written for a solver's
   * convenience — every future refactor of one would become a breaking change
   * of this package. `validateScramble` answers a validity question and
   * reserves the payload for a consumer who turns up with a real need for it.
   */
  it('does not export the five bespoke move types or their parsers', async () => {
    const surface = await import('./index');
    for (const name of [
      'parseMegaminxScramble',
      'parsePyraminxScramble',
      'parseSkewbScramble',
      'parseClockScramble',
      'parseSquare1Scramble',
      'parseMegaminxMove',
      'parseSkewbMove',
    ]) {
      expect(Object.keys(surface), name).not.toContain(name);
    }
  });

  it('reaches all six notations from the public entry point', async () => {
    const { validateScramble, notationForEvent } = await import('./index');
    expect(notationForEvent('minx')).toBe('megaminx');
    expect(validateScramble('minx', 'R++ D-- U')).toEqual({ valid: true, notation: 'megaminx' });
    expect(validateScramble('sq1', '(1, 0) /')).toEqual({ valid: true, notation: 'square1' });
    expect(validateScramble('333', "R U R'")).toEqual({ valid: true, notation: 'cube' });
  });
});
