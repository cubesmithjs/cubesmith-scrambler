import { CUBE_DEFAULT_SCHEME } from '../../../draw/cube';
import { PYRAMINX_DEFAULT_SCHEME } from '../../../draw/pyraminx';
import type { ColorScheme } from '../../../draw/types';
import type { ShapeModEventId } from '../../catalogue';
import { halfSpace, type HalfSpace, type V3 } from './geometry';

/**
 * Each shape mod's **outer solid**, in mechanism coordinates (R = +x, U = +y,
 * F = +z; the mechanism's cut planes sit at ±½ on every axis and never move).
 *
 * 🔴 Every number here has a provenance, stated beside it. A puzzle whose
 * geometry has no source is **not** in this table, and it is not drawn. A
 * picture that looks right but does not match the puzzle in the hand is worse
 * than no picture, because a scramble checker trusts it. Axis, Windmill and
 * Ghost are absent for that reason (`docs/shape-mod-drawing-design.md` §5),
 * and their scrambles are served all the same.
 */
export interface ShapeModSolid {
  /** The outer faces, each tagged with the colour-scheme key it is stickered in. */
  readonly faces: readonly HalfSpace[];
  /** `body` is the plastic a piece's cut faces are made of; it shows wherever a scramble exposes one. */
  readonly defaultScheme: ColorScheme;
  /**
   * The outer solid's turn about the U–D axis against the mechanism, in
   * radians. The isometric views aim at the corner of the **outer** solid, so a
   * Fisher Cube is seen as a cube with three faces showing, not edge-on.
   */
  readonly frameTurn: number;
  /**
   * How much the shading may darken a face, in `[0, 1]`. Strong for a
   * one-colour puzzle, whose faces are told apart only by light; gentle for a
   * stickered one, whose colours must stay recognisable (a strong shade turns
   * yellow olive).
   */
  readonly shading: number;
}

/** The colour of the plastic under the stickers: what a step on a scrambled shape mod shows. */
const BODY = '#1a1a1a';

const outer = (normal: V3, offset: number, key: string): HalfSpace =>
  halfSpace(normal, offset, { kind: 'outer', key });

/**
 * Mirror Cube (Mirror Blocks): a 3x3x3 whose six outer layers change thickness
 * in opposite pairs, one thicker and its partner thinner by the same amount,
 * with the inner layers unchanged (Chess.com forum, *mirror cube puzzle*). Kept
 * as symmetric cuts with an offset shell, as an independent digital model also
 * does (three.js forum, *Mirror Cube … physically correct mechanism*). With the
 * cuts at ±½, a layer of thickness `1 ± Δ` puts that face at `1.5 ± Δ`: the
 * outer solid is the standard 3-unit cube **translated by `(Δx, Δy, Δz)`**.
 *
 * ⚠️ The three Δ values are a **CubeSmith convention**, pending a measurement
 * of a real puzzle: distinct so that all six layer thicknesses differ (which is
 * what makes every piece a different block, Wikipedia *Mirror Blocks*), spaced
 * 0.1 apart so a step is visible at print size, and at most 0.4 so the thinnest
 * layer keeps 0.6 of a standard one. They were chosen from those constraints,
 * not taken from any other program.
 */
export const MIRROR_OFFSET: Readonly<{ x: number; y: number; z: number }> = { x: 0.2, y: 0.4, z: 0.3 };

const MIRROR: ShapeModSolid = {
  faces: [
    outer([1, 0, 0], 1.5 + MIRROR_OFFSET.x, 'surface'),
    outer([-1, 0, 0], 1.5 - MIRROR_OFFSET.x, 'surface'),
    outer([0, 1, 0], 1.5 + MIRROR_OFFSET.y, 'surface'),
    outer([0, -1, 0], 1.5 - MIRROR_OFFSET.y, 'surface'),
    outer([0, 0, 1], 1.5 + MIRROR_OFFSET.z, 'surface'),
    outer([0, 0, -1], 1.5 - MIRROR_OFFSET.z, 'surface'),
  ],
  // One colour: the puzzle is solved by shape, not by colour (Wikipedia, *Mirror Blocks*).
  defaultScheme: { surface: '#c8c8c8', body: BODY },
  frameTurn: 0,
  shading: 0.5,
};

