import { allLayerTurns, SLICE, type Square1Move } from './notation';
import {
  combinedParity,
  movesToPhase1Goal,
  sliceParityFlip,
  sliceShapeKey,
  turnParityFlip,
  turnShapeKey,
} from './phase1-tables';
import { square1ShapeKey, type Square1State } from './state';

/**
 * Phase 1: reach **square layers**, from where phase 2 takes over.
 *
 * The search runs entirely on 24-bit shape keys — no piece arrays — because the
 * goal depends only on the shape. Where the pieces end up matters enormously to
 * how hard phase 2 then is, which is exactly why this enumerates *many*
 * solutions rather than returning one: the orchestrator in `solve.ts` tries
 * several endings and keeps the best total.
 *
 * The exact distance table makes the search almost free. `cost + distance >
 * bound` prunes everything that cannot reach the goal in time, and since the
 * table is exact rather than a lower bound, an optimal-length enumeration never
 * explores a wrong branch at all.
 *
 * ## Reaching square layers is necessary but not sufficient
 *
 * Phase 2 can only reach half of the `(alignment, middle, corner parity, edge
 * parity)` classes — the classic "phase 1 must deliver an even permutation"
 * condition, in this package's coordinates (see `phase2-tables.ts`). Landing in
 * the wrong half is not a slow solve, it is no solve at all.
 *
 * So a caller passes `accept`, and the enumeration only keeps endings that
 * satisfy it. That matters more than it sounds: **all** endings of a given
 * length tend to land in the *same* class, because the class flips with the
 * length's parity. An enumeration capped at, say, sixteen optimal-length
 * endings can therefore return sixteen unusable ones, which is exactly what
 * happened before `accept` existed — so `extraDepth` must be at least 1 for
 * `accept` to have anything else to offer.
 */

export interface Phase1Options {
  /** Stop after this many, in increasing length. */
  readonly maxSolutions?: number;
  /** Called with each ending as it is found; returning `true` stops the search. */
  readonly visit?: (moves: readonly Square1Move[]) => boolean;
  /** Also enumerate solutions this many moves longer than optimal. */
  readonly extraDepth?: number;
  /** Keep only endings the caller can use. */
  readonly accept?: (moves: readonly Square1Move[]) => boolean;
  /**
   * At most this many endings sharing a first move.
   *
   * Without it the enumeration returns endings that differ only in their last
   * move or two, because a depth-first search leaves its early choices alone
   * for as long as it can. Those near-identical endings hand phase 2
   * near-identical states, so trying forty of them is barely better than trying
   * one — and the whole point of enumerating many is that phase-2 difficulty
   * varies wildly between genuinely different endings.
   */
  readonly maxPerFirstMove?: number;
}

const enum Previous {
  Nothing,
  Turn,
  Slice,
}

/**
 * Sequences taking `state` to square layers, shortest first.
 *
 * Turns and slices alternate: two turns in a row compose into one and two
 * slices cancel, so no optimal sequence contains either.
 *
 * Pass `visit` to consume endings **as they are found** and stop early. That
 * matters: enumerating a few hundred endings up front costs anywhere from
 * 150ms to 37 seconds depending on how many exist at the optimal length,
 * while the caller almost always finds one it likes within the first fifteen.
 * With `visit`, the ones after that are never generated.
 */
export function phase1Solutions(
  state: Square1State,
  options: Phase1Options = {},
): Square1Move[][] {
  const startShape = square1ShapeKey(state);
  const startParity = combinedParity(state);
  const maxSolutions = options.maxSolutions ?? 1;
  const extraDepth = options.extraDepth ?? 0;
  const accept = options.accept;
  const maxPerFirstMove = options.maxPerFirstMove ?? Number.POSITIVE_INFINITY;
  const turns = allLayerTurns();

  const visit = options.visit;
  const solutions: Square1Move[][] = [];
  const path: Square1Move[] = [];
  const perFirstMove = new Map<string, number>();
  let stopped = false;
  let found = 0;

  const firstMoveKey = (): string => {
    const first = path[0];
    if (first === undefined) return '';
    return first.kind === 'slice' ? '/' : `${first.top},${first.bottom}`;
  };

  const search = (
    shape: number,
    parity: number,
    cost: number,
    bound: number,
    previous: Previous,
  ): void => {
    if (stopped || found >= maxSolutions) return;

    const remaining = movesToPhase1Goal(shape, parity);
    if (remaining === 0 && cost === bound) {
      if (accept && !accept(path)) return;
      const key = firstMoveKey();
      const alreadyFound = perFirstMove.get(key) ?? 0;
      if (alreadyFound >= maxPerFirstMove) return;
      perFirstMove.set(key, alreadyFound + 1);
      found += 1;
      if (visit) {
        if (visit(path)) stopped = true;
      } else {
        solutions.push([...path]);
      }
      return;
    }
    if (cost + remaining > bound) return;

    if (previous !== Previous.Turn) {
      for (const turn of turns) {
        path.push(turn);
        search(
          turnShapeKey(shape, turn.top, turn.bottom),
          parity ^ turnParityFlip(shape, turn.top, turn.bottom),
          cost + 1,
          bound,
          Previous.Turn,
        );
        path.pop();
        if (stopped || found >= maxSolutions) return;
      }
    }

    if (previous === Previous.Slice) return;
    const sliced = sliceShapeKey(shape);
    if (sliced === undefined) return;
    path.push(SLICE);
    search(sliced, parity ^ sliceParityFlip(shape), cost + 1, bound, Previous.Slice);
    path.pop();
  };

  const optimal = movesToPhase1Goal(startShape, startParity);
  for (let bound = optimal; bound <= optimal + extraDepth; bound += 1) {
    search(startShape, startParity, 0, bound, Previous.Nothing);
    if (stopped || found >= maxSolutions) break;
  }

  return solutions;
}

/** The shortest phase-1 solution, which is all a caller wanting one needs. */
export function phase1Search(state: Square1State): Square1Move[] {
  const [solution] = phase1Solutions(state, { maxSolutions: 1 });
  if (!solution) {
    throw new Error('@cube/scrambler: no Square-1 phase-1 solution — the shape table is wrong');
  }
  return solution;
}
