import { describe, expect, it } from 'vitest';
import { mayFollow, moveIndexFto, OPPOSITE_FACE } from './coordinates';
import { FTO_FACES, ftoMovesToString, parseFtoScramble, type FtoMove } from './notation';
import {
  BLOCK,
  PHASE2_TARGETS,
  phase1Projections,
  phase2Projections,
  phase3Projections,
} from './phases';
import { cancelFtoMoves } from './search';

const index = (move: FtoMove): number => moveIndexFto(move.face, move.amount);
const cancel = (text: string): string =>
  ftoMovesToString(
    cancelFtoMoves(parseFtoScramble(text).map(index)).map((m) => ({
      face: FTO_FACES[m >> 1]!,
      amount: ((m & 1) + 1) as 1 | 2,
    })),
  );

describe('mayFollow', () => {
  it('never lets a face follow itself', () => {
    for (let m = 0; m < 16; m += 1) {
      expect(mayFollow(m, m ^ 1)).toBe(false);
      expect(mayFollow(m, m)).toBe(false);
    }
  });

  it('tries two opposite faces in one order only, lower face index first', () => {
    const u = moveIndexFto('U', 1);
    const d = moveIndexFto('D', 1);
    expect(mayFollow(u, d)).toBe(true);
    expect(mayFollow(d, u)).toBe(false);
  });

  it('pairs each face with the one it shares no piece with', () => {
    const name = (f: number): string => FTO_FACES[f]!;
    expect(OPPOSITE_FACE.map((o, f) => `${name(f)}-${name(o)}`)).toEqual([
      'U-D', 'F-B', 'R-BL', 'L-BR', 'B-F', 'D-U', 'BR-L', 'BL-R',
    ]);
  });
});

describe('cancelFtoMoves', () => {
  it.each([
    ['U U', "U'"],
    ["U U'", ''],
    ['U U U', ''],
    ["R U U' R", "R'"],
    ['U D U', "U' D"],
    ["F B F'", 'B'],
    ["U BR' F", "U BR' F"],
  ])('%j → %j', (input, expected) => {
    expect(cancel(input)).toBe(expected);
  });
});

/**
 * The sizes each projection's BFS lands on, and the goal fractions, against
 * the figures xyzzy published for the same three-phase structure
 * (`fto_event_plan/01-solver-design.md` §2). Matching them is the evidence the
 * phases are the ones that design describes; nothing here copies them.
 */
describe('the phases', () => {
  it('solve a block of one corner, four edges and four centres first', () => {
    expect(BLOCK.edges).toHaveLength(4);
    expect(BLOCK.centreA).toHaveLength(2);
    expect(BLOCK.centreB).toHaveLength(2);
  });

  it('solve three edges and six centres in phase 2', () => {
    expect(PHASE2_TARGETS.edges).toHaveLength(3);
    expect(PHASE2_TARGETS.centreA).toHaveLength(3);
    expect(PHASE2_TARGETS.centreB).toHaveLength(3);
  });

  it('see 11,880 × 12 edge/corner and 18,480 centre values in phase 1', () => {
    const p = phase1Projections();
    expect([p.edges.size, p.corner.size, p.centreA.size, p.centreB.size]).toEqual([
      12 * 11 * 10 * 9, 12, 18_480, 18_480,
    ]);
  });

  it('see 336 edge, 960 corner and 25,200 centre values in phase 2', () => {
    const p = phase2Projections();
    expect([p.edges.size, p.corners.size, p.centreA.size, p.centreB.size]).toEqual([
      8 * 7 * 6, 960, 25_200, 25_200,
    ]);
  });

  it('see 210² × 60 × 24 = 63,504,000 states in phase 3 — the figure xyzzy states', () => {
    const p = phase3Projections();
    expect([p.centreA.size, p.centreB.size, p.edges.size, p.corners.size]).toEqual([210, 210, 60, 24]);
    expect(p.centreA.size * p.centreB.size * p.edges.size * p.corners.size).toBe(63_504_000);
  });

  it('closes every projection under its moves: each move is a bijection on its values', () => {
    const all = [
      ...Object.values(phase1Projections()),
      ...Object.values(phase2Projections()),
      ...Object.values(phase3Projections()),
    ];
    for (const p of all) {
      for (let k = 0; k < p.moves.length; k += 1) {
        const images = new Set(p.transition.subarray(k * p.size, (k + 1) * p.size));
        expect(images.size).toBe(p.size);
      }
    }
  });
});
