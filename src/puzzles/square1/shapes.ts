import { allLayerTurns, SLICE, type Square1Move } from './notation';
import {
  applySquare1LayerTurn,
  applySquare1Slice,
  isSliceLegal,
  RING_SLOTS,
  SOLVED_SQUARE1_STATE,
  SQUARE1_CORNER_COUNT,
  square1ShapeKey,
  type Square1State,
} from './state';

/**
 * Square-1 shapes: the enumeration, and the shape-only distance table that
 * comes out of it.
 *
 * A shape is *which* slots hold corner halves, encoded by `square1ShapeKey` as
 * 24 bits — bit `i` set when slot `i` starts a corner. Two independent
 * enumerations live here and are cross-checked against each other and against
 * published counts in `shapes.test.ts`:
 *
 * 1. **Combinatorial.** A ring's corner starts form an *independent set* of the
 *    12-cycle (no two starts adjacent, or the corners would overlap), and the
 *    eight corners split between the rings. That derivation knows nothing about
 *    moves.
 * 2. **Reachability.** Breadth-first search from solved over the real move
 *    model of `state.ts`.
 *
 * The two agreeing is the checkpoint `docs/square1-design.md` §10 sets before
 * any solver work: the published **3,678** twistable shapes must fall out of
 * both, because every number downstream rests on the slice map being right, and
 * this is the first place a sign or index error in it would show.
 */

/** Corner-start masks for one ring, indexed by how many corners the ring holds. */
function ringTilingsByCornerCount(): readonly (readonly number[])[] {
  const byCount: number[][] = Array.from({ length: RING_SLOTS }, () => []);
  for (let mask = 0; mask < 1 << RING_SLOTS; mask += 1) {
    let corners = 0;
    let overlapping = false;
    for (let slot = 0; slot < RING_SLOTS; slot += 1) {
      if ((mask & (1 << slot)) === 0) continue;
      corners += 1;
      // A corner occupies (slot, slot+1), so two starts may not be adjacent.
      if ((mask & (1 << ((slot + 1) % RING_SLOTS))) !== 0) {
        overlapping = true;
        break;
      }
    }
    if (!overlapping) byCount[corners]!.push(mask);
  }
  return byCount;
}

let tilings: readonly (readonly number[])[] | undefined;

/** Legal corner placements for a single ring holding `corners` corners. */
export function ringTilings(corners: number): readonly number[] {
  tilings ??= ringTilingsByCornerCount();
  return tilings[corners] ?? [];
}

/**
 * Every absolute shape the puzzle's *pieces* admit, derived by counting rather
 * than by moving: `2c + e = 12` per ring, eight corners in total, so a ring
 * holds between two and six of them.
 */
export function enumerateAllShapeKeys(): readonly number[] {
  const keys: number[] = [];
  for (let upperCorners = 2; upperCorners <= 6; upperCorners += 1) {
    for (const upper of ringTilings(upperCorners)) {
      for (const lower of ringTilings(SQUARE1_CORNER_COUNT - upperCorners)) {
        keys.push(upper | (lower << RING_SLOTS));
      }
    }
  }
  return keys;
}

/**
 * The corner starts that sit on a cut boundary. The cut runs between slots
 * `2|3` and `8|9`, and a corner occupies `(i, i+1)`, so it straddles a boundary
 * exactly when its start is slot 2 or slot 8 — in either ring.
 */
export const CUT_STRADDLING_STARTS =
  (1 << 2) | (1 << 8) | (1 << (RING_SLOTS + 2)) | (1 << (RING_SLOTS + 8));

/** "Twistable": a slice is legal, which is Regulation 4b3d's second clause. */
export function isTwistableShapeKey(key: number): boolean {
  return (key & CUT_STRADDLING_STARTS) === 0;
}

/**
 * The slots a shape gives to corners and to edges, each in ascending slot
 * order, upper ring first — the ordering every coordinate in this package uses.
 */
export function shapePositionSlots(key: number): {
  readonly corners: readonly number[];
  readonly edges: readonly number[];
} {
  const corners: number[] = [];
  const edges: number[] = [];

  for (const ring of [0, RING_SLOTS]) {
    const starts = (key >>> ring) & ((1 << RING_SLOTS) - 1);
    for (let slot = 0; slot < RING_SLOTS; slot += 1) {
      if ((starts & (1 << slot)) !== 0) {
        corners.push(ring + slot);
        continue;
      }
      // The second half of a corner is the slot after its start; anything else
      // holds an edge.
      const previous = (slot + RING_SLOTS - 1) % RING_SLOTS;
      if ((starts & (1 << previous)) === 0) edges.push(ring + slot);
    }
  }

  return { corners, edges };
}

