import { allLayerTurns, SLICE, type Square1Move } from './notation';
import {
  combinedParity,
  sliceParityFlip,
  sliceShapeKey,
  turnParityFlip,
  turnShapeKey,
} from './phase1-tables';
import { PERMUTATION_COUNT, permutationIndex } from './phase2-coordinates';
import { enumerateAllShapeKeys, shapePositionSlots } from './shapes';
import {
  applySquare1LayerTurn,
  applySquare1Slice,
  isSliceLegal,
  isSquare1Solved,
  SOLVED_SQUARE1_STATE,
  SQUARE1_CORNER_COUNT,
  square1ShapeKey,
  type Square1State,
} from './state';

/**
 * Exact distance-to-solved checking, for Regulation 4b3d.
 *
 * > An official scramble sequence must produce a random state from all states
 * > that require **at least 11 moves** to solve (equal probability for each
 * > state).
 *
 * The parenthetical is what makes this hard. Redrawing until the drawn state
 * qualifies keeps the distribution uniform *on the qualifying states*, because
 * the conditional distribution of a uniform draw is uniform on the condition.
 * Redrawing on an **approximate** test would not: states whose approximation
 * read low would be discarded even though they qualify, and the survivors would
 * no longer be uniform. So the test has to be exact, and this module is the
 * exact test.
 *
 * ## How it is exact without being expensive
 *
 * Proving "at least 11" by searching all 10-move sequences is hopeless — the
 * move set alternates 143 turns with one slice, so ten moves is on the order of
 * `143^5`. Two things make it cheap instead:
 *
 * 1. **An admissible lower bound that is usually enough on its own.** Any
 *    solution must also solve the *shape*, the permutation *parity* and the
 *    *middle piece*, so the exact distance in that three-part graph — 77,220
 *    nodes, tabulated once — can never exceed the real distance. The middle bit
 *    earns its place: it is the parity of the number of slices, so it can say
 *    "you still owe a slice" where shape alone cannot.
 * 2. **A bounded search only when the bound is inconclusive**, pruned by the
 *    same bound and with a visited set collapsing the many move orders that
 *    reach the same state. The visited set is not an optimisation but a
 *    necessity: without it, proving the bound-7 case took four seconds, because
 *    the search re-walks near-optimal shape-solving prefixes over and over.
 *
 * The result is exact either way: the search either produces a solution of ten
 * moves or fewer, which proves the state does *not* qualify, or exhausts every
 * such sequence, which proves it does.
 *
 * ## Metric
 *
 * "Moves" here is the WCA/TNoodle axis-turn metric this package uses
 * throughout — `(x, y)` is one move and `/` is one move. The regulation does
 * not define a Square-1 move (`wca-regulations#364`), so the threshold of 11 is
 * only meaningful relative to a metric, and this is the one official scramblers
 * are counted in.
 */

/** `(shape * 2 + parity) * 2 + middle` → exact moves to solved's shape, parity and middle. */
let table: Uint8Array | undefined;
let shapeIndex: ReadonlyMap<number, number> | undefined;

function solvedShapeTable(): { table: Uint8Array; indexOf: ReadonlyMap<number, number> } {
  if (table && shapeIndex) return { table, indexOf: shapeIndex };

  const keys = enumerateAllShapeKeys();
  const indexOf = new Map<number, number>(keys.map((key, index) => [key, index]));
  const distance = new Uint8Array(keys.length * 4).fill(255);
  const node = (shape: number, parity: number, middle: number): number =>
    (shape * 2 + parity) * 2 + middle;

  const start = node(
    indexOf.get(square1ShapeKey(SOLVED_SQUARE1_STATE))!,
    combinedParity(SOLVED_SQUARE1_STATE),
    SOLVED_SQUARE1_STATE.middleFlipped ? 1 : 0,
  );
  distance[start] = 0;
  const queue: number[] = [start];

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    const middle = current % 2;
    const parity = Math.floor(current / 2) % 2;
    const key = keys[Math.floor(current / 4)]!;
    const depth = distance[current]! + 1;

    const successors: number[] = [];
    for (const turn of allLayerTurns()) {
      successors.push(
        node(
          indexOf.get(turnShapeKey(key, turn.top, turn.bottom))!,
          parity ^ turnParityFlip(key, turn.top, turn.bottom),
          middle,
        ),
      );
    }
    const sliced = sliceShapeKey(key);
    if (sliced !== undefined) {
      successors.push(node(indexOf.get(sliced)!, parity ^ sliceParityFlip(key), 1 - middle));
    }

    for (const successor of successors) {
      if (distance[successor] !== 255) continue;
      distance[successor] = depth;
      queue.push(successor);
    }
  }

  table = distance;
  shapeIndex = indexOf;
  return { table: distance, indexOf };
}

