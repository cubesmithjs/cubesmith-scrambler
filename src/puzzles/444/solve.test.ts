import { describe, expect, it } from 'vitest';
import { allFaceMoves } from '../333/move-tables';
import { applyMoves as apply333 } from '../333/state';
import { createRandomSource } from '../../random/random-source';
import { randomCube444State } from './coordinates';
import { edgeFlipReference, is333Reachable, parityOf444Handoff, to333State } from './handoff';
import { areCentresSolved, areWingsPaired } from './orbits';
import { oddWingGadget, wingParityOf } from './parity';
import { reduce444 } from './reduce';
import { solve444 } from './solve';
import { apply444Moves, is444Solved, move444Tables, SOLVED_444_STATE } from './state';

const outerIndexOf = (face: string, amount: number): number =>
  move444Tables().findIndex(
    (table) => table.move.depth === 1 && table.move.face === face && table.move.amount === amount,
  );

describe('the hand-off to the 3x3x3', () => {
  it('is a homomorphism over every outer turn', () => {
    // The only real guarantee that the conversion carries the right conventions:
    // turning the 4x4x4 then converting must agree with converting then turning.
    const random = createRandomSource('444 handoff homomorphism');
    const reduced = reduce444(randomCube444State(random)).state;

    for (const faceMove of allFaceMoves()) {
      const index = outerIndexOf(faceMove.face, faceMove.amount);
      expect(index).toBeGreaterThanOrEqual(0);
      for (const base of [SOLVED_444_STATE, reduced]) {
        expect(to333State(apply444Moves(base, [index]))).toEqual(
          apply333(to333State(base), [faceMove]),
        );
      }
    }
  });

  it('reads the solved cube as the solved 3x3x3', () => {
    const handoff = to333State(SOLVED_444_STATE);
    expect(handoff.edgePermutation).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(handoff.edgeOrientation.every((flip) => flip === 0)).toBe(true);
    expect(is333Reachable(handoff)).toBe(true);
    expect(parityOf444Handoff(handoff)).toBe('none');
  });

  it('refuses a cube that is not reduced', () => {
    // A wide quarter turn breaks both invariants at once.
    const wide = move444Tables().findIndex(
      (table) => table.move.depth === 2 && table.move.amount === 1,
    );
    const scrambled = apply444Moves(SOLVED_444_STATE, [wide]);
    expect(areCentresSolved(scrambled) && areWingsPaired(scrambled)).toBe(false);
    expect(() => to333State(scrambled)).toThrow(/reduced/);
  });

  it('derives a consistent flip reference for all twelve edges', () => {
    const reference = edgeFlipReference();
    expect(reference).toHaveLength(12);
    expect(reference.every((bit) => bit === 0 || bit === 1)).toBe(true);
    // Both values occur -- if they did not, the two conventions would have agreed and
    // the correction would be doing nothing.
    expect(new Set(reference).size).toBe(2);
  });
});

describe('the parity gadget', () => {
  it('is centre-neutral and odd on the wings', () => {
    for (let index = 0; index < 3; index += 1) {
      const gadget = oddWingGadget(index);
      const landed = apply444Moves(SOLVED_444_STATE, gadget);
      expect(areCentresSolved(landed)).toBe(true);
      expect(wingParityOf(landed.wingPermutation)).toBe(1);
    }
  });

  it('gives a different sequence per index, which is what breaks the cycle', () => {
    expect(oddWingGadget(0)).not.toEqual(oddWingGadget(1));
  });
});

describe('solving a 4x4x4', () => {
  it('solves random states, verified by replaying the solution', () => {
    const random = createRandomSource('444 solve');
    for (let trial = 0; trial < 3; trial += 1) {
      const state = randomCube444State(random);
      const moves = solve444(state);
      expect(moves.length).toBeGreaterThan(0);
      expect(is444Solved(apply444Moves(state, moves))).toBe(true);
    }
  });

  it('solves the solved cube without going wrong', () => {
    expect(is444Solved(apply444Moves(SOLVED_444_STATE, solve444(SOLVED_444_STATE)))).toBe(true);
  });
});
