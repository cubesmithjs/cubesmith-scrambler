import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { permutationParity } from '../../utils/permutation';
import { randomInt } from '../../utils/random-int';
import {
  allLayerMovesPyraminx,
  inversePyraminxMoves,
  PYRAMINX_VERTICES,
  type PyraminxMove,
} from './notation';
import {
  applyPyraminxMove,
  applyPyraminxMoves,
  EDGE_COUNT_PYRAMINX,
  isSolvedPyraminx,
  pyraminxStatesEqual,
  SOLVED_PYRAMINX_STATE,
  type PyraminxState,
} from './state';

const LAYER_MOVES = allLayerMovesPyraminx();

function randomLayerSequence(seed: string, maxLength: number, trials: number): PyraminxMove[][] {
  const random = createRandomSource(seed);
  return Array.from({ length: trials }, () =>
    Array.from(
      { length: 1 + randomInt(random, maxLength) },
      () => LAYER_MOVES[randomInt(random, LAYER_MOVES.length)]!,
    ),
  );
}

describe('every layer turn has order 3', () => {
  for (const move of LAYER_MOVES) {
    it(`${move.vertex}${move.amount}`, () => {
      let state: PyraminxState = SOLVED_PYRAMINX_STATE;
      for (let i = 0; i < 3; i += 1) state = applyPyraminxMove(state, move);
      expect(pyraminxStatesEqual(state, SOLVED_PYRAMINX_STATE)).toBe(true);
    });
  }
});

describe('every tip turn has order 3 and touches nothing else', () => {
  for (const vertex of PYRAMINX_VERTICES) {
    it(`${vertex.toLowerCase()}`, () => {
      const move: PyraminxMove = { vertex, amount: 1, tip: true };
      const once = applyPyraminxMove(SOLVED_PYRAMINX_STATE, move);
      expect(once.edgePermutation).toEqual(SOLVED_PYRAMINX_STATE.edgePermutation);
      expect(once.edgeOrientation).toEqual(SOLVED_PYRAMINX_STATE.edgeOrientation);
      expect(once.axialOrientation).toEqual(SOLVED_PYRAMINX_STATE.axialOrientation);
      expect(once.tipOrientation.reduce((a, b) => a + b, 0)).toBe(1);

      let state: PyraminxState = SOLVED_PYRAMINX_STATE;
      for (let i = 0; i < 3; i += 1) state = applyPyraminxMove(state, move);
      expect(pyraminxStatesEqual(state, SOLVED_PYRAMINX_STATE)).toBe(true);
    });
  }
});

describe('tip turns commute with everything', () => {
  it('a tip turn can be moved past any layer turn without changing the result', () => {
    for (const layer of LAYER_MOVES) {
      for (const vertex of PYRAMINX_VERTICES) {
        const tip: PyraminxMove = { vertex, amount: 1, tip: true };
        const tipFirst = applyPyraminxMoves(SOLVED_PYRAMINX_STATE, [tip, layer]);
        const layerFirst = applyPyraminxMoves(SOLVED_PYRAMINX_STATE, [layer, tip]);
        expect(pyraminxStatesEqual(tipFirst, layerFirst)).toBe(true);
      }
    }
  });
});

describe('amount 2 equals two applications of amount 1', () => {
  it('holds for every vertex, for both layer and tip turns', () => {
    for (const vertex of PYRAMINX_VERTICES) {
      for (const tip of [false, true]) {
        const viaTwo = applyPyraminxMove(SOLVED_PYRAMINX_STATE, { vertex, amount: 2, tip });
        const viaOnce = applyPyraminxMoves(SOLVED_PYRAMINX_STATE, [
          { vertex, amount: 1, tip },
          { vertex, amount: 1, tip },
        ]);
        expect(pyraminxStatesEqual(viaTwo, viaOnce)).toBe(true);
      }
    }
  });
});

describe('round trip: a sequence followed by its inverse returns to solved', () => {
  it('holds for many random layer sequences', () => {
    for (const sequence of randomLayerSequence('pyraminx-round-trip', 30, 200)) {
      const scrambled = applyPyraminxMoves(SOLVED_PYRAMINX_STATE, sequence);
      const restored = applyPyraminxMoves(scrambled, inversePyraminxMoves(sequence));
      expect(pyraminxStatesEqual(restored, SOLVED_PYRAMINX_STATE)).toBe(true);
    }
  });
});

/**
 * Independent algebraic oracles — each is a property of the real puzzle's
 * group, not a restatement of what `applyPyraminxMove` computes. If the
 * derived tables had a wrong destination, a wrong flip, or a stray twist,
 * at least one of these would break.
 */
