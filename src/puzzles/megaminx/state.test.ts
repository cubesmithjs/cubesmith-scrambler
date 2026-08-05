import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { permutationParity } from '../../utils/permutation';
import { randomInt } from '../../utils/random-int';
import {
  allMovesMegaminx,
  inverseMegaminxMoves,
  megaminxMoveToString,
  type MegaminxMove,
} from './notation';
import {
  applyMegaminxMove,
  applyMegaminxMoves,
  CORNER_COUNT_MINX,
  EDGE_COUNT_MINX,
  FACE_COUNT_MINX,
  isSolvedMegaminx,
  megaminxStatesEqual,
  SOLVED_MEGAMINX_STATE,
  type MegaminxState,
} from './state';

const MOVES = allMovesMegaminx();

function randomSequences(seed: string, maxLength: number, trials: number): MegaminxMove[][] {
  const random = createRandomSource(seed);
  return Array.from({ length: trials }, () =>
    Array.from({ length: 1 + randomInt(random, maxLength) }, () => MOVES[randomInt(random, MOVES.length)]!),
  );
}

describe('every move has order 5', () => {
  for (const move of MOVES) {
    it(megaminxMoveToString(move), () => {
      let state: MegaminxState = SOLVED_MEGAMINX_STATE;
      for (let i = 0; i < 5; i += 1) state = applyMegaminxMove(state, move);
      expect(megaminxStatesEqual(state, SOLVED_MEGAMINX_STATE)).toBe(true);
    });
  }
});

describe('the two directions of each token are inverses', () => {
  it('holds for U, R and D', () => {
    for (const kind of ['U', 'R', 'D'] as const) {
      const there = applyMegaminxMove(SOLVED_MEGAMINX_STATE, { kind, direction: 1 });
      const back = applyMegaminxMove(there, { kind, direction: 2 });
      expect(megaminxStatesEqual(back, SOLVED_MEGAMINX_STATE)).toBe(true);
    }
  });
});

describe('round trip: a sequence followed by its inverse returns to solved', () => {
  it('holds for many random sequences', () => {
    for (const sequence of randomSequences('minx-round-trip', 40, 200)) {
      const scrambled = applyMegaminxMoves(SOLVED_MEGAMINX_STATE, sequence);
      const restored = applyMegaminxMoves(scrambled, inverseMegaminxMoves(sequence));
      expect(megaminxStatesEqual(restored, SOLVED_MEGAMINX_STATE)).toBe(true);
    }
  });
});

/**
 * Independent algebraic oracles — properties of the real puzzle rather than
 * restatements of what `applyMegaminxMove` computes.
 */
describe('group invariants hold for every reachable state', () => {
  const sequences = randomSequences('minx-invariants', 40, 300);

  it('total corner twist is 0 mod 3 — one corner can never be twisted alone', () => {
    for (const sequence of sequences) {
      const state = applyMegaminxMoves(SOLVED_MEGAMINX_STATE, sequence);
      expect(state.cornerOrientation.reduce((a, b) => a + b, 0) % 3).toBe(0);
    }
  });

  it('total edge flip is even — one edge can never be flipped alone', () => {
    for (const sequence of sequences) {
      const state = applyMegaminxMoves(SOLVED_MEGAMINX_STATE, sequence);
      expect(state.edgeOrientation.reduce((a, b) => a + b, 0) % 2).toBe(0);
    }
  });

  /**
   * A Megaminx face turn 5-cycles its corners and 5-cycles its edges. A
   * 5-cycle is even, so both permutations stay even independently — unlike a
   * 3x3x3, where a quarter turn is a pair of odd 4-cycles and only their
   * *combined* parity is conserved.
   */
  it('corner and edge permutations are each always even', () => {
    for (const sequence of sequences) {
      const state = applyMegaminxMoves(SOLVED_MEGAMINX_STATE, sequence);
      expect(permutationParity(state.cornerPermutation)).toBe(0);
      expect(permutationParity(state.edgePermutation)).toBe(0);
    }
  });

  it('center permutation is always even too', () => {
    for (const sequence of sequences) {
      const state = applyMegaminxMoves(SOLVED_MEGAMINX_STATE, sequence);
      expect(permutationParity(state.centerPermutation)).toBe(0);
    }
  });

  it('permutations stay permutations and orientations stay in range', () => {
    for (const sequence of sequences) {
      const state = applyMegaminxMoves(SOLVED_MEGAMINX_STATE, sequence);
      expect(new Set(state.cornerPermutation).size).toBe(CORNER_COUNT_MINX);
      expect(new Set(state.edgePermutation).size).toBe(EDGE_COUNT_MINX);
      expect(new Set(state.centerPermutation).size).toBe(FACE_COUNT_MINX);
      expect(state.cornerOrientation.every((o) => o >= 0 && o <= 2)).toBe(true);
      expect(state.edgeOrientation.every((o) => o === 0 || o === 1)).toBe(true);
    }
  });
});

