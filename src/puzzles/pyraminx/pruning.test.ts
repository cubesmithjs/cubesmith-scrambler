import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import {
  packPyraminxCoordinate,
  PYRAMINX_COORDINATE_STATES,
  SOLVED_PYRAMINX_COORDINATE,
  toPyraminxCoordinate,
} from './coordinates';
import {
  buildPruningTablePyraminx,
  distancePyraminx,
  UNVISITED_DISTANCE_PYRAMINX,
} from './pruning';
import { randomPyraminxState } from './random-state';
import { applyPyraminxMoves, SOLVED_PYRAMINX_STATE } from './state';
import { ALL_LAYER_MOVES_PYRAMINX } from './tables';

const table = buildPruningTablePyraminx();

/**
 * The BFS starts at solved and only ever follows real moves, so its reach is
 * *exactly* the set of physically reachable states. That makes the coverage
 * count an independent derivation of the Pyraminx's group order from the
 * move tables alone — and a proof of both constraints
 * `random-state.ts` relies on, rather than an assumption of them.
 */
describe('reachability, proved by the BFS rather than assumed', () => {
  const reachable = table.reduce(
    (count, d) => (d === UNVISITED_DISTANCE_PYRAMINX ? count : count + 1),
    0,
  );

  it('reaches exactly 933,120 states — the published Pyraminx group order (tips excluded)', () => {
    expect(reachable).toBe(933_120);
  });

  it('that is exactly a quarter of the encodable space: half the permutations x half the flip vectors', () => {
    expect(reachable * 4).toBe(PYRAMINX_COORDINATE_STATES);
    expect(reachable).toBe((720 / 2) * (64 / 2) * 81);
  });

  it('reproduces God’s number for the Pyraminx: 11 layer turns', () => {
    let max = 0;
    for (const d of table) {
      if (d !== UNVISITED_DISTANCE_PYRAMINX && d > max) max = d;
    }
    expect(max).toBe(11);
  });

  it('solved is at distance 0 and nothing else is', () => {
    expect(distancePyraminx(SOLVED_PYRAMINX_COORDINATE)).toBe(0);
    let zeros = 0;
    for (const d of table) if (d === 0) zeros += 1;
    expect(zeros).toBe(1);
  });
});

/**
 * The table holds *exact* distances, not a lower bound, which pins down its
 * behaviour under a single move far more tightly than admissibility would:
 * a neighbour can never differ by more than one, and every non-solved state
 * must have at least one neighbour strictly closer to solved. (A neighbour
 * at the *same* distance is legitimate here and not a defect — the Cayley
 * graph has odd cycles, since every turn has order 3, so it isn't
 * bipartite.)
 */
describe('distances are exact and consistent under every move', () => {
  it('no move changes the distance by more than one, and a step down always exists', () => {
    const random = createRandomSource('pyraminx-distance-consistency');
    for (let trial = 0; trial < 500; trial += 1) {
      const state = randomPyraminxState(random);
      const coordinate = toPyraminxCoordinate(state);
      const d = distancePyraminx(coordinate);
      expect(d).not.toBe(UNVISITED_DISTANCE_PYRAMINX);

      let sawDecrease = false;
      for (const move of ALL_LAYER_MOVES_PYRAMINX) {
        const next = distancePyraminx(toPyraminxCoordinate(applyPyraminxMoves(state, [move])));
        expect(next).not.toBe(UNVISITED_DISTANCE_PYRAMINX);
        expect(Math.abs(next - d)).toBeLessThanOrEqual(1);
        if (next === d - 1) sawDecrease = true;
      }
      expect(sawDecrease || d === 0).toBe(true);
    }
  });
});

describe('unreachable coordinates', () => {
  it('an odd edge permutation is never reachable', () => {
    // Swapping two edges of a solved cube is an odd permutation, so no
    // sequence of turns can produce it.
    const oddSwap = packPyraminxCoordinate({
      ...SOLVED_PYRAMINX_COORDINATE,
      edgePerm: toPyraminxCoordinate({
        ...SOLVED_PYRAMINX_STATE,
        edgePermutation: [1, 0, 2, 3, 4, 5],
      }).edgePerm,
    });
    expect(table[oddSwap]).toBe(UNVISITED_DISTANCE_PYRAMINX);
  });

  it('a single flipped edge is never reachable', () => {
    const oneFlip = packPyraminxCoordinate(
      toPyraminxCoordinate({ ...SOLVED_PYRAMINX_STATE, edgeOrientation: [1, 0, 0, 0, 0, 0] }),
    );
    expect(table[oneFlip]).toBe(UNVISITED_DISTANCE_PYRAMINX);
  });

  it('a single twisted axial IS reachable — unlike a cube corner, an axial twist is unconstrained', () => {
    // The contrast with 3x3x3 (where one twisted corner is impossible) is
    // the whole point: nothing counter-twists here. It is still nowhere
    // near free — every turn that twists this axial also cycles three
    // edges, which then have to be put back.
    const oneTwist = packPyraminxCoordinate(
      toPyraminxCoordinate({ ...SOLVED_PYRAMINX_STATE, axialOrientation: [1, 0, 0, 0] }),
    );
    expect(table[oneTwist]).not.toBe(UNVISITED_DISTANCE_PYRAMINX);
    expect(table[oneTwist]).toBe(8);
  });
});