describe('group invariants hold for every reachable state', () => {
  const sequences = randomLayerSequence('pyraminx-invariants', 40, 300);

  it('edge permutation is always even', () => {
    for (const sequence of sequences) {
      const state = applyPyraminxMoves(SOLVED_PYRAMINX_STATE, sequence);
      expect(permutationParity(state.edgePermutation)).toBe(0);
    }
  });

  it('total edge flip is always even', () => {
    for (const sequence of sequences) {
      const state = applyPyraminxMoves(SOLVED_PYRAMINX_STATE, sequence);
      expect(state.edgeOrientation.reduce((a, b) => a + b, 0) % 2).toBe(0);
    }
  });

  it('each axial twist equals the net turn count of its own vertex, mod 3', () => {
    for (const sequence of sequences) {
      const state = applyPyraminxMoves(SOLVED_PYRAMINX_STATE, sequence);
      PYRAMINX_VERTICES.forEach((vertex, i) => {
        const net = sequence
          .filter((m) => m.vertex === vertex)
          .reduce((sum, m) => sum + m.amount, 0);
        expect(state.axialOrientation[i]).toBe(net % 3);
      });
    }
  });

  it('an uppercase turn carries its tip, so tip twist tracks axial twist exactly', () => {
    for (const sequence of sequences) {
      const state = applyPyraminxMoves(SOLVED_PYRAMINX_STATE, sequence);
      expect(state.tipOrientation).toEqual(state.axialOrientation);
    }
  });

  it('edge permutation is always a permutation', () => {
    for (const sequence of sequences) {
      const state = applyPyraminxMoves(SOLVED_PYRAMINX_STATE, sequence);
      expect(new Set(state.edgePermutation).size).toBe(EDGE_COUNT_PYRAMINX);
    }
  });
});

/**
 * Element orders, computed by repeated application — so these exercise the
 * *composition* of the derived tables rather than any single entry.
 *
 * The oracle is Lagrange's theorem against the independently published
 * Pyraminx group order (933,120 excluding tips, which is also what
 * `pruning.test.ts` reproduces by BFS from these same tables): the order of
 * every element must divide it. Note this is a claim about the whole state
 * including tips, and it only holds because a tip's twist is pinned to its
 * axial's — so the tip component can never extend an element's order.
 */
describe('element orders in the Pyraminx group', () => {
  const PYRAMINX_GROUP_ORDER = 933_120;

  const order = (moves: readonly PyraminxMove[]): number => {
    let state: PyraminxState = SOLVED_PYRAMINX_STATE;
    for (let n = 1; n <= 1000; n += 1) {
      state = applyPyraminxMoves(state, moves);
      if (pyraminxStatesEqual(state, SOLVED_PYRAMINX_STATE)) return n;
    }
    throw new Error('order exceeded 1000');
  };

  it('every single turn has order 3', () => {
    for (const move of LAYER_MOVES) expect(order([move])).toBe(3);
  });

  it('every one-, two- and three-turn element has an order dividing 933,120', () => {
    for (const a of LAYER_MOVES) {
      expect(PYRAMINX_GROUP_ORDER % order([a])).toBe(0);
      for (const b of LAYER_MOVES) {
        if (a.vertex === b.vertex) continue;
        expect(PYRAMINX_GROUP_ORDER % order([a, b])).toBe(0);
        for (const c of LAYER_MOVES) {
          if (b.vertex === c.vertex) continue;
          expect(PYRAMINX_GROUP_ORDER % order([a, b, c])).toBe(0);
        }
      }
    }
  });

  it('any two turns of different vertices compose to an order-15 element', () => {
    // A specific, non-obvious consequence of the puzzle's structure — the
    // product always 5-cycles the edges (order 5) while netting one turn on
    // each of two axials (order 3). Worth pinning: a wrong flip or twist in
    // the derived tables would move this off 15 without breaking parity.
    for (const a of LAYER_MOVES) {
      for (const b of LAYER_MOVES) {
        if (a.vertex === b.vertex) continue;
        expect(order([a, b])).toBe(15);
      }
    }
  });
});

describe('isSolvedPyraminx', () => {
  it('accepts solved and rejects a single turn of any kind', () => {
    expect(isSolvedPyraminx(SOLVED_PYRAMINX_STATE)).toBe(true);
    for (const vertex of PYRAMINX_VERTICES) {
      for (const tip of [false, true]) {
        expect(
          isSolvedPyraminx(applyPyraminxMove(SOLVED_PYRAMINX_STATE, { vertex, amount: 1, tip })),
        ).toBe(false);
      }
    }
  });
});
