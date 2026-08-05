import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { toCoordinate222 } from './coordinates';
import { ALL_MOVES_222, nextCornerOrientation222, nextCornerPerm222 } from './tables';
import { applyMove222, applyMoves222, SOLVED_222_STATE } from './state';

describe('tables-222 — cross-check against direct Cube222State application', () => {
  it('agrees with applying the move to a full state, for many random states and every move', () => {
    const random = createRandomSource('222-table-cross-check');
    for (let trial = 0; trial < 100; trial += 1) {
      const sequence = Array.from(
        { length: 1 + randomInt(random, 20) },
        () => ALL_MOVES_222[randomInt(random, ALL_MOVES_222.length)]!,
      );
      const state = applyMoves222(SOLVED_222_STATE, sequence);
      const before = toCoordinate222(state);
      const move = ALL_MOVES_222[randomInt(random, ALL_MOVES_222.length)]!;
      const afterDirect = toCoordinate222(applyMove222(state, move));

      expect(nextCornerPerm222(before.cornerPerm, move)).toBe(afterDirect.cornerPerm);
      expect(nextCornerOrientation222(before.cornerOrientation, move)).toBe(
        afterDirect.cornerOrientation,
      );
    }
  });
});

describe('tables-222 — structural invariants', () => {
  it('every move has order dividing 4, starting from solved', () => {
    const solved = toCoordinate222(SOLVED_222_STATE);
    for (const move of ALL_MOVES_222) {
      let perm = solved.cornerPerm;
      let orient = solved.cornerOrientation;
      for (let i = 0; i < 4; i += 1) {
        perm = nextCornerPerm222(perm, move);
        orient = nextCornerOrientation222(orient, move);
      }
      expect(perm).toBe(solved.cornerPerm);
      expect(orient).toBe(solved.cornerOrientation);
    }
  });

  it('a long random walk in coordinate space matches the same walk on a full Cube222State', () => {
    const random = createRandomSource('222-table-walk');
    const moves = Array.from(
      { length: 40 },
      () => ALL_MOVES_222[randomInt(random, ALL_MOVES_222.length)]!,
    );

    const solved = toCoordinate222(SOLVED_222_STATE);
    let perm = solved.cornerPerm;
    let orient = solved.cornerOrientation;
    for (const move of moves) {
      perm = nextCornerPerm222(perm, move);
      orient = nextCornerOrientation222(orient, move);
    }

    const direct = toCoordinate222(applyMoves222(SOLVED_222_STATE, moves));
    expect({ cornerPerm: perm, cornerOrientation: orient }).toEqual(direct);
  });
});
