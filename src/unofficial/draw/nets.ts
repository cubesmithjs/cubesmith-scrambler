import {
  applyMoveForDrawing,
  CUBE_DEFAULT_SCHEME,
  cubeNetHeight,
  cubeNetWidth,
  drawState,
  parseCubeNetMoves,
} from '../../draw/cube';
import { drawMegaminxScramble, MEGAMINX_DEFAULT_SCHEME } from '../../draw/megaminx';
import { drawPyraminxScramble, PYRAMINX_DEFAULT_SCHEME } from '../../draw/pyraminx';
import type { CubeNxNState } from '../../puzzles/nxn/state';
import { solvedCubeNxN } from '../../puzzles/nxn/state';
import type { ColorScheme } from '../../draw/types';
import { BIG_CUBES } from '../catalogue';
import type { UnofficialEventId } from '../types';
import { UnsupportedUnofficialScrambleError } from './errors';
import { registerUnofficialDrawer } from './registry';
import type { UnofficialDrawer, UnofficialScrambleImage } from './types';

/**
 * Cube size per cube-net event, as a table, for the reason `draw/cube.ts` gives
 * for its own: nothing is derived from an id's digits. `1010` read as digits is
 * a 10x10x10 only by luck of the spelling.
 */
const CUBE_SIZE_BY_UNOFFICIAL_EVENT: Readonly<Partial<Record<UnofficialEventId, number>>> = {
  ...Object.fromEntries(BIG_CUBES.map(({ event, size }) => [event, size])),
  '222bf': 2,
  '666bf': 6,
  '777bf': 7,
};

/** The cube net for any size, through the same parse and state code as the WCA cubes. */
export function cubeNetState(
  event: UnofficialEventId,
  scramble: string,
  size: number,
): CubeNxNState {
  const moves = parseCubeNetMoves(
    scramble,
    size,
    (construct, detail) => new UnsupportedUnofficialScrambleError(event, construct, detail),
  );
  return moves.reduce(applyMoveForDrawing, solvedCubeNxN(size));
}

function cubeNetDrawer(event: UnofficialEventId, size: number): UnofficialDrawer {
  return {
    views: ['net'],
    defaultScheme: CUBE_DEFAULT_SCHEME,
    draw: (scramble, scheme) => ({
      width: cubeNetWidth(size),
      height: cubeNetHeight(size),
      strokeWidth: 1,
      shapes: drawState(cubeNetState(event, scramble, size), scheme),
    }),
  };
}

/**
 * A WCA puzzle's own drawer, reused for its blindfolded variant. The variant's
 * scramble is written in the base puzzle's notation (`NOTATION_OF`), and neither
 * `pyrambf` nor `minxbf` adds a suffix, so the base drawer reads it unchanged.
 */
function reusedDrawer(
  draw: (scramble: string, scheme: ColorScheme) => Omit<UnofficialScrambleImage, 'event'>,
  defaultScheme: ColorScheme,
): UnofficialDrawer {
  return {
    views: ['net'],
    defaultScheme,
    draw: (scramble, scheme) => {
      const { width, height, strokeWidth, shapes } = draw(scramble, scheme);
      return { width, height, strokeWidth, shapes };
    },
  };
}

export function registerNetDrawers(): void {
  for (const [event, size] of Object.entries(CUBE_SIZE_BY_UNOFFICIAL_EVENT) as [
    UnofficialEventId,
    number,
  ][]) {
    registerUnofficialDrawer(event, cubeNetDrawer(event, size));
  }
  registerUnofficialDrawer('pyrambf', reusedDrawer(drawPyraminxScramble, PYRAMINX_DEFAULT_SCHEME));
  registerUnofficialDrawer('minxbf', reusedDrawer(drawMegaminxScramble, MEGAMINX_DEFAULT_SCHEME));
}

export { CUBE_SIZE_BY_UNOFFICIAL_EVENT };
