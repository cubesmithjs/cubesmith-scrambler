import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { skewbCoordinateStates, toSkewbCoordinate } from './coordinates';
import { buildPruningTableSkewb, distanceSkewb, UNVISITED_DISTANCE_SKEWB } from './pruning';
import { randomSkewbState } from './random-state';
import { allMovesSkewb } from './notation';
import { applySkewbMoves, SOLVED_SKEWB_STATE } from './state';

const table = buildPruningTableSkewb();
const MOVES = allMovesSkewb();

/**
 * Because the coordinate space was built from the reachable set, full
 * coverage here is a real claim: it is what proves the corner projection
 * (8,748) and the center projection (360) are independent — their sizes
 * were discovered separately, and only the BFS reaching every one of their
 * 3,149,280 combinations rules out a constraint tying the two together.
 */
describe('the pruning BFS covers the entire coordinate space', () => {
  it('leaves no entry unvisited', () => {
    let unvisited = 0;
    for (const d of table) if (d === UNVISITED_DISTANCE_SKEWB) unvisited += 1;
    expect(unvisited).toBe(0);
    expect(table.length).toBe(skewbCoordinateStates());
    expect(table.length).toBe(3_149_280);
  });

  it("reproduces God's number for the Skewb: 11 turns", () => {
    let max = 0;
    for (const d of table) if (d > max) max = d;
    expect(max).toBe(11);
  });

  it('solved is the only state at distance 0, and the eight neighbours are at distance 1', () => {
    expect(distanceSkewb(toSkewbCoordinate(SOLVED_SKEWB_STATE))).toBe(0);
    let zeros = 0;
    for (const d of table) if (d === 0) zeros += 1;
    expect(zeros).toBe(1);

    for (const move of MOVES) {
      expect(distanceSkewb(toSkewbCoordinate(applySkewbMoves(SOLVED_SKEWB_STATE, [move])))).toBe(1);
    }
  });

  it('every distance from 0 to 11 actually occurs', () => {
    const seen = new Set(table);
    for (let d = 0; d <= 11; d += 1) expect(seen.has(d)).toBe(true);
    expect(seen.size).toBe(12);
  });
});

/**
 * The table holds exact distances, so a neighbour can never differ by more
 * than one and every non-solved state must have a strictly closer
 * neighbour. Equal-distance neighbours are legitimate — the Cayley graph
 * has odd cycles, since every turn has order 3.
 */
describe('distances are exact and consistent under every move', () => {
  it('no move changes the distance by more than one, and a step down always exists', () => {
    const random = createRandomSource('skewb-distance-consistency');
    for (let trial = 0; trial < 500; trial += 1) {
      const state = randomSkewbState(random);
      const d = distanceSkewb(toSkewbCoordinate(state));

      let sawDecrease = false;
      for (const move of MOVES) {
        const next = distanceSkewb(toSkewbCoordinate(applySkewbMoves(state, [move])));
        expect(Math.abs(next - d)).toBeLessThanOrEqual(1);
        if (next === d - 1) sawDecrease = true;
      }
      expect(sawDecrease || d === 0).toBe(true);
    }
  });
});
