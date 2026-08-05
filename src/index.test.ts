import { describe, expect, it } from 'vitest';
import { generateScramble, isImplementedEvent, UnimplementedEventError } from './index';
import { parseMove } from './notation/move';
import { applyMoves, isSolved, solve333, SOLVED_STATE } from './puzzles/333';

/** A smoke test of the package's actual public entry point (`src/index.ts`), not an internal module. */
describe('@cubesmith/scrambler public entry point', () => {
  it('333 is implemented; other events still throw UnimplementedEventError', async () => {
    expect(isImplementedEvent('333')).toBe(true);
    expect(isImplementedEvent('222')).toBe(false);
    await expect(generateScramble('222')).rejects.toBeInstanceOf(UnimplementedEventError);
    await expect(generateScramble('444')).rejects.toBeInstanceOf(UnimplementedEventError);
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

  it('the returned scramble is a genuine, solvable cube state: applying it un-solves a solved cube, and solve333 re-solves it', async () => {
    const result = await generateScramble('333', { seed: 'end-to-end-check' });
    const moves = result.moves.split(' ').map(parseMove);

    const scrambledState = applyMoves(SOLVED_STATE, moves);
    expect(isSolved(scrambledState)).toBe(false);

    const solution = solve333(scrambledState);
    const resolvedState = applyMoves(scrambledState, solution);
    expect(isSolved(resolvedState)).toBe(true);
  });

  it('holds across many different seeds, not just one', async () => {
    for (let i = 0; i < 15; i += 1) {
      const result = await generateScramble('333', { seed: `seed-${i}` });
      const moves = result.moves.split(' ').map(parseMove);
      const scrambledState = applyMoves(SOLVED_STATE, moves);
      expect(isSolved(scrambledState)).toBe(false);
      const solution = solve333(scrambledState);
      expect(isSolved(applyMoves(scrambledState, solution))).toBe(true);
    }
  });
});