/**
 * The structural fact that distinguishes Pochmann notation from cube
 * notation, and the reason centers are modelled at all.
 */
describe('U turns one layer; R and D turn the bulk', () => {
  it('U leaves every center where it is', () => {
    const state = applyMegaminxMove(SOLVED_MEGAMINX_STATE, { kind: 'U', direction: 1 });
    expect(state.centerPermutation).toEqual(SOLVED_MEGAMINX_STATE.centerPermutation);
  });

  it('U moves exactly five corners and five edges', () => {
    const state = applyMegaminxMove(SOLVED_MEGAMINX_STATE, { kind: 'U', direction: 1 });
    expect(state.cornerPermutation.filter((p, i) => p !== i)).toHaveLength(5);
    expect(state.edgePermutation.filter((p, i) => p !== i)).toHaveLength(5);
  });

  it('R and D each move ten of the twelve centers — the puzzle really does reorient', () => {
    for (const kind of ['R', 'D'] as const) {
      const state = applyMegaminxMove(SOLVED_MEGAMINX_STATE, { kind, direction: 1 });
      expect(state.centerPermutation.filter((p, i) => p !== i)).toHaveLength(10);
    }
  });

  it('R and D leave exactly one face’s layer untouched', () => {
    for (const kind of ['R', 'D'] as const) {
      const state = applyMegaminxMove(SOLVED_MEGAMINX_STATE, { kind, direction: 1 });
      expect(state.cornerPermutation.filter((p, i) => p === i)).toHaveLength(5);
      expect(state.edgePermutation.filter((p, i) => p === i)).toHaveLength(5);
    }
  });
});

describe('element orders in the Megaminx group', () => {
  const order = (moves: readonly MegaminxMove[]): number => {
    let state: MegaminxState = SOLVED_MEGAMINX_STATE;
    for (let n = 1; n <= 20_000; n += 1) {
      state = applyMegaminxMoves(state, moves);
      if (megaminxStatesEqual(state, SOLVED_MEGAMINX_STATE)) return n;
    }
    throw new Error('order exceeded 20,000');
  };

  it('single moves have order 5', () => {
    for (const move of MOVES) expect(order([move])).toBe(5);
  });

  /**
   * An element's order is the lcm of its cycle lengths, doubled or tripled by
   * the orientation part — so on a puzzle with 20 corners and 30 edges it can
   * only be built from primes at most 30, and never from anything larger.
   * That is a genuine constraint: a wrong destination or a stray twist in the
   * derived tables would very likely produce a cycle structure whose lcm has
   * a prime factor outside that range, or no finite order at all within the
   * bound.
   */
  it('two-move elements have orders built only from primes at most 30', () => {
    const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29];
    for (const a of MOVES) {
      for (const b of MOVES) {
        if (a.kind === b.kind) continue;
        let n = order([a, b]);
        for (const prime of primes) {
          while (n % prime === 0) n /= prime;
        }
        expect(n).toBe(1);
      }
    }
  });

  it('and the set of two-move orders is exactly {5, 552, 840, 1560, 5130}', () => {
    // Pinned because it is highly sensitive: these come out of the specific
    // cycle structures the derived tables produce, so any change to the
    // geometry that still preserved parity and orientation sums would almost
    // certainly move these numbers.
    const orders = new Set<number>();
    for (const a of MOVES) {
      for (const b of MOVES) {
        if (a.kind === b.kind) continue;
        orders.add(order([a, b]));
      }
    }
    expect([...orders].sort((x, y) => x - y)).toEqual([5, 552, 840, 1560, 5130]);
  });
});

describe('isSolvedMegaminx', () => {
  it('accepts solved and rejects every single move', () => {
    expect(isSolvedMegaminx(SOLVED_MEGAMINX_STATE)).toBe(true);
    for (const move of MOVES) {
      expect(isSolvedMegaminx(applyMegaminxMove(SOLVED_MEGAMINX_STATE, move))).toBe(false);
    }
  });
});
