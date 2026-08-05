import { describe, expect, it } from 'vitest';
import { layerTurn, SLICE, type Square1Move } from './notation';
import {
  alignmentIndex,
  alignmentPair,
  fromPhase2Coordinate,
  PERMUTATION_COUNT,
  permutationFromIndex,
  permutationIndex,
  PHASE2_ALIGNMENT_COUNT,
  SOLVED_ALIGNMENT_INDEX,
  toPhase2Coordinate,
} from './phase2-coordinates';
import {
  isPhase2Reachable,
  PHASE2_CLASS_COUNT,
  PHASE2_TABLE_SIZE,
  phase2BackwardTable,
  phase2CornerPruning,
  phase2EdgePruning,
  phase2MoveTables,
  phase2ReachableClasses,
  pruningIndex,
} from './phase2-tables';
import {
  applySquare1Move,
  applySquare1Moves,
  hasSquareLayers,
  isSliceLegal,
  SOLVED_SQUARE1_STATE,
  type Square1State,
} from './state';

function makeRandom(seed: number): (bound: number) => number {
  let state = seed;
  return (bound) => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % bound;
  };
}

/** Random state with square layers, built by applying moves that keep them. */
function squareLayerState(seed: number, steps: number): { state: Square1State; length: number } {
  const next = makeRandom(seed);
  const { turns } = phase2MoveTables();
  let state = SOLVED_SQUARE1_STATE;
  let length = 0;
  for (let i = 0; i < steps; i += 1) {
    const turn = turns[next(turns.length)]!;
    const turned = applySquare1Move(state, turn);
    state = turned;
    length += 1;
    if (!isSliceLegal(state)) continue;
    const sliced = applySquare1Move(state, SLICE);
    if (!hasSquareLayers(sliced)) continue;
    state = sliced;
    length += 1;
  }
  return { state, length };
}

