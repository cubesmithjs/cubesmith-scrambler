import { describe, expect, it } from 'vitest';
import { inverseMoves, parseMove, type FaceMove } from '../../notation/move';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { permutationParity } from '../../utils/permutation';
import { allFaceMoves, getMoveTable } from './move-tables';
import { applyMove, applyMoves, isSolved, SOLVED_STATE, statesEqual, type CubeState } from './state';

/** A state whose corners are solved but a single edge is swapped — not reachable via any real move, but a valid `CubeState` shape for exercising `isSolved`'s edge-checking branch in isolation. */
function cornersSolvedEdgesNot(): CubeState {
  const edgePermutation = [...SOLVED_STATE.edgePermutation];
  const temp = edgePermutation[0]!;
  edgePermutation[0] = edgePermutation[1]!;
  edgePermutation[1] = temp;
  return { ...SOLVED_STATE, edgePermutation };
}

/**
 * These tests exist to catch the class of bug that's easy to make when
 * hand-deriving (or, as here, geometrically deriving) a cube move model: a
 * cycle direction or twist sign backwards. Rather than asserting specific
 * hand-computed expected states (which risks encoding the same mistake in
 * the test as in the code), most of these check mathematical invariants of
 * the Rubik's cube group that hold for *any* correct model — facts
 * independent of this codebase's own reasoning.
 */

describe('every face move has order 4 (applying it 4 times returns to solved)', () => {
  for (const move of allFaceMoves()) {
    it(`${move.face}${move.amount}`, () => {
      let state: CubeState = SOLVED_STATE;
      for (let i = 0; i < 4; i += 1) {
        state = applyMove(state, move);
      }
      expect(statesEqual(state, SOLVED_STATE)).toBe(true);
    });
  }
});

describe('the amount=2/amount=3 tables agree with repeated amount=1 application', () => {
  const faces = ['U', 'D', 'F', 'B', 'L', 'R'] as const;

  it('amount=2 equals applying amount=1 twice, for every face', () => {
    for (const face of faces) {
      const viaHalfTurn = applyMove(SOLVED_STATE, { face, amount: 2 });
      const viaTwoQuarters = applyMove(applyMove(SOLVED_STATE, { face, amount: 1 }), {
        face,
        amount: 1,
      });
      expect(statesEqual(viaHalfTurn, viaTwoQuarters)).toBe(true);
    }
  });

  it('amount=3 equals applying amount=1 three times, for every face', () => {
    for (const face of faces) {
      const viaPrime = applyMove(SOLVED_STATE, { face, amount: 3 });
      let viaThreeQuarters: CubeState = SOLVED_STATE;
      for (let i = 0; i < 3; i += 1) {
        viaThreeQuarters = applyMove(viaThreeQuarters, { face, amount: 1 });
      }
      expect(statesEqual(viaPrime, viaThreeQuarters)).toBe(true);
    }
  });
});

describe('known finite-order facts about the cube group', () => {
  it("(U R U' R') has order 6 — repeating it 6 times returns to solved", () => {
    const sequence: FaceMove[] = [
      { face: 'U', amount: 1 },
      { face: 'R', amount: 1 },
      { face: 'U', amount: 3 },
      { face: 'R', amount: 3 },
    ];
    let state: CubeState = SOLVED_STATE;
    for (let i = 0; i < 6; i += 1) {
      state = applyMoves(state, sequence);
    }
    expect(statesEqual(state, SOLVED_STATE)).toBe(true);
  });

  it("(U R U' R') does NOT return to solved before 6 repetitions (sanity check against a trivial/degenerate model)", () => {
    const sequence: FaceMove[] = [
      { face: 'U', amount: 1 },
      { face: 'R', amount: 1 },
      { face: 'U', amount: 3 },
      { face: 'R', amount: 3 },
    ];
    let state: CubeState = SOLVED_STATE;
    for (let i = 1; i < 6; i += 1) {
      state = applyMoves(state, sequence);
      expect(statesEqual(state, SOLVED_STATE)).toBe(false);
    }
  });

  it("(R U R' U') also has order 6", () => {
    const sequence: FaceMove[] = [
      { face: 'R', amount: 1 },
      { face: 'U', amount: 1 },
      { face: 'R', amount: 3 },
      { face: 'U', amount: 3 },
    ];
    let state: CubeState = SOLVED_STATE;
    for (let i = 0; i < 6; i += 1) {
      state = applyMoves(state, sequence);
    }
    expect(statesEqual(state, SOLVED_STATE)).toBe(true);
  });
});