/**
 * An admissible lower bound on the moves needed to solve `state`: the exact
 * distance in the `(shape, parity, middle)` graph, every part of which any real
 * solution must also cover.
 */
export function square1LowerBound(state: Square1State): number {
  const { table: distance, indexOf } = solvedShapeTable();
  const index = indexOf.get(square1ShapeKey(state));
  if (index === undefined) {
    throw new Error('@cubesmith/scrambler: Square-1 state has a shape the puzzle cannot make');
  }
  return distance[(index * 2 + combinedParity(state)) * 2 + (state.middleFlipped ? 1 : 0)]!;
}

/**
 * A number identifying a state exactly, for the visited set: shape, both
 * permutations and the middle bit, packed into one integer that stays well
 * inside the range a double represents exactly.
 */
function stateKey(state: Square1State): number {
  const shape = square1ShapeKey(state);
  const { corners, edges } = shapePositionSlots(shape);
  const cornerOrder = corners.map((slot) => state.slots[slot]!);
  const edgeOrder = edges.map((slot) => state.slots[slot]! - SQUARE1_CORNER_COUNT);
  return (
    ((solvedShapeTable().indexOf.get(shape)! * PERMUTATION_COUNT +
      permutationIndex(cornerOrder)) *
      PERMUTATION_COUNT +
      permutationIndex(edgeOrder)) *
      2 +
    (state.middleFlipped ? 1 : 0)
  );
}

const enum Previous {
  Nothing,
  Turn,
  Slice,
}

/**
 * The exact distance when it is at most `cap`, and `cap + 1` when it is more.
 *
 * Never returns an approximation: the value is either a length actually
 * achieved by a sequence of moves, or a proof that no sequence of `cap` moves
 * or fewer exists.
 */
export function square1DistanceCappedAt(state: Square1State, cap: number): number {
  if (isSquare1Solved(state)) return 0;
  if (square1LowerBound(state) > cap) return cap + 1;

  const turns = allLayerTurns();
  const seen = new Map<number, number>();

  const search = (current: Square1State, cost: number, bound: number, previous: Previous): boolean => {
    // The bound is checked *before* the goal: a solved state reached beyond the
    // bound is not a solution within it. Testing the goal first reported every
    // distance one short, which the brute-force comparison caught.
    if (cost + square1LowerBound(current) > bound) return false;
    if (isSquare1Solved(current)) return true;

    // Each state only has to be disproved once per depth. `previous` rides
    // along in the key because a state arrived at by a turn and the same state
    // arrived at by a slice have different moves available next.
    const key = stateKey(current) * 4 + previous;
    const cheapest = seen.get(key);
    if (cheapest !== undefined && cheapest <= cost) return false;
    seen.set(key, cost);

    if (previous !== Previous.Turn) {
      for (const turn of turns) {
        if (search(applySquare1LayerTurn(current, turn), cost + 1, bound, Previous.Turn)) {
          return true;
        }
      }
    }

    if (previous === Previous.Slice || !isSliceLegal(current)) return false;
    return search(applySquare1Slice(current), cost + 1, bound, Previous.Slice);
  };

  for (let bound = square1LowerBound(state); bound <= cap; bound += 1) {
    seen.clear();
    if (search(state, 0, bound, Previous.Nothing)) return bound;
  }
  return cap + 1;
}

/** Regulation 4b3d's first clause, decided exactly. */
export function isSquare1AtLeastMovesFromSolved(state: Square1State, minimum: number): boolean {
  return square1DistanceCappedAt(state, minimum - 1) >= minimum;
}

/**
 * A sequence of exactly `distance` moves proving the capped distance, for tests
 * that want the witness rather than the number. `undefined` when the state is
 * further away than `cap`.
 */
export function square1WitnessWithin(
  state: Square1State,
  cap: number,
): Square1Move[] | undefined {
  const distance = square1DistanceCappedAt(state, cap);
  if (distance > cap) return undefined;

  const turns = allLayerTurns();
  const path: Square1Move[] = [];

  const search = (current: Square1State, cost: number, bound: number, previous: Previous): boolean => {
    if (cost + square1LowerBound(current) > bound) return false;
    if (isSquare1Solved(current)) return cost === bound;

    if (previous !== Previous.Turn) {
      for (const turn of turns) {
        path.push(turn);
        if (search(applySquare1LayerTurn(current, turn), cost + 1, bound, Previous.Turn)) {
          return true;
        }
        path.pop();
      }
    }

    if (previous === Previous.Slice || !isSliceLegal(current)) return false;
    path.push(SLICE);
    if (search(applySquare1Slice(current), cost + 1, bound, Previous.Slice)) return true;
    path.pop();
    return false;
  };

  if (!search(state, 0, distance, Previous.Nothing)) {
    throw new Error('@cubesmith/scrambler: Square-1 distance and witness disagree');
  }
  return [...path];
}