/** Builds the state a shape holds when its positions are filled in this order. */
export function stateForShape(
  key: number,
  corners: readonly number[],
  edges: readonly number[],
  middleFlipped: boolean,
): Square1State {
  const { corners: cornerSlots, edges: edgeSlots } = shapePositionSlots(key);
  if (cornerSlots.length !== corners.length || edgeSlots.length !== edges.length) {
    throw new Error('@cube/scrambler: Square-1 shape does not have that many positions');
  }

  const slots = new Array<number>(2 * RING_SLOTS).fill(-1);
  cornerSlots.forEach((slot, position) => {
    const ring = slot < RING_SLOTS ? 0 : RING_SLOTS;
    slots[slot] = corners[position]!;
    slots[ring + ((slot - ring + 1) % RING_SLOTS)] = corners[position]!;
  });
  edgeSlots.forEach((slot, position) => {
    slots[slot] = edges[position]! + SQUARE1_CORNER_COUNT;
  });

  return { slots, middleFlipped };
}

export interface Square1ShapeSpace {
  /** One state per reachable shape — enough to apply moves and read the result. */
  readonly representative: ReadonlyMap<number, Square1State>;
  /** Moves to the solved shape, in the axis-turn metric (a pair is 1, a slice is 1). */
  readonly distance: ReadonlyMap<number, number>;
}

let space: Square1ShapeSpace | undefined;

/**
 * Breadth-first search over shapes, carrying a representative state so the real
 * move functions do the work. The shape a move produces depends only on the
 * shape it started from — turns and the slice map slots to slots regardless of
 * which piece sits where — so one representative per shape is sufficient, and
 * reusing the verified state model means this is a genuine test of it rather
 * than a second, differently-buggy implementation of the slice.
 *
 * Memoised: the search visits ~19k shapes and is wanted repeatedly.
 */
export function square1ShapeSpace(): Square1ShapeSpace {
  if (space) return space;

  const turns = allLayerTurns();
  const representative = new Map<number, Square1State>();
  const distance = new Map<number, number>();
  const start = square1ShapeKey(SOLVED_SQUARE1_STATE);

  representative.set(start, SOLVED_SQUARE1_STATE);
  distance.set(start, 0);
  const queue: number[] = [start];

  for (let head = 0; head < queue.length; head += 1) {
    const key = queue[head]!;
    const state = representative.get(key)!;
    const depth = distance.get(key)! + 1;

    const successors: Square1State[] = turns.map((turn) => applySquare1LayerTurn(state, turn));
    if (isSliceLegal(state)) successors.push(applySquare1Slice(state));

    for (const successor of successors) {
      const successorKey = square1ShapeKey(successor);
      if (distance.has(successorKey)) continue;
      distance.set(successorKey, depth);
      representative.set(successorKey, successor);
      queue.push(successorKey);
    }
  }

  space = { representative, distance };
  return space;
}

/**
 * A sequence that returns `state` to the solved **shape**, ignoring where the
 * pieces end up — a greedy descent of the exact BFS distances, so each move
 * strictly reduces the remaining distance and the walk cannot loop.
 *
 * This is the shape half of what phase 1 will need. It is deliberately not a
 * solver: it says nothing about permutation.
 */
export function solveSquare1Shape(state: Square1State): Square1Move[] {
  const { distance } = square1ShapeSpace();
  const target = square1ShapeKey(SOLVED_SQUARE1_STATE);
  const turns = allLayerTurns();

  let current = state;
  let remaining = distance.get(square1ShapeKey(current));
  if (remaining === undefined) {
    throw new Error('@cube/scrambler: Square-1 state has a shape no move can produce');
  }

  const moves: Square1Move[] = [];
  while (square1ShapeKey(current) !== target) {
    const candidates: (readonly [Square1Move, Square1State])[] = turns.map((turn) => [
      turn,
      applySquare1LayerTurn(current, turn),
    ]);
    if (isSliceLegal(current)) candidates.push([SLICE, applySquare1Slice(current)]);

    const step = candidates.find(([, next]) => {
      const reached = distance.get(square1ShapeKey(next));
      return reached !== undefined && reached < remaining!;
    });
    if (!step) {
      // Unreachable: BFS distances always admit a descending neighbour.
      throw new Error('@cube/scrambler: Square-1 shape descent stalled');
    }

    moves.push(step[0]);
    current = step[1];
    remaining = distance.get(square1ShapeKey(current))!;
  }

  return moves;
}
