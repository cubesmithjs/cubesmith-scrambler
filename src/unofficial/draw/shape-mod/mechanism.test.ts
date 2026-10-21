import { describe, expect, it } from 'vitest';
import type { Face } from '../../../notation/move';
import { allMovesForSize } from '../../../puzzles/nxn/notation';
import { applyMoveForDrawing } from '../../../draw/cube';
import { modelForSize, solvedCubeNxN, type CubeNxNState } from '../../../puzzles/nxn/state';
import { createRandomSource } from '../../../random/random-source';
import { randomInt } from '../../../utils/random-int';
import { applyMechanismMove, applyRotation, FACE_NORMAL, solvedMechanism, type Cubie } from './mechanism';

const FACE_OF_NORMAL = new Map(
  (Object.entries(FACE_NORMAL) as [Face, readonly number[]][]).map(([face, n]) => [n.join(','), face]),
);

/**
 * The cubie model, read as stickers: each cubie carries its home stickers with
 * it, so a sticker at home normal `n` now sits at `rotation · n` on the cubie at
 * `position`. In the NxN model (size 3) a cubie centre is `2 · position` and the
 * sticker sits one unit out along its normal.
 */
function agreesWithStickerModel(cubies: readonly Cubie[], stickers: CubeNxNState): boolean {
  const { facelets } = modelForSize(3);
  const slotAt = new Map(facelets.map((f, slot) => [`${f.position.join(',')}|${f.normal.join(',')}`, slot]));
  for (const cubie of cubies) {
    for (let axis = 0; axis < 3; axis += 1) {
      if (cubie.home[axis] === 0) continue;
      const homeNormal = [0, 0, 0] as [number, number, number];
      homeNormal[axis] = cubie.home[axis]!;
      const normal = applyRotation(cubie.rotation, homeNormal);
      const position = cubie.position.map((c, i) => 2 * c + normal[i]!);
      const slot = slotAt.get(`${position.join(',')}|${normal.join(',')}`);
      if (slot === undefined) return false;
      const showing = facelets[stickers.occupant[slot]!]!.face;
      if (showing !== FACE_OF_NORMAL.get(homeNormal.join(','))) return false;
    }
  }
  return true;
}

describe('the shape-mod mechanism', () => {
  it('has 26 cubies, each where it started', () => {
    const cubies = solvedMechanism();
    expect(cubies).toHaveLength(26);
    for (const c of cubies) expect(c.position).toEqual(c.home);
  });

  it('turns U clockwise from above: the front centre goes left', () => {
    const [front] = applyMechanismMove(
      solvedMechanism().filter((c) => c.home.join() === '0,1,1'),
      { face: 'U', depth: 1, amount: 1 },
    );
    expect(front!.position).toEqual([-1, 1, 0]);
  });

  it('🔴 agrees with the NxN sticker model after every move of random sequences, wide turns and rotations included', () => {
    const moves = allMovesForSize(3).concat(
      (['R', 'U', 'F'] as const).flatMap((face) => ([1, 2, 3] as const).map((amount) => ({ face, depth: 3, amount }))),
    );
    const random = createRandomSource('mechanism-vs-stickers');
    for (let run = 0; run < 20; run += 1) {
      let cubies = solvedMechanism();
      let stickers = solvedCubeNxN(3);
      for (let i = 0; i < 25; i += 1) {
        const move = moves[randomInt(random, moves.length)]!;
        cubies = applyMechanismMove(cubies, move);
        stickers = applyMoveForDrawing(stickers, move);
        expect(agreesWithStickerModel(cubies, stickers)).toBe(true);
      }
    }
  });

  it('keeps every cubie at rotation · home', () => {
    let cubies = solvedMechanism();
    for (const face of ['R', 'U', 'F', 'L', 'D', 'B'] as const) {
      cubies = applyMechanismMove(cubies, { face, depth: 1, amount: 1 });
    }
    for (const c of cubies) expect(applyRotation(c.rotation, c.home)).toEqual(c.position);
  });
});