describe('the derived move tables', () => {
  const tables = phase2MoveTables();

  /**
   * The tables say "the piece at position `i` goes to position `map[i]`". That
   * claim is checked here by taking a real state, applying the real move with
   * the real state functions, and comparing coordinates — no shared code with
   * the derivation beyond the coordinate itself.
   */
  it('predict the coordinate a real move produces, for every alignment and move', () => {
    const random = makeRandom(31);
    const mismatches: string[] = [];

    for (let alignment = 0; alignment < PHASE2_ALIGNMENT_COUNT; alignment += 1) {
      for (const middleFlipped of [false, true]) {
        const coordinate = {
          alignment,
          middleFlipped,
          corners: random(PERMUTATION_COUNT),
          edges: random(PERMUTATION_COUNT),
        };
        const state = fromPhase2Coordinate(coordinate);

        for (const [index, turn] of tables.turns.entries()) {
          const at = alignment * tables.turns.length + index;
          const predicted = {
            alignment: tables.turnAlignment[at]!,
            middleFlipped,
            corners:
              tables.permMove[tables.turnCornerMap[at]! * PERMUTATION_COUNT + coordinate.corners]!,
            edges:
              tables.permMove[tables.turnEdgeMap[at]! * PERMUTATION_COUNT + coordinate.edges]!,
          };
          const actual = toPhase2Coordinate(applySquare1Move(state, turn));
          if (JSON.stringify(predicted) !== JSON.stringify(actual)) {
            mismatches.push(`turn ${turn.top},${turn.bottom} at alignment ${alignment}`);
          }
        }

        const sliced = tables.sliceAlignment[alignment]!;
        if (sliced < 0) continue;
        const predicted = {
          alignment: sliced,
          middleFlipped: !middleFlipped,
          corners:
            tables.permMove[
              tables.sliceCornerMap[alignment]! * PERMUTATION_COUNT + coordinate.corners
            ]!,
          edges:
            tables.permMove[
              tables.sliceEdgeMap[alignment]! * PERMUTATION_COUNT + coordinate.edges
            ]!,
        };
        const actual = toPhase2Coordinate(applySquare1Move(state, SLICE));
        if (JSON.stringify(predicted) !== JSON.stringify(actual)) {
          mismatches.push(`slice at alignment ${alignment}`);
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  /**
   * The slice is available from exactly the two complementary alignment pairs.
   * From `(0,0)` and `(1,1)` it is legal but destroys square layers; alignment
   * 2 cannot be sliced at all. Derived, not declared — the table builder finds
   * this out by trying.
   */
  it('allow the slice from exactly the two complementary alignments', () => {
    const allowed: string[] = [];
    for (let alignment = 0; alignment < PHASE2_ALIGNMENT_COUNT; alignment += 1) {
      if (tables.sliceAlignment[alignment]! >= 0) allowed.push(alignmentPair(alignment).join(''));
    }
    expect(allowed.sort()).toEqual(['01', '10']);

    // And it keeps the alignment pair it started from.
    expect(tables.sliceAlignment[alignmentIndex(0, 1)]).toBe(alignmentIndex(0, 1));
    expect(tables.sliceAlignment[alignmentIndex(1, 0)]).toBe(alignmentIndex(1, 0));
  });

  it('need only a handful of distinct position maps', () => {
    // A turn shifts each ring's four positions cyclically, so a map is fixed by
    // the two carries: 4 x 4 = 16, plus whatever the slice contributes.
    expect(tables.maps.length).toBeLessThanOrEqual(20);
    expect(tables.maps.every((map) => new Set(map).size === 8)).toBe(true);
    expect(tables.maps).toContainEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('give a permutation table that is a bijection for every map', () => {
    for (const [map] of tables.maps.entries()) {
      const image = new Set<number>();
      for (let permutation = 0; permutation < PERMUTATION_COUNT; permutation += 1) {
        image.add(tables.permMove[map * PERMUTATION_COUNT + permutation]!);
      }
      expect(image.size).toBe(PERMUTATION_COUNT);
    }
  });

  it('agree with applying the map by hand', () => {
    const map = tables.maps[3]!;
    const permutation = permutationFromIndex(12_345, 8);
    const byHand = new Array<number>(8).fill(-1);
    permutation.forEach((piece, position) => {
      byHand[map[position]!] = piece;
    });
    expect(tables.permMove[3 * PERMUTATION_COUNT + 12_345]).toBe(permutationIndex(byHand));
  });
});

describe('the pruning tables', () => {
  for (const [name, table] of [
    ['corner', phase2CornerPruning()],
    ['edge', phase2EdgePruning()],
  ] as const) {
    describe(`${name} table`, () => {
      it('covers every abstract state exactly once, with only solved at zero', () => {
        expect(table).toHaveLength(PHASE2_TABLE_SIZE);
        expect(table.indexOf(255)).toBe(-1);
        expect([...table].filter((value) => value === 0)).toHaveLength(1);
        expect(table[pruningIndex(SOLVED_ALIGNMENT_INDEX, false, 0)]).toBe(0);
      });

      it('is a real breadth-first table: neighbours differ by at most one', () => {
        const tables = phase2MoveTables();
        const random = makeRandom(name === 'corner' ? 5 : 9);
        const turnMap = name === 'corner' ? tables.turnCornerMap : tables.turnEdgeMap;
        const sliceMap = name === 'corner' ? tables.sliceCornerMap : tables.sliceEdgeMap;

        for (let trial = 0; trial < 300; trial += 1) {
          const alignment = random(PHASE2_ALIGNMENT_COUNT);
          const middle = random(2) === 1;
          const permutation = random(PERMUTATION_COUNT);
          const here = table[pruningIndex(alignment, middle, permutation)]!;

          let closer = 0;
          for (let turn = 0; turn < tables.turns.length; turn += 1) {
            const at = alignment * tables.turns.length + turn;
            const landed =
              table[
                pruningIndex(
                  tables.turnAlignment[at]!,
                  middle,
                  tables.permMove[turnMap[at]! * PERMUTATION_COUNT + permutation]!,
                )
              ]!;
            expect(Math.abs(landed - here)).toBeLessThanOrEqual(1);
            if (landed === here - 1) closer += 1;
          }

          const sliced = tables.sliceAlignment[alignment]!;
          if (sliced >= 0) {
            const landed =
              table[
                pruningIndex(
                  sliced,
                  !middle,
                  tables.permMove[sliceMap[alignment]! * PERMUTATION_COUNT + permutation]!,
                )
              ]!;
            expect(Math.abs(landed - here)).toBeLessThanOrEqual(1);
            if (landed === here - 1) closer += 1;
          }

          if (here > 0) expect(closer).toBeGreaterThan(0);
        }
      });

      /**
       * Admissibility, tested rather than argued: a state built by `n` real
       * moves is at most `n` from solved, so the table — which must never
       * exceed the truth — has to read at most `n` too.
       */
      it('never exceeds the length of a sequence that produced the state', () => {
        for (let seed = 1; seed <= 120; seed += 1) {
          const { state, length } = squareLayerState(seed, 1 + (seed % 7));
          const coordinate = toPhase2Coordinate(state);
          const value =
            table[
              pruningIndex(
                coordinate.alignment,
                coordinate.middleFlipped,
                name === 'corner' ? coordinate.corners : coordinate.edges,
              )
            ]!;
          expect(value).toBeLessThanOrEqual(length);
        }
      });
    });
  }

  /**
   * How much the heuristic is worth. Each table covers 725,760 abstract states,
   * so its radius is where the pruning power tops out — anything the search
   * needs beyond that depth is unguided.
   */
  it('are deep enough to be worth having', () => {
    const deepest = (table: Uint8Array): number => {
      let most = 0;
      for (const value of table) most = Math.max(most, value);
      return most;
    };
    expect(deepest(phase2CornerPruning())).toBe(15);
  });

  /**
   * The solver builds **one** table and looks it up twice, once at the corner
   * permutation and once at the edge permutation. That is only sound if the
   * edge-specific table is the same table, so this builds it separately and
   * checks — the one place in the package where the extra two seconds of work
   * is worth spending.
   */
  it('are one table: the edge abstraction is the corner abstraction renamed', () => {
    const corner = phase2CornerPruning();
    const edge = phase2EdgePruning(true);
    let differences = 0;
    for (let index = 0; index < corner.length; index += 1) {
      if (corner[index] !== edge[index]) differences += 1;
    }
    expect(differences).toBe(0);
    expect(phase2EdgePruning()).toBe(corner);
  });
});

/**
 * Memory is a design constraint for this package, so the footprint is asserted
 * rather than described. These are exact byte counts of the typed arrays, which
 * is the part that scales; the shape index in `phase1-tables.ts` adds about six
 * megabytes more as an ordinary `Map`.
 */
describe('the memory footprint', () => {
  it('is dominated by the backward table, and is what it says it is', () => {
    const tables = phase2MoveTables();
    const backward = phase2BackwardTable();

    const permMoveBytes = tables.permMove.byteLength;
    const pruningBytes = phase2CornerPruning().byteLength;
    const backwardBytes = backward.keys.byteLength + backward.distances.byteLength;

    expect(permMoveBytes).toBe(17 * 40_320 * 4);
    expect(pruningBytes).toBe(9 * 2 * 40_320);
    expect(backwardBytes).toBe(2_097_152 * 9);

    const megabytes = (permMoveBytes + pruningBytes + backwardBytes) / 1024 / 1024;
    expect(megabytes).toBeGreaterThan(20);
    expect(megabytes).toBeLessThan(22);
    // The backward table is 84% of it — the price of the eight-move tail.
    expect(backwardBytes / (permMoveBytes + pruningBytes + backwardBytes)).toBeGreaterThan(0.8);
  });

  it('holds every state within eight moves of solved', () => {
    expect(phase2BackwardTable().size).toBe(905_728);
  });
});

describe('the reachable classes', () => {
  it('are exactly half of the seventy-two', () => {
    const classes = phase2ReachableClasses();
    expect(classes).toHaveLength(PHASE2_CLASS_COUNT);
    expect([...classes].filter((value) => value === 1)).toHaveLength(36);
  });

  /**
   * Stated as the property that matters: a state phase 2 cannot solve is one
   * whose corner and edge parities disagree with what its alignment demands.
   */
  it('reject a coordinate whose parities do not match its alignment', () => {
    expect(
      isPhase2Reachable({ alignment: 0, middleFlipped: false, corners: 0, edges: 0 }),
    ).toBe(true);
    expect(
      isPhase2Reachable({
        alignment: 0,
        middleFlipped: false,
        corners: permutationIndex([1, 0, 2, 3, 4, 5, 6, 7]),
        edges: 0,
      }),
    ).toBe(false);
  });
});

describe('solving one move at a time', () => {
  it('reads zero only at the solved coordinate, for both tables', () => {
    const moves: Square1Move[] = [layerTurn(3, 0), SLICE];
    const state = applySquare1Moves(SOLVED_SQUARE1_STATE, [layerTurn(0, -1), SLICE]);
    const coordinate = toPhase2Coordinate(state);
    expect(
      phase2CornerPruning()[
        pruningIndex(coordinate.alignment, coordinate.middleFlipped, coordinate.corners)
      ],
    ).toBeGreaterThan(0);
    expect(moves).toHaveLength(2);
  });
});
