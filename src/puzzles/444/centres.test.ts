import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import {
  applyCentreCoordinate,
  CENTRE_COORDINATE_COUNT,
  CENTRE_PAIR_SUBSETS,
  centreCoordinateOf,
  centreDistance,
  centreTable,
  solveCentres444,
  solvedCentreCoordinate,
} from './centres';
import { randomCube444State } from './coordinates';
import {
  areCentresSolved,
  areWingsPaired,
  centrePreservingMoveIndices,
  centresOnOwnAxisPair,
  preservesSlotPairs,
} from './orbits';
import { phase1Search } from './phase1-search';
import { apply444Moves, move444Tables, SOLVED_444_STATE } from './state';

/** Phase 1 first, so the centres are on their axis pairs and the coordinate applies. */
function afterPhase1(seed: string, count: number): { state: ReturnType<typeof randomCube444State> }[] {
  const random = createRandomSource(seed);
  return Array.from({ length: count }, () => {
    const drawn = randomCube444State(random);
    return { state: apply444Moves(drawn, phase1Search(drawn)) };
  });
}

describe('the centre coordinate', () => {
  it('is 70 per axis pair and 343,000 in total', () => {
    expect(CENTRE_PAIR_SUBSETS).toBe(70);
    expect(CENTRE_COORDINATE_COUNT).toBe(343_000);
  });

  it('reads zero exactly when every centre is home', () => {
    expect(centreCoordinateOf(SOLVED_444_STATE)).toBe(solvedCentreCoordinate());
    expect(centreDistance(SOLVED_444_STATE)).toBe(0);
    expect(areCentresSolved(SOLVED_444_STATE)).toBe(true);
  });

  it('transforms under a move the same way the pieces do', () => {
    const preserving = centrePreservingMoveIndices();
    const random = createRandomSource('centre coordinate');
    for (const { state } of afterPhase1('centre transform', 6)) {
      let coordinate = centreCoordinateOf(state);
      let current = state;
      for (let step = 0; step < 15; step += 1) {
        const index = random.nextUint32() % preserving.length;
        current = apply444Moves(current, [preserving[index]!]);
        coordinate = applyCentreCoordinate(coordinate, index);
        expect(coordinate).toBe(centreCoordinateOf(current));
      }
    }
  });
});

describe('the exact centre table', () => {
  it('covers every coordinate, with exactly one at zero', () => {
    const table = centreTable();
    expect(table).toHaveLength(CENTRE_COORDINATE_COUNT);
    expect(table.indexOf(255)).toBe(-1);
    expect([...table].filter((value) => value === 0)).toHaveLength(1);
  });

  it('is a real breadth-first table, and shallow', () => {
    const table = centreTable();
    const moveCount = centrePreservingMoveIndices().length;
    const random = createRandomSource('centre bfs');
    let deepest = 0;
    for (const value of table) deepest = Math.max(deepest, value);
    expect(deepest).toBeGreaterThan(4);
    expect(deepest).toBeLessThan(16);

    for (let trial = 0; trial < 300; trial += 1) {
      const coordinate = random.nextUint32() % CENTRE_COORDINATE_COUNT;
      const here = table[coordinate]!;
      let closer = 0;
      for (let move = 0; move < moveCount; move += 1) {
        const there = table[applyCentreCoordinate(coordinate, move)]!;
        expect(Math.abs(there - here)).toBeLessThanOrEqual(1);
        if (there === here - 1) closer += 1;
      }
      if (here > 0) expect(closer).toBeGreaterThan(0);
    }
  });
});

describe('solving the centres', () => {
  it('solves them from any phase-1 state, in exactly the table distance', () => {
    for (const { state } of afterPhase1('solve centres', 8)) {
      const distance = centreDistance(state);
      const solution = solveCentres444(state);
      expect(solution).toHaveLength(distance);

      const solved = apply444Moves(state, solution);
      expect(areCentresSolved(solved)).toBe(true);
      // Phase 1's invariant is untouched, since only preserving moves were used.
      expect(centresOnOwnAxisPair(solved)).toBe(true);
    }
  });

  it('needs no moves when they are already solved', () => {
    expect(solveCentres444(SOLVED_444_STATE)).toEqual([]);
  });

  /**
   * The trap, shown rather than described. Solving the centres from a phase-1
   * state leaves the wings unpaired — and every move that could pair them is one
   * that splits a slot pair, all of which put the centres back out. That is why
   * the reduction cannot be staged as "centres, then wings", and why
   * centres-solved and wings-paired must be reached in one search.
   */
  it('leaves the wings unpaired, and nothing can pair them without undoing this', () => {
    const tables = move444Tables();
    let unpaired = 0;

    for (const { state } of afterPhase1('the trap', 6)) {
      const solved = apply444Moves(state, solveCentres444(state));
      expect(areCentresSolved(solved)).toBe(true);
      if (!areWingsPaired(solved)) unpaired += 1;

      // Every move that can change pairing splits slot pairs, and every one of
      // those unsolves the centres it was just given.
      for (const [index] of tables.entries()) {
        if (preservesSlotPairs(index)) continue;
        expect(areCentresSolved(apply444Moves(solved, [index]))).toBe(false);
      }
    }

    expect(unpaired).toBe(6);
  });
});
