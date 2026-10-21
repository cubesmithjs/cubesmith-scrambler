/**
 * The unofficial catalogue as **data only**: no puzzle model, no solver. Both
 * entries read it, and `./unofficial/draw` must not pull a scramble generator
 * into its bundle by doing so (`unofficial-bundle.test.ts` checks it).
 */
import type { WcaEventId } from '../core/types';
import type { UnofficialEventId } from './types';

/**
 * Big-cube scramble lengths. **A CubeSmith convention**, not a regulation:
 * the WCA holds no cube above 7x7x7.
 *
 * The values extend the shipped table's +20-per-size step (`555` 60, `666` 80,
 * `777` 100, in `RANDOM_MOVE_CUBES`). They are backed by a measurement rather
 * than by the pattern alone. `big-cubes.test.ts` finds the length at which
 * per-sticker colour frequencies become indistinguishable from uniform (the
 * "knee"), and requires each length to clear its knee by at least the margin
 * the **least** conservative shipped WCA length clears its own (`555`: 60
 * against a knee near 48, about ×1.25). Measured on 2026-10-21 over 4,000
 * scrambles per point: knees near 40 / 96 / 56 / 96 / 56 for 8–12, so every
 * length below clears ×1.25 with room to spare.
 */
export const BIG_CUBES: readonly {
  readonly event: UnofficialEventId;
  readonly size: number;
  readonly length: number;
}[] = [
  { event: '888', size: 8, length: 120 },
  { event: '999', size: 9, length: 140 },
  { event: '1010', size: 10, length: 160 },
  { event: '1111', size: 11, length: 180 },
  { event: '1212', size: 12, length: 200 },
];

/** The six shape mods of a 3x3x3 mechanism, in catalogue order. */
export const SHAPE_MODS = ['mirror', 'axis', 'fisher', 'windmill', 'ghost', 'mastermorphix'] as const;

export type ShapeModEventId = (typeof SHAPE_MODS)[number];

/**
 * For each unofficial event, the WCA event whose **notation** its scramble is
 * written in. `validateUnofficialScramble` checks a scramble against that
 * notation, and the drawers parse it with that notation's parser.
 *
 * The big cubes read as cube notation, the same as `777`: the notation layer
 * checks the grammar, not the size, exactly as it does for every WCA cube.
 */
export const NOTATION_OF: Readonly<Record<UnofficialEventId, WcaEventId>> = {
  '888': '777',
  '999': '777',
  '1010': '777',
  '1111': '777',
  '1212': '777',
  '222bf': '222',
  '666bf': '666',
  '777bf': '777',
  pyrambf: 'pyram',
  minxbf: 'minx',
  mirror: '333',
  axis: '333',
  fisher: '333',
  windmill: '333',
  ghost: '333',
  mastermorphix: '333',
};

