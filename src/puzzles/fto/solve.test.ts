import { beforeAll, describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import {
  ALL_MOVES_FTO,
  centreColoursValue,
  cornerPieceValue,
  edgePiecesValue,
  OPPOSITE_FACE,
} from './coordinates';
import { BLOCK_CORNER_INDEX } from './geometry';
import { FTO_FACES, parseFtoScramble, type FtoMove } from './notation';
import {
  BLOCK,
  IDENTITY_COLOURS,
  PHASE2_MOVES,
  PHASE2_TARGETS,
  PHASE3_MOVES,
  phase1Projections,
  phase1Tables,
  phase2Projections,
  phase2Tables,
  phase3Table,
  prepareFtoTables,
  RECOLOUR_A1,
  RECOLOUR_B1,
} from './phases';
import { randomFtoState } from './random-state';
import { solveFto, solveFtoInPhases } from './search';
import {
  generateFtoScramble,
  isAtLeastMovesFromSolved,
  MIN_FTO_SOLVE_DISTANCE,
} from './solve';
import {
  applyFtoMove,
  applyFtoMoves,
  centreColour,
  ftoStatesLookEqual,
  isSolvedFto,
  SOLVED_FTO_STATE,
  type FtoState,
} from './state';
import { mod3At, UNVISITED, UNVISITED_MOD3 } from './tables';

/**
 * Everything that needs the solver's tables, in one file: Vitest isolates
 * modules per file, so each file that solves pays the whole table build again
 * (6.5 s here, roughly ten times that under `--coverage`).
 */
beforeAll(() => prepareFtoTables(), 600_000);

const applyIndices = (state: FtoState, moves: readonly number[]): FtoState =>
  moves.reduce((s, m) => applyFtoMove(s, ALL_MOVES_FTO[m]!), state);

function count(table: Uint8Array, value: number): number {
  let n = 0;
  for (const v of table) if (v === value) n += 1;
  return n;
}

describe('the tables', () => {
  it('reach every entry of every phase-1 and phase-2 table', () => {
    for (const table of [...Object.values(phase1Tables()), ...Object.values(phase2Tables())]) {
      expect(count(table, UNVISITED)).toBe(0);
    }
  });

  /**
   * Every one of the 63,504,000 states the two faces' projections could combine
   * into is a state `⟨U, L⟩` really reaches — so the projections are independent,
   * and phase 2 can never arrive somewhere phase 3 cannot finish.
   */
  it('reach all 63,504,000 phase-3 states', () => {
    const table = phase3Table();
    expect(table.length).toBe(63_504_000 / 4);
    let unvisited = 0;
    for (let i = 0; i < 63_504_000; i += 1) if (mod3At(table, i) === UNVISITED_MOD3) unvisited += 1;
    expect(unvisited).toBe(0);
  });

  /**
   * Each phase's goal, as a fraction of its coordinate, against the reductions
   * xyzzy states for the same structure: phase 1 keeps `1 / 11880` of the
   * edge placements and `9 / 132` of each centre orbit's colourings; phase 2
   * keeps `1 / 336` of the edges, `1 / 120` of each centre orbit and
   * `1 / (10 · 4)` of the corners.
   */
  it('cut the coordinates by the factors the published design states', () => {
    const t1 = phase1Tables();
    const p1 = phase1Projections();
    expect(count(t1.edges, 0)).toBe(1);
    expect(count(t1.centreA, 0)).toBe((p1.centreA.size * 9) / 132);
    expect(count(t1.centreB, 0)).toBe((p1.centreB.size * 9) / 132);

    const t2 = phase2Tables();
    const p2 = phase2Projections();
    expect(count(t2.centreA, 0)).toBe(p2.centreA.size / 120);
    expect(count(t2.centreB, 0)).toBe(p2.centreB.size / 120);
    expect(count(t2.corners, 0)).toBe(p2.corners.size / 40);
  });
});

describe('solveFtoInPhases', () => {
  const states = (() => {
    const random = createRandomSource('fto-phases');
    return Array.from({ length: 25 }, () => randomFtoState(random));
  })();

  it('solves the block in phase 1', () => {
    const p = phase1Projections();
    const t = phase1Tables();
    for (const state of states) {
      const after = applyIndices(state, solveFtoInPhases(state).phase1);
      const e = p.edges.indexOf(edgePiecesValue(after, BLOCK.edges));
      const c = p.corner.indexOf(cornerPieceValue(after, BLOCK_CORNER_INDEX));
      const a = p.centreA.indexOf(centreColoursValue(after.centreA, RECOLOUR_A1));
      const b = p.centreB.indexOf(centreColoursValue(after.centreB, RECOLOUR_B1));
      expect(t.edges[e * 12 + c]).toBe(0);
      expect(t.centreA[a * 12 + c]).toBe(0);
      expect(t.centreB[b * 12 + c]).toBe(0);
    }
  });

  it('uses only U F R L in phase 2 and only U L in phase 3, and lands phase 2 in ⟨U, L⟩', () => {
    for (const state of states) {
      const { phase1, phase2, phase3 } = solveFtoInPhases(state);
      expect(phase2.every((m) => PHASE2_MOVES.includes(m))).toBe(true);
      expect(phase3.every((m) => PHASE3_MOVES.includes(m))).toBe(true);

      const after2 = applyIndices(state, [...phase1, ...phase2]);
      // Every piece U and L cannot move is solved...
      for (const slot of PHASE2_TARGETS.edges) expect(after2.edgePermutation[slot]).toBe(slot);
      for (const slot of PHASE2_TARGETS.centreA) {
        expect(centreColour(after2.centreA[slot]!)).toBe(IDENTITY_COLOURS[centreColour(slot)]);
      }
      for (const slot of PHASE2_TARGETS.centreB) {
        expect(centreColour(after2.centreB[slot]!)).toBe(IDENTITY_COLOURS[centreColour(slot)]);
      }
      // ...and phase 3, which turns only U and L, finishes it.
      expect(isSolvedFto(applyIndices(after2, phase3))).toBe(true);
    }
  });
});

describe('solveFto', () => {
  it('solves every state it is given', () => {
    const random = createRandomSource('fto-solve');
    for (let trial = 0; trial < 40; trial += 1) {
      const state = randomFtoState(random);
      expect(isSolvedFto(applyFtoMoves(state, solveFto(state)))).toBe(true);
    }
  });

  it('returns nothing to do for a solved state', () => {
    expect(solveFto(SOLVED_FTO_STATE)).toEqual([]);
  });

  it('still solves under a shuffled move order', () => {
    const random = createRandomSource('fto-order');
    const shuffled = [9, 2, 14, 7, 0, 11, 4, 15, 6, 1, 13, 3, 8, 12, 5, 10];
    for (let trial = 0; trial < 10; trial += 1) {
      const state = randomFtoState(random);
      expect(isSolvedFto(applyFtoMoves(state, solveFto(state, { moveOrder: shuffled })))).toBe(true);
    }
  });

  it('never turns a face twice running, even across a commuting opposite face', () => {
    const random = createRandomSource('fto-cancelled');
    for (let trial = 0; trial < 20; trial += 1) {
      const moves = solveFto(randomFtoState(random));
      const faces = moves.map((m) => FTO_FACES.indexOf(m.face));
      for (let i = 1; i < faces.length; i += 1) {
        expect(faces[i]).not.toBe(faces[i - 1]);
        if (i >= 2 && OPPOSITE_FACE[faces[i - 1]!] === faces[i]) {
          expect(faces[i]).not.toBe(faces[i - 2]);
        }
      }
    }
  });
});

/**
 * 🔴 Ground truth from outside this package. xyzzy's FTO solver — the one
 * cubing.js runs — states in its source that the scramble `F R U R' U' F'` has
 * "a 6-move 4-gen solution (F U R U' R' F'), but the optimal 2-gen solution is
 * 24 moves", and prints that 24-move solution. Both are facts about the *real*
 * puzzle under the established names, so they hold here only if every face name,
 * every adjacency and the turning direction match that implementation. A mirror
 * image of this model, or a reversed clockwise, fails the first assertion.
 */
describe('against the published FTO solver', () => {
  const scrambled = applyFtoMoves(SOLVED_FTO_STATE, parseFtoScramble("F R U R' U' F'"));

  it("is solved by xyzzy's 24-move ⟨U, L⟩ solution of F R U R' U' F'", () => {
    const twoGen = "U L' U L' U' L' U' L U' L U L' U L' U L U L' U' L U' L U L'";
    expect(parseFtoScramble(twoGen)).toHaveLength(24);
    expect(isSolvedFto(applyFtoMoves(scrambled, parseFtoScramble(twoGen)))).toBe(true);
  });

  it('measures that state at exactly 24 moves inside ⟨U, L⟩ — the optimum xyzzy states', () => {
    // Already in ⟨U, L⟩ with the block and phase-2 pieces solved, so phases 1
    // and 2 are empty and phase 3 — an exact descent — is the optimal 2-gen length.
    const { phase1, phase2, phase3 } = solveFtoInPhases(scrambled);
    expect([phase1.length, phase2.length, phase3.length]).toEqual([0, 0, 24]);
  });
});

describe('isAtLeastMovesFromSolved', () => {
  const u: FtoMove = { face: 'U', amount: 1 };
  const r: FtoMove = { face: 'R', amount: 2 };

  it('proves the bound by trying every shorter sequence', () => {
    expect(isAtLeastMovesFromSolved(SOLVED_FTO_STATE, 1)).toBe(false);
    const one = applyFtoMove(SOLVED_FTO_STATE, u);
    expect(isAtLeastMovesFromSolved(one, 1)).toBe(true);
    expect(isAtLeastMovesFromSolved(one, 2)).toBe(false);
    const two = applyFtoMoves(SOLVED_FTO_STATE, [u, r]);
    expect(isAtLeastMovesFromSolved(two, 2)).toBe(true);
    expect(isAtLeastMovesFromSolved(two, 3)).toBe(false);
  });

  it('is the provisional floor of two, until the regulations say otherwise', () => {
    expect(MIN_FTO_SOLVE_DISTANCE).toBe(2);
  });
});

/**
 * The gate: the scramble string, read back as text and applied to a solved
 * puzzle, gives exactly the state that was drawn — so the scramble is as
 * uniform as the draw.
 */
describe('generateFtoScramble', () => {
  it('reaches the drawn state, as the eye sees it', () => {
    for (let trial = 0; trial < 8; trial += 1) {
      const seed = `fto-gate-${trial}`;
      const drawn = randomFtoState(createRandomSource(seed));
      const scramble = generateFtoScramble(createRandomSource(seed));
      const reached = applyFtoMoves(SOLVED_FTO_STATE, parseFtoScramble(scramble));
      expect(ftoStatesLookEqual(reached, drawn), scramble).toBe(true);
      expect(isAtLeastMovesFromSolved(reached, MIN_FTO_SOLVE_DISTANCE)).toBe(true);
    }
  });

  it('is deterministic under a seed', () => {
    expect(generateFtoScramble(createRandomSource('fto-same'))).toBe(
      generateFtoScramble(createRandomSource('fto-same')),
    );
  });
});
