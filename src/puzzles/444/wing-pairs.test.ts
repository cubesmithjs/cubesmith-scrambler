import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { centreDistance } from './centres';
import { randomCube444State } from './coordinates';
import { areWingsPaired, centrePreservingMoveIndices } from './orbits';
import { phase1Search } from './phase1-search';
import { apply444Moves, move444Tables, SOLVED_444_STATE } from './state';
import {
  rankWingPositions,
  WING_PAIR_COORDINATE_COUNT,
  WING_PAIR_GROUPS,
  wingPairDistance,
  wingPairLowerBound,
  wingPairTable,
  rankSingleEdge,
  SINGLE_EDGE_COORDINATE_COUNT,
  singleEdgeDistance,
  singleEdgeFromRank,
  singleEdgeTable,
  wingPositionsFromRank,
  wingPositionsOf,
} from './wing-pairs';

describe('the wing-pair coordinate', () => {
  it('ranks four distinct slots bijectively over 255,024', () => {
    expect(WING_PAIR_COORDINATE_COUNT).toBe(255_024);
    for (let rank = 0; rank < WING_PAIR_COORDINATE_COUNT; rank += 331) {
      const positions = wingPositionsFromRank(rank);
      expect(new Set(positions).size).toBe(4);
      expect(rankWingPositions(positions)).toBe(rank);
    }
  });

  it('covers all twelve edges in six disjoint groups', () => {
    expect(WING_PAIR_GROUPS).toHaveLength(6);
    const seen = WING_PAIR_GROUPS.flat();
    expect(seen).toHaveLength(24);
    expect(new Set(seen).size).toBe(24);
  });

  it('reads a group of positions off the state the way the moves move them', () => {
    const random = createRandomSource('wing positions');
    const preserving = centrePreservingMoveIndices();
    const tables = move444Tables();
    let state = SOLVED_444_STATE;
    let positions = wingPositionsOf(state, WING_PAIR_GROUPS[2]!);
    for (let step = 0; step < 20; step += 1) {
      const move = preserving[random.nextUint32() % preserving.length]!;
      state = apply444Moves(state, [move]);
      positions = positions.map((slot) => tables[move]!.wingDestination[slot]!);
      expect(wingPositionsOf(state, WING_PAIR_GROUPS[2]!)).toEqual(positions);
    }
  });
});

describe('the wing-pair tables', () => {
  it('is exact, complete, and has radius 6', () => {
    const table = wingPairTable(0);
    expect(table).toHaveLength(WING_PAIR_COORDINATE_COUNT);
    expect(table.indexOf(255)).toBe(-1);
    let deepest = 0;
    for (const value of table) deepest = Math.max(deepest, value);
    expect(deepest).toBe(6);
    // 528 paired arrangements are the multi-source goal: 12 x 11 slot-pair
    // choices, two orders within each.
    expect([...table].filter((value) => value === 0)).toHaveLength(528);
  });

  it('reads zero exactly when both edges of the group are paired', () => {
    for (let index = 0; index < WING_PAIR_GROUPS.length; index += 1) {
      expect(wingPairDistance(SOLVED_444_STATE, index)).toBe(0);
    }
    expect(wingPairLowerBound(SOLVED_444_STATE)).toBe(0);
    expect(areWingsPaired(SOLVED_444_STATE)).toBe(true);
  });

  it('never exceeds the length of a sequence that produced the state', () => {
    const preserving = centrePreservingMoveIndices();
    const random = createRandomSource('wing admissible');
    for (let trial = 0; trial < 40; trial += 1) {
      const length = 1 + (trial % 6);
      const state = apply444Moves(
        SOLVED_444_STATE,
        Array.from({ length }, () => preserving[random.nextUint32() % preserving.length]!),
      );
      expect(wingPairLowerBound(state)).toBeLessThanOrEqual(length);
    }
  });
});

/**
 * The measurement that rules out the joint search, recorded so it is not
 * rediscovered. Each component table is shallow — the wing groups have radius 6,
 * the centres about 12 — so `max` over all seven can never report more than about
 * nine. The reduction itself has to solve the centres *and* pair twelve edges,
 * which is far deeper than that, so the gap between bound and truth is wide
 * enough that iterative deepening over it is hopeless: the move set branches
 * about twenty per move.
 *
 * The conclusion is architectural, not a tuning matter: the reduction has to be
 * **staged**, pairing edges in groups with sequences that preserve what is
 * already done, rather than searched in one go. `docs/444-design.md` §6 records
 * it.
 */
describe('why the joint search is not viable', () => {
  it('has a bound that stays near nine while the problem is far deeper', () => {
    const random = createRandomSource('joint bound');
    const bounds: number[] = [];

    for (let trial = 0; trial < 6; trial += 1) {
      const drawn = randomCube444State(random);
      const opened = apply444Moves(drawn, phase1Search(drawn));
      bounds.push(Math.max(centreDistance(opened), wingPairLowerBound(opened)));
      // Not one of the twelve edges is paired at this point, so the remaining work
      // is the whole reduction rather than a finishing touch.
      expect(areWingsPaired(opened)).toBe(false);
    }

    expect(Math.max(...bounds)).toBeLessThanOrEqual(12);
  });
});

/**
 * The first input to the staged reduction: what pairing **one** edge costs, on its
 * own. A stage that pairs one more edge cannot be cheaper than this, and the
 * number sets the scale for how long a staged solution will be.
 */
describe('pairing a single edge', () => {
  it('has a 552-entry coordinate that ranks bijectively', () => {
    expect(SINGLE_EDGE_COORDINATE_COUNT).toBe(552);
    for (let rank = 0; rank < SINGLE_EDGE_COORDINATE_COUNT; rank += 1) {
      const [first, second] = singleEdgeFromRank(rank);
      expect(first).not.toBe(second);
      expect(rankSingleEdge(first, second)).toBe(rank);
    }
  });

  it('is complete and shallow', () => {
    const table = singleEdgeTable();
    expect(table).toHaveLength(SINGLE_EDGE_COORDINATE_COUNT);
    expect(table.indexOf(255)).toBe(-1);
    let deepest = 0;
    for (const value of table) deepest = Math.max(deepest, value);
    // 24 paired arrangements: twelve slot pairs, two orders each.
    expect([...table].filter((value) => value === 0)).toHaveLength(24);
    expect(deepest).toBeLessThanOrEqual(4);
    expect(deepest).toBeGreaterThan(1);
  });

  it('reads zero for every edge of a solved cube, and never exceeds the group bound', () => {
    for (let edge = 0; edge < 12; edge += 1) {
      expect(singleEdgeDistance(SOLVED_444_STATE, edge)).toBe(0);
    }

    const random = createRandomSource('single vs group');
    for (let trial = 0; trial < 6; trial += 1) {
      const drawn = randomCube444State(random);
      const opened = apply444Moves(drawn, phase1Search(drawn));
      for (let group = 0; group < WING_PAIR_GROUPS.length; group += 1) {
        const edges = [2 * group, 2 * group + 1];
        const single = Math.max(...edges.map((edge) => singleEdgeDistance(opened, edge)));
        // Pairing two edges is at least as hard as pairing the harder one alone.
        expect(wingPairDistance(opened, group)).toBeGreaterThanOrEqual(single);
      }
    }
  });
});
