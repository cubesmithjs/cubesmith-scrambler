import { beforeAll, describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { CUBINGJS_FTO_SCRAMBLES } from './__tests__/cubingjs-reference';
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
import { SEARCH, solveFto, solveFtoInPhases } from './search';
import { conjugateFtoState } from './symmetry';
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

/**
 * Runs `work` with the solver restricted to `frames` symmetry frames. The
 * identity alone is what a test wants when its claim is about the plain
 * three-phase structure — an exact phase-3 length, a reference figure — rather
 * than about the shortest answer the frames can find.
 */
function withFrames<T>(frames: number, work: () => T): T {
  const saved = SEARCH.frames;
  SEARCH.frames = frames;
  try {
    return work();
  } finally {
    SEARCH.frames = saved;
  }
}

/**
 * The phases are checked in the frame the solver chose to solve in: the state
 * is re-expressed there first (`symmetry.ts`), and that is the state phase 1
 * sees, so it is the state each phase's claim is about.
 */
describe('solveFtoInPhases', () => {
  const states = (() => {
    const random = createRandomSource('fto-phases');
    return Array.from({ length: 25 }, () => randomFtoState(random));
  })();

  it('solves the block in phase 1', () => {
    const p = phase1Projections();
    const t = phase1Tables();
    for (const state of states) {
      const { frame, phase1 } = solveFtoInPhases(state);
      const after = applyIndices(conjugateFtoState(state, frame), phase1);
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
      const { frame, phase1, phase2, phase3 } = solveFtoInPhases(state);
      expect(phase2.every((m) => PHASE2_MOVES.includes(m))).toBe(true);
      expect(phase3.every((m) => PHASE3_MOVES.includes(m))).toBe(true);

      const after2 = applyIndices(conjugateFtoState(state, frame), [...phase1, ...phase2]);
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
    // Twenty here, because each solve tries 24 frames and this file runs under
    // coverage; the volume claim is the 10,000-scramble run in `fto-design.md` §6.
    const random = createRandomSource('fto-solve');
    for (let trial = 0; trial < 20; trial += 1) {
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
    for (let trial = 0; trial < 10; trial += 1) {
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
    // Already in ⟨U, L⟩ with the block and phase-2 pieces solved, so — in the
    // identity frame — phases 1 and 2 are empty and phase 3, an exact descent, is
    // the optimal 2-gen length.
    const { phase1, phase2, phase3 } = withFrames(1, () => solveFtoInPhases(scrambled));
    expect([phase1.length, phase2.length, phase3.length]).toEqual([0, 0, 24]);
  });

  it('finds something far shorter when allowed other frames — as short as the 6-move 4-gen answer', () => {
    // In a frame where those six moves are phase 1 and phase 2's business rather
    // than a 2-gen problem, the solver is no longer stuck with 24.
    const solution = solveFto(scrambled);
    expect(isSolvedFto(applyFtoMoves(scrambled, solution))).toBe(true);
    expect(solution.length).toBeLessThanOrEqual(6);
  });
});

/**
 * Scrambles from somewhere else — what a consumer pastes in. Each of cubing.js's
 * twelve is applied here and solved by this package's solver. (That cubing.js's
 * own puzzle agrees each solution solves *its* state was checked once outside the
 * suite, for 40 scrambles; see `fto-design.md` §6.)
 */
describe('scrambles this package did not write', () => {
  it("solves every cubing.js scramble", () => {
    for (const scramble of CUBINGJS_FTO_SCRAMBLES) {
      const state = applyFtoMoves(SOLVED_FTO_STATE, parseFtoScramble(scramble));
      expect(isSolvedFto(applyFtoMoves(state, solveFto(state))), scramble).toBe(true);
    }
  });
});

/**
 * The states a reduction is most likely to fumble are the ones that are almost
 * solved: a phase whose goal is already met, a block solved by accident, a
 * search whose first bound is zero. Every one- and two-move state is tried.
 */
describe('near-solved states', () => {
  it('solves all 16 one-move and all 256 two-move states', () => {
    const moves = ALL_MOVES_FTO;
    for (const a of moves) {
      const one = applyFtoMove(SOLVED_FTO_STATE, a);
      expect(isSolvedFto(applyFtoMoves(one, solveFto(one)))).toBe(true);
      for (const b of moves) {
        const two = applyFtoMove(one, b);
        expect(isSolvedFto(applyFtoMoves(two, solveFto(two)))).toBe(true);
      }
    }
  });
});

/**
 * Phase 3 stores distances **mod 3** and recovers them by descent — the one
 * place a subtle encoding bug would give a *valid but non-optimal* (or looping)
 * phase 3. So its length is checked against a brute-force optimum, found by
 * trying every `U`/`L` sequence, on states a short random `⟨U, L⟩` word makes.
 */
describe('the phase-3 descent', () => {
  it('is optimal: equals an exhaustive search over U and L on 60 random states', () => {
    const twoGen = [0, 1, 6, 7].map((m) => ALL_MOVES_FTO[m]!); // U U' L L'
    const optimal = (state: FtoState, limit: number): number => {
      const within = (s: FtoState, depth: number, last: string): boolean => {
        if (isSolvedFto(s)) return true;
        if (depth === 0) return false;
        return twoGen.some((m) => m.face !== last && within(applyFtoMove(s, m), depth - 1, m.face));
      };
      for (let d = 0; d <= limit; d += 1) if (within(state, d, '')) return d;
      throw new Error('not within the limit');
    };
    const random = createRandomSource('fto-phase3-optimal');
    for (let trial = 0; trial < 60; trial += 1) {
      const length = 1 + randomInt(random, 9);
      const word = Array.from({ length }, () => twoGen[randomInt(random, 4)]!);
      const state = applyFtoMoves(SOLVED_FTO_STATE, word);
      const { phase1, phase2, phase3 } = withFrames(1, () => solveFtoInPhases(state));
      expect([phase1.length, phase2.length]).toEqual([0, 0]);
      expect(phase3.length, word.map((m) => m.face + (m.amount === 2 ? "'" : '')).join(' ')).toBe(
        optimal(state, length),
      );
    }
  });
});

/**
 * Known answers. A seeded scramble is part of this package's behaviour: a
 * consumer who stored one, or a test fixture of theirs, expects the same string
 * back. Any change to these is a visible change and belongs in the CHANGELOG.
 */
describe('known answers', () => {
  it.each([
    ['fto-kat-0', "D' BR' D' BR D BR D BR' D BR D' BR D' BR' D' BR D BR' D B BR' D BL' BR' D BL D' BR' BL' U' BR' R' B' L BL D' L'"],
    ['fto-kat-1', "L F L' F' L F L F' L' F' L F L F L' F L F' L' F' L R L' R F' U R F' L' R' F' BR' D R L B' BR' F' R"],
    [2027, "R BR R' BR' R' BR' R' BR' R BR R' BR' R' BR R BR' R F' R F' D R F' R F' BR' D R' D U L' R' U' L' R' BR' D' B"],
  ] as const)('seed %j gives the same scramble it always has', async (seed, expected) => {
    const { generateScramble } = await import('../../index');
    expect((await generateScramble('fto', { seed })).moves).toBe(expected);
  });

  it('draws from the crypto source when no seed is given, and still meets every rule', async () => {
    const { generateScramble } = await import('../../index');
    for (let i = 0; i < 3; i += 1) {
      const { moves } = await generateScramble('fto');
      const reached = applyFtoMoves(SOLVED_FTO_STATE, parseFtoScramble(moves));
      expect(isAtLeastMovesFromSolved(reached, MIN_FTO_SOLVE_DISTANCE)).toBe(true);
      expect(isSolvedFto(applyFtoMoves(reached, solveFto(reached)))).toBe(true);
    }
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

  it('draws a seeded batch through the public API that is reproducible and all distinct', async () => {
    const { generateScrambles } = await import('../../index');
    const a = await generateScrambles('fto', 5, { seed: 'fto-batch' });
    const b = await generateScrambles('fto', 5, { seed: 'fto-batch' });
    expect(a.map((r) => r.moves)).toEqual(b.map((r) => r.moves));
    expect(new Set(a.map((r) => r.moves)).size).toBe(5);
    for (const result of a) expect(result.quality).toBe('random-state');
  });
});