function randomMoveSequence(random: ReturnType<typeof createRandomSource>, length: number) {
  const moves = allFaceMoves();
  return Array.from({ length }, () => moves[randomInt(random, moves.length)]!);
}

describe('conservation invariants across random sequences from solved', () => {
  const random = createRandomSource('invariant-check');

  it('corner permutation parity always equals edge permutation parity', () => {
    for (let trial = 0; trial < 200; trial += 1) {
      const sequence = randomMoveSequence(random, 1 + randomInt(random, 30));
      const state = applyMoves(SOLVED_STATE, sequence);
      expect(permutationParity(state.cornerPermutation)).toBe(
        permutationParity(state.edgePermutation),
      );
    }
  });

  it('total corner orientation is always ≡ 0 (mod 3)', () => {
    for (let trial = 0; trial < 200; trial += 1) {
      const sequence = randomMoveSequence(random, 1 + randomInt(random, 30));
      const state = applyMoves(SOLVED_STATE, sequence);
      const sum = state.cornerOrientation.reduce((a, b) => a + b, 0);
      expect(sum % 3).toBe(0);
    }
  });

  it('total edge orientation is always ≡ 0 (mod 2)', () => {
    for (let trial = 0; trial < 200; trial += 1) {
      const sequence = randomMoveSequence(random, 1 + randomInt(random, 30));
      const state = applyMoves(SOLVED_STATE, sequence);
      const sum = state.edgeOrientation.reduce((a, b) => a + b, 0);
      expect(sum % 2).toBe(0);
    }
  });
});

describe('round-trip: a sequence followed by its inverse returns to solved', () => {
  const random = createRandomSource('round-trip-check');

  it('holds for many random sequences of varying length', () => {
    for (let trial = 0; trial < 100; trial += 1) {
      const sequence = randomMoveSequence(random, 1 + randomInt(random, 25));
      const scrambled = applyMoves(SOLVED_STATE, sequence);
      const restored = applyMoves(scrambled, inverseMoves(sequence));
      expect(statesEqual(restored, SOLVED_STATE)).toBe(true);
    }
  });
});

describe('isSolved', () => {
  it('is true for SOLVED_STATE', () => {
    expect(isSolved(SOLVED_STATE)).toBe(true);
  });

  it('is false immediately after a single move', () => {
    expect(isSolved(applyMove(SOLVED_STATE, { face: 'R', amount: 1 }))).toBe(false);
  });

  it('is true again after undoing that move', () => {
    const scrambled = applyMove(SOLVED_STATE, { face: 'R', amount: 1 });
    const restored = applyMove(scrambled, { face: 'R', amount: 3 });
    expect(isSolved(restored)).toBe(true);
  });

  it('is false when corners are solved but an edge is not (the edge-check branch)', () => {
    expect(isSolved(cornersSolvedEdgesNot())).toBe(false);
  });
});

describe('statesEqual', () => {
  it('is true for a state compared with itself', () => {
    const scrambled = applyMove(SOLVED_STATE, { face: 'R', amount: 1 });
    expect(statesEqual(scrambled, scrambled)).toBe(true);
  });

  it('is false when only the edge permutation differs', () => {
    expect(statesEqual(SOLVED_STATE, cornersSolvedEdgesNot())).toBe(false);
  });

  it('is false when array lengths differ (malformed input)', () => {
    const malformed: CubeState = {
      ...SOLVED_STATE,
      edgePermutation: SOLVED_STATE.edgePermutation.slice(0, -1),
    };
    expect(statesEqual(SOLVED_STATE, malformed)).toBe(false);
  });
});

describe('a scramble notated with parseMove/movesToString round-trips through applyMoves', () => {
  it('"R U F\' L2" scrambles and its inverse restores', () => {
    const sequence = ['R', 'U', "F'", 'L2'].map(parseMove);
    const scrambled = applyMoves(SOLVED_STATE, sequence);
    expect(isSolved(scrambled)).toBe(false);
    const restored = applyMoves(scrambled, inverseMoves(sequence));
    expect(isSolved(restored)).toBe(true);
  });
});

describe('getMoveTable', () => {
  it('returns a table for every valid face move', () => {
    for (const move of allFaceMoves()) {
      expect(getMoveTable(move)).toBeDefined();
    }
  });

  it('throws for a move outside the valid face/amount domain', () => {
    expect(() => getMoveTable({ face: 'U', amount: 4 as unknown as 1 })).toThrow();
  });
});
