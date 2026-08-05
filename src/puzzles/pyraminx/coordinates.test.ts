import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { allLayerMovesPyraminx } from './notation';
import {
  AXIAL_PYRAMINX_STATES,
  axialPyraminxCoord,
  decodeAxialPyraminxCoord,
  decodeEdgeOrientationPyraminxCoord,
  decodeEdgePermPyraminxCoord,
  EDGE_ORIENTATION_PYRAMINX_STATES,
  EDGE_PERM_PYRAMINX_STATES,
  edgeOrientationPyraminxCoord,
  edgePermPyraminxCoord,
  isSolvedPyraminxCoordinate,
  packPyraminxCoordinate,
  PYRAMINX_COORDINATE_STATES,
  SOLVED_PYRAMINX_COORDINATE,
  toPyraminxCoordinate,
  unpackPyraminxCoordinate,
} from './coordinates';
import { applyPyraminxMoves, SOLVED_PYRAMINX_STATE } from './state';
import {
  ALL_LAYER_MOVES_PYRAMINX,
  nextAxialPyraminx,
  nextEdgeOrientationPyraminx,
  nextEdgePermPyraminx,
} from './tables';

describe('coordinate space sizes', () => {
  it('are 720 x 64 x 81', () => {
    expect(EDGE_PERM_PYRAMINX_STATES).toBe(720);
    expect(EDGE_ORIENTATION_PYRAMINX_STATES).toBe(64);
    expect(AXIAL_PYRAMINX_STATES).toBe(81);
    expect(PYRAMINX_COORDINATE_STATES).toBe(720 * 64 * 81);
  });
});

describe('every coordinate round-trips through encode/decode', () => {
  it('edge permutation, over all 720 values', () => {
    for (let coord = 0; coord < EDGE_PERM_PYRAMINX_STATES; coord += 1) {
      expect(edgePermPyraminxCoord(decodeEdgePermPyraminxCoord(coord))).toBe(coord);
    }
  });

  it('edge orientation, over all 64 values', () => {
    for (let coord = 0; coord < EDGE_ORIENTATION_PYRAMINX_STATES; coord += 1) {
      expect(edgeOrientationPyraminxCoord(decodeEdgeOrientationPyraminxCoord(coord))).toBe(coord);
    }
  });

  it('axial orientation, over all 81 values', () => {
    for (let coord = 0; coord < AXIAL_PYRAMINX_STATES; coord += 1) {
      expect(axialPyraminxCoord(decodeAxialPyraminxCoord(coord))).toBe(coord);
    }
  });

  it('pack/unpack, over the whole flattened space (sampled)', () => {
    const random = createRandomSource('pyraminx-pack-round-trip');
    for (let trial = 0; trial < 20_000; trial += 1) {
      const index = randomInt(random, PYRAMINX_COORDINATE_STATES);
      expect(packPyraminxCoordinate(unpackPyraminxCoordinate(index))).toBe(index);
    }
  });

  it('decoded values are always in range', () => {
    for (let coord = 0; coord < EDGE_ORIENTATION_PYRAMINX_STATES; coord += 1) {
      expect(decodeEdgeOrientationPyraminxCoord(coord).every((v) => v === 0 || v === 1)).toBe(true);
    }
    for (let coord = 0; coord < AXIAL_PYRAMINX_STATES; coord += 1) {
      expect(decodeAxialPyraminxCoord(coord).every((v) => v >= 0 && v <= 2)).toBe(true);
    }
  });

  it('rejects a non-permutation', () => {
    expect(() => edgePermPyraminxCoord([0, 0, 1, 2, 3, 4])).toThrow();
    expect(() => decodeEdgePermPyraminxCoord(EDGE_PERM_PYRAMINX_STATES)).toThrow();
  });
});

describe('solved coordinate', () => {
  it('matches the solved state and is recognised', () => {
    expect(toPyraminxCoordinate(SOLVED_PYRAMINX_STATE)).toEqual(SOLVED_PYRAMINX_COORDINATE);
    expect(isSolvedPyraminxCoordinate(SOLVED_PYRAMINX_COORDINATE)).toBe(true);
    expect(isSolvedPyraminxCoordinate({ edgePerm: 1, edgeOrientation: 0, axial: 0 })).toBe(false);
    expect(isSolvedPyraminxCoordinate({ edgePerm: 0, edgeOrientation: 3, axial: 0 })).toBe(false);
    expect(isSolvedPyraminxCoordinate({ edgePerm: 0, edgeOrientation: 0, axial: 1 })).toBe(false);
  });
});

/**
 * The check that actually catches modelling bugs: for many random states and
 * every move, the coordinate tables must agree with applying that move to
 * the full state and re-encoding. A table built from a wrong decode, or a
 * coordinate that isn't really closed under the move set, fails here.
 */
describe('coordinate move tables agree with full-state move application', () => {
  it('holds for 2,000 random states x all 8 moves', () => {
    const random = createRandomSource('pyraminx-table-cross-check');
    const layerMoves = allLayerMovesPyraminx();

    for (let trial = 0; trial < 2_000; trial += 1) {
      const sequence = Array.from(
        { length: randomInt(random, 24) },
        () => layerMoves[randomInt(random, layerMoves.length)]!,
      );
      const state = applyPyraminxMoves(SOLVED_PYRAMINX_STATE, sequence);
      const coordinate = toPyraminxCoordinate(state);

      for (let m = 0; m < ALL_LAYER_MOVES_PYRAMINX.length; m += 1) {
        const direct = toPyraminxCoordinate(
          applyPyraminxMoves(state, [ALL_LAYER_MOVES_PYRAMINX[m]!]),
        );
        expect(nextEdgePermPyraminx(coordinate.edgePerm, m)).toBe(direct.edgePerm);
        expect(nextEdgeOrientationPyraminx(coordinate.edgeOrientation, m)).toBe(
          direct.edgeOrientation,
        );
        expect(nextAxialPyraminx(coordinate.axial, m)).toBe(direct.axial);
      }
    }
  });
});
