import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import {
  CORNER_ORIENTATION_STATES,
  EDGE_ORIENTATION_STATES,
  UD_SLICE_STATES,
  cornerOrientationCoord,
  decodeCornerOrientationCoord,
  decodeEdgeOrientationCoord,
  decodeUdSliceCoord,
  edgeOrientationCoord,
  isInG1,
  toPhase1Coordinate,
  udSliceCoord,
} from './coordinates';
import { randomState } from './random-state';
import { applyMoves, SOLVED_STATE } from './state';
import { allFaceMoves } from './move-tables';

describe('cornerOrientationCoord / decodeCornerOrientationCoord', () => {
  it('the solved orientation encodes to 0', () => {
    expect(cornerOrientationCoord(SOLVED_STATE.cornerOrientation)).toBe(0);
  });

  it('round-trips every orientation produced by randomState', () => {
    const random = createRandomSource('corner-coord-roundtrip');
    for (let i = 0; i < 300; i += 1) {
      const state = randomState(random);
      const coord = cornerOrientationCoord(state.cornerOrientation);
      expect(coord).toBeGreaterThanOrEqual(0);
      expect(coord).toBeLessThan(CORNER_ORIENTATION_STATES);
      expect(decodeCornerOrientationCoord(coord)).toEqual(state.cornerOrientation);
    }
  });

  it('every coordinate in range decodes to a valid, re-encodable orientation', () => {
    for (let coord = 0; coord < CORNER_ORIENTATION_STATES; coord += 37) {
      const decoded = decodeCornerOrientationCoord(coord);
      expect(decoded.reduce((a, b) => a + b, 0) % 3).toBe(0);
      expect(cornerOrientationCoord(decoded)).toBe(coord);
    }
  });
});

describe('edgeOrientationCoord / decodeEdgeOrientationCoord', () => {
  it('the solved orientation encodes to 0', () => {
    expect(edgeOrientationCoord(SOLVED_STATE.edgeOrientation)).toBe(0);
  });

  it('round-trips every orientation produced by randomState', () => {
    const random = createRandomSource('edge-coord-roundtrip');
    for (let i = 0; i < 300; i += 1) {
      const state = randomState(random);
      const coord = edgeOrientationCoord(state.edgeOrientation);
      expect(coord).toBeGreaterThanOrEqual(0);
      expect(coord).toBeLessThan(EDGE_ORIENTATION_STATES);
      expect(decodeEdgeOrientationCoord(coord)).toEqual(state.edgeOrientation);
    }
  });

  it('every coordinate in range decodes to a valid, re-encodable orientation', () => {
    for (let coord = 0; coord < EDGE_ORIENTATION_STATES; coord += 37) {
      const decoded = decodeEdgeOrientationCoord(coord);
      expect(decoded.reduce((a, b) => a + b, 0) % 2).toBe(0);
      expect(edgeOrientationCoord(decoded)).toBe(coord);
    }
  });
});

describe('udSliceCoord / decodeUdSliceCoord', () => {
  it('is a value in range for the solved state', () => {
    const coord = udSliceCoord(SOLVED_STATE.edgePermutation);
    expect(coord).toBeGreaterThanOrEqual(0);
    expect(coord).toBeLessThan(UD_SLICE_STATES);
  });

  it('round-trips: decoding the solved coordinate gives positions [8,9,10,11]', () => {
    const coord = udSliceCoord(SOLVED_STATE.edgePermutation);
    expect(decodeUdSliceCoord(coord)).toEqual([8, 9, 10, 11]);
  });

  it('round-trips for every udSliceCoord value, 0 through 494', () => {
    for (let coord = 0; coord < UD_SLICE_STATES; coord += 1) {
      const positions = decodeUdSliceCoord(coord);
      expect(positions).toHaveLength(4);
      // Build a permutation whose slice pieces (8-11) sit exactly at `positions`.
      const perm = new Array<number>(12).fill(-1);
      const nonSlicePositions = Array.from({ length: 12 }, (_, i) => i).filter(
        (i) => !positions.includes(i),
      );
      positions.forEach((pos, i) => {
        perm[pos] = 8 + i;
      });
      nonSlicePositions.forEach((pos, i) => {
        perm[pos] = i;
      });
      expect(udSliceCoord(perm)).toBe(coord);
    }
  });

  it('throws for a coordinate out of range', () => {
    expect(() => decodeUdSliceCoord(-1)).toThrow();
    expect(() => decodeUdSliceCoord(UD_SLICE_STATES)).toThrow();
  });

  it('agrees with a brute-force count of positions holding slice pieces, over many random states', () => {
    const random = createRandomSource('udslice-cross-check');
    for (let i = 0; i < 300; i += 1) {
      const state = randomState(random);
      const bruteForcePositions = state.edgePermutation
        .map((piece, pos) => ({ piece, pos }))
        .filter(({ piece }) => piece >= 8)
        .map(({ pos }) => pos);
      expect(decodeUdSliceCoord(udSliceCoord(state.edgePermutation))).toEqual(bruteForcePositions);
    }
  });
});

describe('toPhase1Coordinate / isInG1', () => {
  it('the solved state is in G1', () => {
    expect(isInG1(toPhase1Coordinate(SOLVED_STATE))).toBe(true);
  });

  it('U/D moves (any amount) and half-turns of every face stay in G1; quarter turns of F/B/L/R leave it', () => {
    // U/D never twist corners, flip edges, or touch a slice edge regardless
    // of amount. A half turn of *any* face doesn't either — 180° is two
    // quarter twists whose corner-twist deltas cancel (a well-known cube
    // fact: only quarter turns twist/flip; half turns only permute), and it
    // pairs each face's two slice edges with each other rather than moving
    // either out of the slice. Quarter/counterclockwise-quarter turns of
    // F/B/L/R are the only moves that actually leave G1.
    for (const move of allFaceMoves()) {
      const state = applyMoves(SOLVED_STATE, [move]);
      const inG1 = isInG1(toPhase1Coordinate(state));
      const staysInG1 = move.face === 'U' || move.face === 'D' || move.amount === 2;
      expect(inG1).toBe(staysInG1);
    }
  });

  it('is false for random (generally not-in-G1) scrambled states', () => {
    const random = createRandomSource('g1-check');
    let sawNotInG1 = false;
    for (let i = 0; i < 50; i += 1) {
      const moves = Array.from({ length: 15 }, () => {
        const all = allFaceMoves();
        return all[randomInt(random, all.length)]!;
      });
      const state = applyMoves(SOLVED_STATE, moves);
      if (!isInG1(toPhase1Coordinate(state))) sawNotInG1 = true;
    }
    expect(sawNotInG1).toBe(true);
  });
});
