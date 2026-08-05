import { describe, expect, it } from 'vitest';
import { generateScramble, isImplementedEvent, UnimplementedEventError } from './index';
import { parseMove } from './notation/move';
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

/** A smoke test of the package's actual public entry point (`src/index.ts`), not an internal module. */
describe('@cubesmith/scrambler public entry point', () => {
  it('333, 222, pyram, skewb, clock and minx are implemented; other events still throw UnimplementedEventError', async () => {
    for (const event of ['333', '222', 'pyram', 'skewb', 'clock', 'minx'] as const) {
      expect(isImplementedEvent(event)).toBe(true);
    }
    expect(isImplementedEvent('444')).toBe(false);
    await expect(generateScramble('444')).rejects.toBeInstanceOf(UnimplementedEventError);
    await expect(generateScramble('555')).rejects.toBeInstanceOf(UnimplementedEventError);
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
