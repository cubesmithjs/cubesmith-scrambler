import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { permutationParity } from '../../utils/permutation';
import { randomInt } from '../../utils/random-int';
import { allMovesSkewb, inverseSkewbMoves, SKEWB_CORNERS, type SkewbMove } from './notation';
import {
  applySkewbMove,
  applySkewbMoves,
  CENTER_COUNT_SKEWB,
  CORNER_COUNT_SKEWB,
  HELD_CORNER_INDEX,
  isSolvedSkewb,
  skewbStatesEqual,
  SOLVED_SKEWB_STATE,
  type SkewbState,
} from './state';

const MOVES = allMovesSkewb();

function randomSequences(seed: string, maxLength: number, trials: number): SkewbMove[][] {
  const random = createRandomSource(seed);
  return Array.from({ length: trials }, () =>
    Array.from(
      { length: 1 + randomInt(random, maxLength) },
      () => MOVES[randomInt(random, MOVES.length)]!,
    ),
  );
}

describe('every turn has order 3', () => {
  for (const move of MOVES) {
    it(`${move.corner}${move.amount}`, () => {
      let state: SkewbState = SOLVED_SKEWB_STATE;
      for (let i = 0; i < 3; i += 1) state = applySkewbMove(state, move);
      expect(skewbStatesEqual(state, SOLVED_SKEWB_STATE)).toBe(true);
    });
  }
});

describe('amount 2 equals two applications of amount 1', () => {
  it('holds for every corner', () => {
    for (const corner of SKEWB_CORNERS) {
      const viaTwo = applySkewbMove(SOLVED_SKEWB_STATE, { corner, amount: 2 });
      const viaOnce = applySkewbMoves(SOLVED_SKEWB_STATE, [
        { corner, amount: 1 },
        { corner, amount: 1 },
      ]);
      expect(skewbStatesEqual(viaTwo, viaOnce)).toBe(true);
    }
  });
});

describe('round trip: a sequence followed by its inverse returns to solved', () => {
  it('holds for many random sequences', () => {
    for (const sequence of randomSequences('skewb-round-trip', 30, 200)) {
      const scrambled = applySkewbMoves(SOLVED_SKEWB_STATE, sequence);
      expect(skewbStatesEqual(applySkewbMoves(scrambled, inverseSkewbMoves(sequence)), SOLVED_SKEWB_STATE)).toBe(true);
    }
  });
});

/**
 * Independent algebraic oracles. Each is a property of the real puzzle,
 * derivable without reference to how `applySkewbMove` happens to be
 * implemented — so a wrong destination, a wrong twist, or a mis-assigned
 * turn axis breaks at least one of them.
 */
describe('group invariants hold for every reachable state', () => {
  const sequences = randomSequences('skewb-invariants', 40, 300);

  it('Fixed Corner Notation really does fix a corner: slot 0 is never disturbed', () => {
    for (const sequence of sequences) {
      const state = applySkewbMoves(SOLVED_SKEWB_STATE, sequence);
      expect(state.cornerPermutation[HELD_CORNER_INDEX]).toBe(HELD_CORNER_INDEX);
      expect(state.cornerOrientation[HELD_CORNER_INDEX]).toBe(0);
    }
  });

  it('center permutation is always even — every turn 3-cycles three centers', () => {
    for (const sequence of sequences) {
      const state = applySkewbMoves(SOLVED_SKEWB_STATE, sequence);
      expect(permutationParity(state.centerPermutation)).toBe(0);
    }
  });

  it('corner permutation is always even, for the same reason', () => {
    for (const sequence of sequences) {
      const state = applySkewbMoves(SOLVED_SKEWB_STATE, sequence);
      expect(permutationParity(state.cornerPermutation)).toBe(0);
    }
  });

  it('the corners split into two orbits that never mix — 4 and 3, plus the held corner', () => {
    // {1,2,3,7} are the four corners opposite the held one's tetrahedron;
    // {4,5,6} are the three turn corners other than B. A turn about a
    // corner in one orbit cycles three members of the other.
    const orbitA = new Set([1, 2, 3, 7]);
    const orbitB = new Set([4, 5, 6]);
    for (const sequence of sequences) {
      const state = applySkewbMoves(SOLVED_SKEWB_STATE, sequence);
      for (const slot of orbitA) expect(orbitA.has(state.cornerPermutation[slot]!)).toBe(true);
      for (const slot of orbitB) expect(orbitB.has(state.cornerPermutation[slot]!)).toBe(true);
    }
  });

  it('permutations stay permutations', () => {
    for (const sequence of sequences) {
      const state = applySkewbMoves(SOLVED_SKEWB_STATE, sequence);
      expect(new Set(state.cornerPermutation).size).toBe(CORNER_COUNT_SKEWB);
      expect(new Set(state.centerPermutation).size).toBe(CENTER_COUNT_SKEWB);
      expect(state.cornerOrientation.every((o) => o >= 0 && o <= 2)).toBe(true);
    }
  });
});

/**
 * A Skewb turn does *not* conserve total corner twist — unlike a 3x3x3 face
 * turn, it pivots about a corner and so twists that corner with nothing to
 * counter-twist it. Asserting the non-conservation directly is worth as
 * much as asserting a conservation law would be: it is the property that
 * makes a single twisted corner reachable here and impossible on a cube,
 * and getting it wrong is exactly how a hand-written twist table fails.
 */
describe('total corner twist is deliberately not conserved', () => {
  it('one turn changes it by two, mod three', () => {
    for (const move of MOVES) {
      const state = applySkewbMove(SOLVED_SKEWB_STATE, move);
      const total = state.cornerOrientation.reduce((a, b) => a + b, 0) % 3;
      expect(total).toBe(move.amount === 1 ? 2 : 1);
    }
  });

  it('so the twist sum takes all three values across random states', () => {
    const sums = new Set(
      randomSequences('skewb-twist-spread', 20, 200).map(
        (sequence) =>
          applySkewbMoves(SOLVED_SKEWB_STATE, sequence).cornerOrientation.reduce(
            (a, b) => a + b,
            0,
          ) % 3,
      ),
    );
    expect(sums).toEqual(new Set([0, 1, 2]));
  });
});

describe('element orders divide the Skewb group order', () => {
  const SKEWB_GROUP_ORDER = 3_149_280;

  const order = (moves: readonly SkewbMove[]): number => {
    let state: SkewbState = SOLVED_SKEWB_STATE;
    for (let n = 1; n <= 5000; n += 1) {
      state = applySkewbMoves(state, moves);
      if (skewbStatesEqual(state, SOLVED_SKEWB_STATE)) return n;
    }
    throw new Error('order exceeded 5000');
  };

  it('every one- and two-turn element has an order dividing 3,149,280', () => {
    for (const a of MOVES) {
      expect(order([a])).toBe(3);
      for (const b of MOVES) {
        if (a.corner === b.corner) continue;
        expect(SKEWB_GROUP_ORDER % order([a, b])).toBe(0);
      }
    }
  });
});

describe('isSolvedSkewb', () => {
  it('accepts solved and rejects any single turn', () => {
    expect(isSolvedSkewb(SOLVED_SKEWB_STATE)).toBe(true);
    for (const move of MOVES) {
      expect(isSolvedSkewb(applySkewbMove(SOLVED_SKEWB_STATE, move))).toBe(false);
    }
  });
});
