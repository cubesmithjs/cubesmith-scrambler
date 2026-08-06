import { moveAxis, moveLayerSet } from '../nxn/notation';
import { applyCentreCoordinate, centreTable, solvedCentreCoordinate } from './centres';
import { centrePreservingMoveIndices } from './orbits';
import { WING_COUNT_444 } from './pieces';
import { move444Tables } from './state';

/**
 * The **centre-neutral generator library**: short sequences that leave every
 * centre where it was, and move only wings.
 *
 * ## Why these exist, and why they resolve the earlier dead end
 *
 * `orbits.ts` established that no single *move* preserves both solved centres and
 * pairing — every move that can pair anything also unsolves the centres. That
 * looked like it forced centres and pairing to be reached in one search, and the
 * measurement in `wing-pairs.ts` then showed that search to be out of reach.
 *
 * A *sequence* is not a move. A sequence can disturb the centres and put them
 * back, and if its net effect fixes the solved centre arrangement then it can be
 * applied to a cube with solved centres and leave them solved. That is what
 * unlocks the staged order the plan of record uses:
 *
 * > solve the centres exactly (`centres.ts`), then pair the wings using only
 * > sequences that hold them solved.
 *
 * ## How they are found
 *
 * Exhaustively, over the 24 centre-preserving moves, to a bounded length, keeping
 * every sequence whose net effect returns the centre coordinate to solved.
 *
 * Two things make that search small. The exact centre table prunes it hard: at
 * depth `d` of a length-`limit` search, a sequence can only still come back if the
 * centres are within `limit - d` moves of solved, which is a lookup. And the usual
 * canonical-sequence rules apply — no layer set twice running, and only the
 * ascending ordering within a run on one axis, since those commute.
 *
 * What comes out is deduplicated **by wing effect**, keeping the shortest sequence
 * for each: two different sequences that permute the wings identically are one
 * generator, and the shorter is the one worth having.
 */

export interface Generator444 {
  /** Move indices into `move444Tables()`. */
  readonly moves: readonly number[];
  /** Where each wing slot's contents end up. */
  readonly wingDestination: readonly number[];
  /** How many wing slots the sequence actually disturbs. */
  readonly support: number;
}

const enum Previous {
  None = -1,
}

function composeWing(first: readonly number[], move: number): number[] {
  const { wingDestination } = move444Tables()[move]!;
  const composed = new Array<number>(WING_COUNT_444);
  for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
    composed[slot] = wingDestination[first[slot]!]!;
  }
  return composed;
}

function supportOf(destination: readonly number[]): number {
  let moved = 0;
  for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
    if (destination[slot] !== slot) moved += 1;
  }
  return moved;
}

const libraries = new Map<number, readonly Generator444[]>();

/**
 * Every centre-neutral sequence of at most `limit` moves, one per distinct wing
 * effect, shortest first.
 */
export function generatorLibrary(limit = 6): readonly Generator444[] {
  const cached = libraries.get(limit);
  if (cached) return cached;

  const preserving = centrePreservingMoveIndices();
  const tables = move444Tables();
  const meta = preserving.map((index) => ({
    axis: moveAxis(tables[index]!.move),
    layerSet: moveLayerSet(tables[index]!.move),
  }));
  const distances = centreTable();
  const solvedCentres = solvedCentreCoordinate();

  const byEffect = new Map<string, Generator444>();
  const path: number[] = [];
  const identity = Array.from({ length: WING_COUNT_444 }, (_, slot) => slot);

  const walk = (
    centre: number,
    wings: readonly number[],
    depth: number,
    previous: number,
  ): void => {
    if (centre === solvedCentres && depth > 0) {
      const support = supportOf(wings);
      if (support > 0) {
        const key = wings.join(',');
        if (!byEffect.has(key)) {
          byEffect.set(key, {
            moves: path.map((index) => preserving[index]!),
            wingDestination: [...wings],
            support,
          });
        }
      }
    }

    const remaining = limit - depth;
    if (remaining === 0) return;
    // Cannot get the centres home in the moves that are left.
    if (distances[centre]! > remaining) return;

    for (let move = 0; move < preserving.length; move += 1) {
      if (previous !== Previous.None) {
        if (meta[move]!.layerSet === meta[previous]!.layerSet) continue;
        if (
          meta[move]!.axis === meta[previous]!.axis &&
          meta[move]!.layerSet < meta[previous]!.layerSet
        ) {
          continue;
        }
      }
      path.push(move);
      walk(
        applyCentreCoordinate(centre, move),
        composeWing(wings, preserving[move]!),
        depth + 1,
        move,
      );
      path.pop();
    }
  };

  walk(solvedCentres, identity, 0, Previous.None);

  const library = [...byEffect.values()].sort(
    (a, b) => a.moves.length - b.moves.length || a.support - b.support,
  );
  libraries.set(limit, library);
  return library;
}

/** Whether the group the library generates is transitive on the 24 wing slots. */
export function isTransitive(library: readonly Generator444[]): boolean {
  const seen = new Array<boolean>(WING_COUNT_444).fill(false);
  seen[0] = true;
  const queue = [0];
  for (let head = 0; head < queue.length; head += 1) {
    for (const generator of library) {
      const landed = generator.wingDestination[queue[head]!]!;
      if (seen[landed]) continue;
      seen[landed] = true;
      queue.push(landed);
    }
  }
  return seen.every(Boolean);
}

/** The cycle-type of a generator's wing effect, as sorted cycle lengths above 1. */
export function cycleType(destination: readonly number[]): number[] {
  const seen = new Array<boolean>(WING_COUNT_444).fill(false);
  const cycles: number[] = [];
  for (let start = 0; start < WING_COUNT_444; start += 1) {
    if (seen[start]) continue;
    let length = 0;
    for (let at = start; !seen[at]; at = destination[at]!) {
      seen[at] = true;
      length += 1;
    }
    if (length > 1) cycles.push(length);
  }
  return cycles.sort((a, b) => a - b);
}

/** The smallest support any generator in the library has. */
export function smallestSupport(library: readonly Generator444[]): number {
  return library.reduce((least, generator) => Math.min(least, generator.support), Infinity);
}
