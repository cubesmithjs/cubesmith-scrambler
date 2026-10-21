import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { vecEquals } from '../../utils/vec3';
import { FACE_NORMALS, faceParity } from './geometry';
import { allMovesFto, FTO_FACES, type FtoMove } from './notation';
import { randomFtoState } from './random-state';
import { applyFtoMoves, ftoStatesLookEqual, SOLVED_FTO_STATE } from './state';
import {
  applyInverseSymmetry,
  applySymmetry,
  conjugateFtoState,
  ftoStateFromStickers,
  ftoStickers,
  FTO_SYMMETRIES,
  moveFromFrame,
  preservesParity,
} from './symmetry';

const MOVES = allMovesFto();

function randomWord(seed: string, length: number): FtoMove[] {
  const random = createRandomSource(seed);
  return Array.from({ length }, () => MOVES[randomInt(random, MOVES.length)]!);
}

/** The forward map: a move in the original frame, as the move it is in frame `m`. */
function moveIntoFrame(move: FtoMove, m: (typeof FTO_SYMMETRIES)[number]): FtoMove {
  const n = applySymmetry(m, FACE_NORMALS[move.face]);
  const face = FTO_FACES.find((f) => vecEquals(FACE_NORMALS[f], n))!;
  return { face, amount: (m.det === 1 ? move.amount : 3 - move.amount) as 1 | 2 };
}

describe('the 48 symmetries', () => {
  it('are 48 distinct signed permutations, 24 rotations then 24 mirrors, identity first', () => {
    expect(FTO_SYMMETRIES).toHaveLength(48);
    expect(new Set(FTO_SYMMETRIES.map((m) => `${m.axis}|${m.sign}`)).size).toBe(48);
    expect(FTO_SYMMETRIES[0]).toEqual({ axis: [0, 1, 2], sign: [1, 1, 1], det: 1 });
    expect(FTO_SYMMETRIES.slice(0, 24).every((m) => m.det === 1)).toBe(true);
    expect(FTO_SYMMETRIES.slice(24).every((m) => m.det === -1)).toBe(true);
    // The first twelve are the tetrahedral rotations — the ones keeping each centre orbit home.
    expect(FTO_SYMMETRIES.slice(0, 12).every(preservesParity)).toBe(true);
    expect(FTO_SYMMETRIES.slice(12, 24).some(preservesParity)).toBe(false);
  });

  it('each permute the eight face normals, and invert exactly', () => {
    for (const m of FTO_SYMMETRIES) {
      const images = FTO_FACES.map((f) => applySymmetry(m, FACE_NORMALS[f]).join(','));
      expect(new Set(images).size).toBe(8);
      for (const f of FTO_FACES) {
        expect(applyInverseSymmetry(m, applySymmetry(m, FACE_NORMALS[f]))).toEqual(FACE_NORMALS[f]);
        expect(Math.abs(faceParity(applySymmetry(m, FACE_NORMALS[f])))).toBe(1);
      }
    }
  });
});

describe('stickers ⇄ pieces', () => {
  it('round-trips any reachable state, as the eye sees it', () => {
    for (let trial = 0; trial < 200; trial += 1) {
      const s = randomFtoState(createRandomSource(`stickers-${trial}`));
      const back = ftoStateFromStickers(ftoStickers(s));
      expect(ftoStatesLookEqual(back, s)).toBe(true);
    }
  });

  it('shows nine stickers of each colour on any state', () => {
    const s = applyFtoMoves(SOLVED_FTO_STATE, randomWord('colours', 50));
    const counts: Record<string, number> = {};
    for (const face of ftoStickers(s)) counts[face] = (counts[face] ?? 0) + 1;
    for (const f of FTO_FACES) expect(counts[f]).toBe(9);
  });
});

/**
 * 🔴 The property the solver's frames rest on: re-expressing the state reached by
 * a word, under any symmetry, is the state reached by that word re-expressed —
 * every face carried to its image, every turn reversed if the symmetry is a
 * mirror. If this held for some symmetries and not others, a frame would quietly
 * solve the wrong puzzle.
 */
describe('conjugation', () => {
  it.each(FTO_SYMMETRIES.map((m, i) => [i, m] as const))('commutes with turning, symmetry %i', (_, m) => {
    for (let trial = 0; trial < 6; trial += 1) {
      const word = randomWord(`conjugate-${trial}`, 25);
      expect(
        ftoStatesLookEqual(
          conjugateFtoState(applyFtoMoves(SOLVED_FTO_STATE, word), m),
          applyFtoMoves(SOLVED_FTO_STATE, word.map((move) => moveIntoFrame(move, m))),
        ),
      ).toBe(true);
    }
  });

  it('maps a move back out of a frame as the inverse of mapping it in', () => {
    for (const m of FTO_SYMMETRIES) {
      for (const move of MOVES) expect(moveFromFrame(moveIntoFrame(move, m), m)).toEqual(move);
    }
  });

  it('leaves the solved state solved under every symmetry', () => {
    for (const m of FTO_SYMMETRIES) {
      expect(ftoStatesLookEqual(conjugateFtoState(SOLVED_FTO_STATE, m), SOLVED_FTO_STATE)).toBe(true);
    }
  });
});
