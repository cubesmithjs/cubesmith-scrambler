import { describe, expect, it } from 'vitest';
import type { FaceMove } from '../../notation/move';
import {
  endRestrictions,
  isForbiddenFirstMove,
  isForbiddenLastMove,
  NO_END_RESTRICTIONS,
} from './search-restrictions';

const R: FaceMove = { face: 'R', amount: 1 };
const L2: FaceMove = { face: 'L', amount: 2 };
const F: FaceMove = { face: 'F', amount: 1 };

describe('isForbiddenFirstMove', () => {
  it('bars the named axis', () => {
    expect(isForbiddenFirstMove(R, { firstMoveAxis: 'RL' })).toBe(true);
  });

  it('bars the opposite face too — it is an axis, not a face', () => {
    // The whole reason `Axis` exists. `R` and `L2` commute, so allowing one
    // and barring the other would leave the printed order arbitrary.
    expect(isForbiddenFirstMove(L2, { firstMoveAxis: 'RL' })).toBe(true);
  });

  it('allows every other axis', () => {
    expect(isForbiddenFirstMove(F, { firstMoveAxis: 'RL' })).toBe(false);
  });

  it('allows everything when no restriction is given', () => {
    expect(isForbiddenFirstMove(R, NO_END_RESTRICTIONS)).toBe(false);
    expect(isForbiddenFirstMove(R, { lastMoveAxis: 'RL' })).toBe(false);
  });
});

describe('isForbiddenLastMove', () => {
  it('bars the named axis, both faces of it', () => {
    expect(isForbiddenLastMove(F, { lastMoveAxis: 'FB' })).toBe(true);
    expect(isForbiddenLastMove({ face: 'B', amount: 3 }, { lastMoveAxis: 'FB' })).toBe(true);
  });

  it('allows every other axis', () => {
    expect(isForbiddenLastMove(R, { lastMoveAxis: 'FB' })).toBe(false);
  });

  it('treats an empty solution as unrestricted rather than as a violation', () => {
    // There is no move at the seam to cancel against, so the restriction has
    // nothing to say. `solve333` relies on this to decide whether its retry is
    // needed at all.
    expect(isForbiddenLastMove(undefined, { lastMoveAxis: 'FB' })).toBe(false);
  });

  it('ignores the first-move restriction', () => {
    expect(isForbiddenLastMove(F, { firstMoveAxis: 'FB' })).toBe(false);
  });
});

describe('endRestrictions', () => {
  it('omits an absent end rather than setting it to undefined', () => {
    // Not a style point: under `exactOptionalPropertyTypes` a present-but-
    // undefined property is not assignable to `?: Axis`, which is what this
    // helper exists to avoid at every call site in `solve333`.
    expect(Object.keys(endRestrictions(undefined, 'FB'))).toEqual(['lastMoveAxis']);
    expect(Object.keys(endRestrictions('RL', undefined))).toEqual(['firstMoveAxis']);
    expect(Object.keys(endRestrictions())).toEqual([]);
  });

  it('carries both ends through when both are given', () => {
    expect(endRestrictions('RL', 'FB')).toEqual({ firstMoveAxis: 'RL', lastMoveAxis: 'FB' });
  });
});
