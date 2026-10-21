import type { UnsupportedCubeConstruct } from '../../draw/cube';
import type { UnofficialEventId } from '../types';
import type { UnofficialDrawingView } from './types';

/**
 * Thrown for an unofficial event with no drawing, or for a view it does not
 * offer. Deliberately not `UnimplementedUnofficialEventError`, which means "no
 * scrambler": an event can have scrambles before it has a picture. Axis,
 * Windmill and Ghost are in that state until their geometry is measured
 * (`docs/shape-mod-drawing-design.md` §5).
 */
export class UnimplementedUnofficialDrawingError extends Error {
  readonly event: UnofficialEventId;
  readonly view: UnofficialDrawingView | undefined;

  constructor(event: UnofficialEventId, view?: UnofficialDrawingView) {
    super(
      view === undefined
        ? `@cubesmith/scrambler/unofficial/draw: no drawing is implemented for event "${event}" yet`
        : `@cubesmith/scrambler/unofficial/draw: event "${event}" has no "${view}" view`,
    );
    this.name = 'UnimplementedUnofficialDrawingError';
    this.event = event;
    this.view = view;
  }
}

/**
 * Valid cube notation that a scramble never contains (a slice move, a layer
 * range, a commutator), refused rather than approximated. The unofficial
 * counterpart of the main draw entry's `UnsupportedScrambleError`.
 */
export class UnsupportedUnofficialScrambleError extends Error {
  readonly event: UnofficialEventId;
  readonly construct: UnsupportedCubeConstruct;

  constructor(event: UnofficialEventId, construct: UnsupportedCubeConstruct, detail: string) {
    super(
      `@cubesmith/scrambler/unofficial/draw: a "${event}" drawing cannot apply ${detail} — ` +
        'valid notation, but not something a scramble contains',
    );
    this.name = 'UnsupportedUnofficialScrambleError';
    this.event = event;
    this.construct = construct;
  }
}
