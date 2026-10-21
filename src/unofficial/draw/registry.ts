import type { UnofficialEventId } from '../types';
import type { UnofficialDrawer } from './types';

/** A separate map from the main draw entry's, for the same reason as the scrambler registry. */
const drawers = new Map<UnofficialEventId, UnofficialDrawer>();

export function registerUnofficialDrawer(event: UnofficialEventId, drawer: UnofficialDrawer): void {
  drawers.set(event, drawer);
}

export function getUnofficialDrawer(event: UnofficialEventId): UnofficialDrawer | undefined {
  return drawers.get(event);
}

/** Every unofficial event with a drawer, in registration order. */
export function drawableUnofficialEvents(): UnofficialEventId[] {
  return [...drawers.keys()];
}