/**
 * Fisher Cube: "essentially a standard cube twisted 45° around a central axis"
 * (Ruwix, *Rubik's Cube Shape Mods*; Wikipedia, *Tony Fisher (puzzle
 * designer)*). The axis is the mechanism's U–D axis, so U and D stay parallel
 * to the mechanism's own faces and the four sides run diagonally across it.
 * The outer cube keeps the standard 3-unit size, a **CubeSmith convention**:
 * the puzzle is described as a standard cube turned, not resized.
 */
const FISHER_SIDE = Math.SQRT1_2;
const FISHER: ShapeModSolid = {
  faces: [
    outer([0, 1, 0], 1.5, 'U'),
    outer([0, -1, 0], 1.5, 'D'),
    // The outer cube's own R and F, each the mechanism's turned 45° about +y.
    outer([FISHER_SIDE, 0, -FISHER_SIDE], 1.5, 'R'),
    outer([FISHER_SIDE, 0, FISHER_SIDE], 1.5, 'F'),
    outer([-FISHER_SIDE, 0, FISHER_SIDE], 1.5, 'L'),
    outer([-FISHER_SIDE, 0, -FISHER_SIDE], 1.5, 'B'),
  ],
  defaultScheme: { ...CUBE_DEFAULT_SCHEME, body: BODY },
  frameTurn: Math.PI / 4,
  shading: 0.25,
};

/**
 * Mastermorphix: a regular tetrahedron on a 3x3x3 mechanism. PuzzleGeometry
 * publishes it as `t e 0.346184634065199`: a tetrahedron with cuts
 * perpendicular to its six edge directions, at 0.346… of the face distance
 * (cubing.js `pgPuzzles.ts`, where a distance is measured in units of the
 * solid's inradius; the 3x3x3 is `c f 0.333…`, three equal layers). The six
 * edge directions are exactly the mechanism's ±x, ±y, ±z, which is why the
 * mechanism is a 3x3x3.
 *
 * Scaling that fact to our cut at ½: the tetrahedron's edge midpoints sit at
 * distance `a`, its faces at `a/√3`. With the inradius as the unit, the cut is
 * at `0.346… · a/√3`, so `a = √3 · ½ / 0.346…` ≈ 2.502. Its vertices are four
 * alternate corners of the cube `[-a, a]³`.
 *
 * The face names reuse the Pyraminx scheme's four keys, assigned by a
 * **CubeSmith convention**: `D` is the face the front view cannot see.
 */
const MASTERMORPHIX_CUT = 0.346184634065199;
const MASTERMORPHIX_A = (Math.sqrt(3) * 0.5) / MASTERMORPHIX_CUT;
const MASTERMORPHIX: ShapeModSolid = {
  faces: [
    outer([-1, -1, -1], MASTERMORPHIX_A, 'D'),
    outer([1, -1, 1], MASTERMORPHIX_A, 'F'),
    outer([-1, 1, 1], MASTERMORPHIX_A, 'L'),
    outer([1, 1, -1], MASTERMORPHIX_A, 'R'),
  ],
  defaultScheme: { ...PYRAMINX_DEFAULT_SCHEME, body: BODY },
  // The views look along ±(1, 1, 1), a vertex of this tetrahedron: three faces
  // from the front, the fourth from the back.
  frameTurn: 0,
  shading: 0.25,
};

/** The shape mods that can be drawn, by the provenance rule above. */
export const SHAPE_MOD_SOLIDS: Readonly<Partial<Record<ShapeModEventId, ShapeModSolid>>> = {
  mirror: MIRROR,
  fisher: FISHER,
  mastermorphix: MASTERMORPHIX,
};

export { MASTERMORPHIX_A };
