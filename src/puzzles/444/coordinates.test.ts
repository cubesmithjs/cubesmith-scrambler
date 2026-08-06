import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { wideMoveToString } from '../nxn/notation';
import { applyWideMoves, solvedCubeNxN } from '../nxn/state';
import {
  CENTRE_ARRANGEMENTS_444,
  CORNER_ORIENTATIONS_444,
  CORNER_PERMUTATIONS_444,
  CUBE_ROTATIONS,
  centreColourCounts,
  isWellFormedCube444State,
  randomCube444State,
  STATE_COUNT_444,
  WING_PERMUTATIONS_444,
} from './coordinates';
import { CENTRE_COUNT_444, CORNER_COUNT_444, SIZE_444, WING_COUNT_444 } from './pieces';
import {
  apply444Moves,
  faceletColoursOf444,
  faceletColoursOfNxN,
  from444Facelets,
  is444Solved,
  move444Tables,
  SOLVED_444_STATE,
} from './state';

function parityOf(permutation: readonly number[]): number {
  const seen = new Array<boolean>(permutation.length).fill(false);
  let transpositions = 0;
  for (let start = 0; start < permutation.length; start += 1) {
    if (seen[start]) continue;
    let length = 0;
    for (let at = start; !seen[at]; at = permutation[at]!) {
      seen[at] = true;
      length += 1;
    }
    transpositions += length - 1;
  }
  return transpositions % 2;
}

/**
 * **Checkpoint B** of `docs/444-design.md`. The design says work stops here if
 * these do not match, the way Square-1 stopped at 3,678 twistable shapes.
 */
describe('checkpoint B: the state count', () => {
  it('reproduces the published 4x4x4 position count', () => {
    expect(STATE_COUNT_444).toBe(
      7_401_196_841_564_901_869_874_093_974_498_574_336_000_000_000n,
    );
  });

  it('is that number for the reasons claimed, factor by factor', () => {
    expect(CORNER_PERMUTATIONS_444).toBe(40_320n); // 8!
    expect(CORNER_ORIENTATIONS_444).toBe(2_187n); // 3^7, not 3^8
    expect(WING_PERMUTATIONS_444).toBe(620_448_401_733_239_439_360_000n); // 24!
    // 24! / (4!)^6 — four indistinguishable centres per colour.
    expect(CENTRE_ARRANGEMENTS_444).toBe(3_246_670_537_110_000n);
    expect(CUBE_ROTATIONS).toBe(24n);
    expect(
      (CORNER_PERMUTATIONS_444 *
        CORNER_ORIENTATIONS_444 *
        WING_PERMUTATIONS_444 *
        CENTRE_ARRANGEMENTS_444) %
        CUBE_ROTATIONS,
    ).toBe(0n);
  });

  /**
   * The claim that makes `3^7` rather than `3^8` right: no sequence of moves can
   * change the corner twist total mod 3, so the eighth orientation is determined.
   */
  it('keeps the corner twist sum invariant mod 3, over long random sequences', () => {
    const tables = move444Tables();
    const random = createRandomSource('twist sum');
    for (let trial = 0; trial < 30; trial += 1) {
      const state = apply444Moves(
        SOLVED_444_STATE,
        Array.from({ length: 40 }, () => random.nextUint32() % tables.length),
      );
      expect(state.cornerOrientation.reduce((sum, twist) => sum + twist, 0) % 3).toBe(0);
    }
  });

  /**
   * The claim that makes the product need **no** correction factor: wings can be
   * permuted oddly while the corners stay even. Two moves are the witness — an
   * inner slice quarter turn, `r = Rw R'`.
   */
  it('admits odd wing permutations with even corners, so nothing divides the product', () => {
    const tables = move444Tables();
    const index = (name: string): number =>
      tables.findIndex((table) => wideMoveToString(table.move) === name);
    const sliced = apply444Moves(SOLVED_444_STATE, [index('Rw'), index("R'")]);

    expect(parityOf(sliced.wingPermutation)).toBe(1);
    expect(parityOf(sliced.cornerPermutation)).toBe(0);
    // And it really is a position of the puzzle, not an artefact of the model.
    expect(faceletColoursOf444(sliced)).toEqual(
      faceletColoursOfNxN(
        applyWideMoves(solvedCubeNxN(SIZE_444), [
          tables[index('Rw')]!.move,
          tables[index("R'")]!.move,
        ]),
      ),
    );
  });

  it('reaches both wing parities and both corner parities by moving', () => {
    const tables = move444Tables();
    const random = createRandomSource('parities');
    const seen = new Set<string>();
    for (let trial = 0; trial < 60; trial += 1) {
      const state = apply444Moves(
        SOLVED_444_STATE,
        Array.from({ length: 1 + (trial % 9) }, () => random.nextUint32() % tables.length),
      );
      seen.add(`${parityOf(state.cornerPermutation)}${parityOf(state.wingPermutation)}`);
    }
    expect([...seen].sort()).toEqual(['00', '01', '10', '11']);
  });
});

