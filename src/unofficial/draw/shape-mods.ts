import { parseCubeNetMoves } from '../../draw/cube';
import type { ShapeModEventId } from '../catalogue';
import { UnsupportedUnofficialScrambleError } from './errors';
import { drawMirrorHeightMap } from './mirror-height-map';
import { registerUnofficialDrawer } from './registry';
import { drawShapeModState } from './shape-mod/render';
import { SHAPE_MOD_SOLIDS, type ShapeModSolid } from './shape-mod/solids';
import type { UnofficialDrawer } from './types';

function shapeModDrawer(event: ShapeModEventId, solid: ShapeModSolid): UnofficialDrawer {
  const isometric = (scramble: string, scheme: Parameters<UnofficialDrawer['draw']>[1]) =>
    drawShapeModState(
      solid,
      parseCubeNetMoves(
        scramble,
        3,
        (construct, detail) => new UnsupportedUnofficialScrambleError(event, construct, detail),
      ),
      scheme,
    );

  if (event === 'mirror') {
    // Two pictures. The isometric one is the default because it is what the
    // puzzle looks like in the hand, the same view every other shape mod gets.
    // The height map is the flat, printable alternative.
    return {
      views: ['isometric', 'height-map'],
      defaultScheme: solid.defaultScheme,
      draw: (scramble, scheme, view) =>
        view === 'height-map' ? drawMirrorHeightMap(scramble, scheme) : isometric(scramble, scheme),
    };
  }
  return { views: ['isometric'], defaultScheme: solid.defaultScheme, draw: isometric };
}

/** Registers every shape mod whose geometry has a provenance (`SHAPE_MOD_SOLIDS`). */
export function registerShapeModDrawers(): void {
  for (const [event, solid] of Object.entries(SHAPE_MOD_SOLIDS) as [ShapeModEventId, ShapeModSolid][]) {
    registerUnofficialDrawer(event, shapeModDrawer(event, solid));
  }
}
