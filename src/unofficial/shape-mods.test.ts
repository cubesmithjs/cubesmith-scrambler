import { describe, expect, it } from 'vitest';
import { generateScramble } from '../index';
import { parseScrambleToken } from '../puzzles/nxn/notation';
import { SHAPE_MODS } from './catalogue';
import { applyMechanismMoves, applyRotation, solvedMechanism, type Cubie } from './draw/shape-mod/mechanism';
import { generateUnofficialScramble, generateUnofficialScrambles } from './index';

/**
 * How many clockwise quarter turns a centre has made about its own axis,
 * read off its rotation: the twist a supercube shows and a plain 3x3x3 hides.
 */
function centreTwist(cubie: Cubie): number {
  const axis = cubie.home;
  const perpendicular: [number, number, number] = axis[0] !== 0 ? [0, 1, 0] : [1, 0, 0];
  const turned = applyRotation(cubie.rotation, perpendicular);
  // A clockwise quarter turn about `axis` maps v to axis(axis·v) − axis × v.
  let probe: readonly number[] = perpendicular;
  for (let k = 0; k < 4; k += 1) {
    if (probe.every((c, i) => c === turned[i])) return k;
    const [x, y, z] = probe as [number, number, number];
    const cross = [axis[1] * z - axis[2] * y, axis[2] * x - axis[0] * z, axis[0] * y - axis[1] * x];
    probe = cross.map((c) => -c);
  }
  throw new Error('centreTwist: the centre was not turned about its own axis');
}

function permutationParity(cubies: readonly Cubie[]): number {
  const corners = cubies.filter((c) => c.home.every((v) => v !== 0));
  const index = new Map(corners.map((c, i) => [c.home.join(','), i]));
  const target = corners.map((c) => index.get(c.position.join(','))!);
  let parity = 0;
  const seen = new Array<boolean>(target.length).fill(false);
  for (let i = 0; i < target.length; i += 1) {
    if (seen[i]) continue;
    let length = 0;
    for (let j = i; !seen[j]; j = target[j]!) {
      seen[j] = true;
      length += 1;
    }
    parity ^= (length - 1) & 1;
  }
  return parity;
}

describe('3x3x3 shape-mod scrambles', () => {
  it('are the 333 event’s scrambles, with its ≥ 2-moves floor', async () => {
    for (const event of SHAPE_MODS) {
      const unofficial = await generateUnofficialScramble(event, { seed: 'same-as-333' });
      const wca = await generateScramble('333', { seed: 'same-as-333' });
      expect(unofficial.moves, event).toBe(wca.moves);
    }
  });

  it('🔴 obey the supercube parity law: total centre twist ≡ corner parity (mod 2)', async () => {
    // The supergroup is 4⁶/2 times the cube group (Jaap's Puzzle Page, *Cube
    // theory*; Cube-Lovers, D. Woods, "Re: Supergroup", 1981): one centre may
    // not make a lone quarter turn. That is this law, and the mechanism model
    // must agree with it or its centre rotations, which the shape-mod drawings
    // show, would be wrong.
    const batch = await generateUnofficialScrambles('axis', 60, { seed: 'supercube' });
    const twists: number[][] = [[], [], [], [], [], []];
    for (const { moves } of batch) {
      const cubies = applyMechanismMoves(
        solvedMechanism(),
        moves.split(' ').map((token) => parseScrambleToken(token, 3)),
      );
      const centres = cubies.filter((c) => c.home.filter((v) => v !== 0).length === 1);
      expect(centres.every((c) => c.position.join() === c.home.join())).toBe(true);
      const total = centres.reduce((sum, centre, i) => {
        const twist = centreTwist(centre);
        twists[i]!.push(twist);
        return sum + twist;
      }, 0);
      expect(total % 2).toBe(permutationParity(cubies));
    }
    // What `random-state-mechanism` means in numbers: every twist occurs on
    // every centre, so the scramble is not biased to any one, but the six are
    // tied to each other and to the corners, so they are not uniform jointly.
    for (const perCentre of twists) expect(new Set(perCentre).size).toBe(4);
  });
});