describe('the uniform draw', () => {
  it('produces well-formed states, every time', () => {
    const random = createRandomSource('444 draws');
    for (let trial = 0; trial < 300; trial += 1) {
      const state = randomCube444State(random);
      expect(isWellFormedCube444State(state)).toBe(true);
      expect(centreColourCounts(state)).toEqual([4, 4, 4, 4, 4, 4]);
    }
  });

  it('is a state the puzzle could be in, as the oracle sees it', () => {
    const random = createRandomSource('oracle view');
    for (let trial = 0; trial < 20; trial += 1) {
      const state = randomCube444State(random);
      const colours = faceletColoursOf444(state);
      // 96 facelets, sixteen of each of six colours — necessary for any position.
      const counts = new Array<number>(6).fill(0);
      for (const colour of colours) counts[colour]! += 1;
      expect(counts).toEqual([16, 16, 16, 16, 16, 16]);
    }
  });

  it('essentially never repeats, and is never solved', () => {
    const random = createRandomSource('spread');
    const seen = new Set<string>();
    for (let trial = 0; trial < 300; trial += 1) {
      const state = randomCube444State(random);
      expect(is444Solved(state)).toBe(false);
      seen.add(JSON.stringify(state));
    }
    expect(seen.size).toBe(300);
  });

  it('spreads each coordinate over its whole range', () => {
    const random = createRandomSource('marginals');
    const cornerFirst = new Set<number>();
    const wingFirst = new Set<number>();
    const centreFirst = new Set<number>();
    const twists = new Set<number>();
    for (let trial = 0; trial < 600; trial += 1) {
      const state = randomCube444State(random);
      cornerFirst.add(state.cornerPermutation[0]!);
      wingFirst.add(state.wingPermutation[0]!);
      centreFirst.add(state.centreColour[0]!);
      twists.add(state.cornerOrientation[0]!);
    }
    expect(cornerFirst.size).toBe(CORNER_COUNT_444);
    expect(wingFirst.size).toBe(WING_COUNT_444);
    expect(centreFirst.size).toBe(6);
    expect(twists.size).toBe(3);
  });

  it('is reproducible from a seed', () => {
    const first = randomCube444State(createRandomSource('seed'));
    const again = randomCube444State(createRandomSource('seed'));
    expect(again).toEqual(first);
    expect(randomCube444State(createRandomSource('other'))).not.toEqual(first);
  });

  it('rejects a malformed state rather than trusting the caller', () => {
    const state = randomCube444State(createRandomSource(1));
    expect(
      isWellFormedCube444State({
        ...state,
        cornerOrientation: [1, 0, 0, 0, 0, 0, 0, 0],
      }),
    ).toBe(false);
    expect(
      isWellFormedCube444State({ ...state, centreColour: new Array(CENTRE_COUNT_444).fill(0) }),
    ).toBe(false);
    expect(
      isWellFormedCube444State({ ...state, wingPermutation: state.wingPermutation.slice(1) }),
    ).toBe(false);
  });
});

describe('the model and the oracle agree on a drawn state', () => {
  /**
   * A drawn state is not reachable-by-construction the way a walked one is, so
   * this checks the weaker but still meaningful property: reading it out through
   * the oracle's representation and back returns the same state.
   */
  it('survives a trip through the oracle representation', () => {
    const random = createRandomSource('drawn round trip');
    const tables = move444Tables();
    for (let trial = 0; trial < 20; trial += 1) {
      // Walked rather than drawn, because only a walked state has a facelet
      // representation the oracle can produce for itself.
      const indices = Array.from({ length: 30 }, () => random.nextUint32() % tables.length);
      const oracle = applyWideMoves(
        solvedCubeNxN(SIZE_444),
        indices.map((index) => tables[index]!.move),
      );
      const pieces = from444Facelets(oracle);
      expect(isWellFormedCube444State(pieces)).toBe(true);
      expect(faceletColoursOf444(pieces)).toEqual(faceletColoursOfNxN(oracle));
    }
  });
});
