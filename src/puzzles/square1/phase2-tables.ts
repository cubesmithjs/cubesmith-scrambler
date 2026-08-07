import { allLayerTurns, type Square1LayerTurn } from './notation';
import {
  alignmentIndex,
  canonicalPhase2State,
  cornerPositionSlots,
  edgePositionSlots,
  PERMUTATION_COUNT,
  permutationFromIndex,
  permutationIndex,
  permutationParityOfIndex,
  PHASE2_ALIGNMENT_COUNT,
  SOLVED_ALIGNMENT_INDEX,
  square1AlignmentsOf,
  type Phase2Coordinate,
} from './phase2-coordinates';
import {
  applySquare1LayerTurn,
  applySquare1Slice,
  hasSquareLayers,
  isSliceLegal,
  SQUARE1_CORNER_COUNT,
  type Square1State,
} from './state';

/**
 * Phase-2 move tables and pruning tables.
 *
 * ## What a phase-2 move is
 *
 * Phase 2 never leaves the square-layers set, so its moves are:
 *
 * - **every** layer turn — a turn only rotates a ring, so a square layer stays
 *   square whatever the amount;
 * - the **slice**, but only from the two *complementary* alignment pairs
 *   `(0,1)` and `(1,0)`. From `(0,0)` or `(1,1)` a slice destroys square layers
 *   (it reverses the moving arc — `state.ts`), and alignment 2 cannot be sliced
 *   at all.
 *
 * None of that is assumed here. Every entry below is **derived** by applying
 * the move to a canonical state with the real functions of `state.ts` and
 * reading off what happened, and the tests check the derived table against the
 * model again independently.
 *
 * ## Why the tables are small
 *
 * A move sends the piece at position `i` to position `map[i]`, and that map
 * depends only on the alignment and the move — never on which pieces are where.
 * There turn out to be very few distinct maps (a turn shifts each ring's four
 * positions cyclically, so the map is fixed by the two "carry" amounts), so one
 * table of `distinctMaps x 8!` covers every permutation transition.
 *
 * ## The invariant phase 1 has to respect
 *
 * The classic Square-1 decomposition has phase 1 deliver "a cube with an **even
 * permutation** of pieces", and something equivalent really is required here:
 * of the 72 classes `(alignment, middle, corner parity, edge parity)`, phase 2
 * can reach **exactly 36** from solved. Hand a state in one of the other 36 to
 * phase 2 and it will search forever and find nothing.
 *
 * The reachable half is `parity(corners) XOR parity(edges) = [upper alignment
 * is 0] XOR [lower alignment is 0]` — which looks odd only because it is stated
 * in *this package's* position ordering. Positions are numbered by ascending
 * slot, and for alignment 0 that ordering happens to be cyclically natural
 * while for alignments 1 and 2 the wrapped piece sorts to the front, an extra
 * 4-cycle that flips the parity of both permutations by a ring-dependent
 * amount. Underneath is the ordinary "corner and edge permutations must agree".
 *
 * Two wrong turns got taken here before the tests found this. First the
 * invariant was asserted with the wrong argument ("a turn shifts a ring's
 * corners and edges by the same carry" — it does not, `(1,0)` wraps an edge and
 * no corner). Then, when a square-layer walk duly reached both values of
 * `parity(corners) XOR parity(edges)`, the invariant was dropped altogether —
 * but the walk had only been changing alignment. So the classes below are
 * **computed** by breadth-first search rather than reasoned about, and the
 * reasoning is offered only as commentary.
 */

export interface Phase2MoveTables {
  readonly turns: readonly Square1LayerTurn[];
  /** `turnAlignment[alignment * turns.length + turn]` */
  readonly turnAlignment: Int32Array;
  readonly turnCornerMap: Int32Array;
  readonly turnEdgeMap: Int32Array;
  /** `-1` where a slice would leave the square-layers set (or is blocked outright). */
  readonly sliceAlignment: Int32Array;
  readonly sliceCornerMap: Int32Array;
  readonly sliceEdgeMap: Int32Array;
  /** The distinct position maps, deduplicated. */
  readonly maps: readonly (readonly number[])[];
  /** `permMove[map * 40320 + permutation]` — the permutation after that map. */
  readonly permMove: Int32Array;
}

interface DerivedMove {
  readonly alignment: number;
  readonly cornerMap: readonly number[];
  readonly edgeMap: readonly number[];
}

/**
 * Where each piece ends up, read off the real state model. The canonical state
 * has piece `p` at position `p`, so "the piece at new position `q`" *is* the
 * old position that maps to `q`.
 */
function deriveMove(alignment: number, next: Square1State): DerivedMove | undefined {
  if (!hasSquareLayers(next)) return undefined;

  const alignments = square1AlignmentsOf(next);
  const landed = alignmentIndex(alignments[0], alignments[1]);
  const cornerMap = new Array<number>(SQUARE1_CORNER_COUNT).fill(-1);
  const edgeMap = new Array<number>(SQUARE1_CORNER_COUNT).fill(-1);

  cornerPositionSlots(landed).forEach((slot, position) => {
    cornerMap[next.slots[slot]!] = position;
  });
  edgePositionSlots(landed).forEach((slot, position) => {
    edgeMap[next.slots[slot]! - SQUARE1_CORNER_COUNT] = position;
  });

  if (cornerMap.includes(-1) || edgeMap.includes(-1)) {
    throw new Error(`@cubesmith/scrambler: incoherent Square-1 phase-2 move from alignment ${alignment}`);
  }
  return { alignment: landed, cornerMap, edgeMap };
}

function applyMapToPermutation(
  permutation: readonly number[],
  map: readonly number[],
): number[] {
  const next = new Array<number>(permutation.length).fill(-1);
  for (let position = 0; position < permutation.length; position += 1) {
    next[map[position]!] = permutation[position]!;
  }
  return next;
}

let tables: Phase2MoveTables | undefined;

export function phase2MoveTables(): Phase2MoveTables {
  if (tables) return tables;

  const turns = allLayerTurns();
  const turnCount = turns.length;
  const turnAlignment = new Int32Array(PHASE2_ALIGNMENT_COUNT * turnCount);
  const turnCornerMap = new Int32Array(PHASE2_ALIGNMENT_COUNT * turnCount);
  const turnEdgeMap = new Int32Array(PHASE2_ALIGNMENT_COUNT * turnCount);
  const sliceAlignment = new Int32Array(PHASE2_ALIGNMENT_COUNT).fill(-1);
  const sliceCornerMap = new Int32Array(PHASE2_ALIGNMENT_COUNT).fill(-1);
  const sliceEdgeMap = new Int32Array(PHASE2_ALIGNMENT_COUNT).fill(-1);

  const maps: number[][] = [];
  const mapIds = new Map<string, number>();
  const intern = (map: readonly number[]): number => {
    const key = map.join(',');
    const existing = mapIds.get(key);
    if (existing !== undefined) return existing;
    mapIds.set(key, maps.length);
    maps.push([...map]);
    return maps.length - 1;
  };

  for (let alignment = 0; alignment < PHASE2_ALIGNMENT_COUNT; alignment += 1) {
    const canonical = canonicalPhase2State(alignment);

    for (const [index, turn] of turns.entries()) {
      const derived = deriveMove(alignment, applySquare1LayerTurn(canonical, turn));
      if (!derived) {
        // A turn cannot break square layers; if one did, the model changed.
        throw new Error('@cubesmith/scrambler: a Square-1 layer turn left the square-layers set');
      }
      const at = alignment * turnCount + index;
      turnAlignment[at] = derived.alignment;
      turnCornerMap[at] = intern(derived.cornerMap);
      turnEdgeMap[at] = intern(derived.edgeMap);
    }

    if (!isSliceLegal(canonical)) continue;
    const derived = deriveMove(alignment, applySquare1Slice(canonical));
    if (!derived) continue;
    sliceAlignment[alignment] = derived.alignment;
    sliceCornerMap[alignment] = intern(derived.cornerMap);
    sliceEdgeMap[alignment] = intern(derived.edgeMap);
  }

  const permMove = new Int32Array(maps.length * PERMUTATION_COUNT);
  for (let permutation = 0; permutation < PERMUTATION_COUNT; permutation += 1) {
    const decoded = permutationFromIndex(permutation, SQUARE1_CORNER_COUNT);
    for (const [map, positions] of maps.entries()) {
      permMove[map * PERMUTATION_COUNT + permutation] = permutationIndex(
        applyMapToPermutation(decoded, positions),
      );
    }
  }

  tables = {
    turns,
    turnAlignment,
    turnCornerMap,
    turnEdgeMap,
    sliceAlignment,
    sliceCornerMap,
    sliceEdgeMap,
    maps,
    permMove,
  };
  return tables;
}

/** `(alignment * 2 + middle) * 8! + permutation` */
export const PHASE2_TABLE_SIZE = PHASE2_ALIGNMENT_COUNT * 2 * PERMUTATION_COUNT;

export function pruningIndex(
  alignment: number,
  middleFlipped: boolean,
  permutation: number,
): number {
  return ((alignment * 2 + (middleFlipped ? 1 : 0)) * PERMUTATION_COUNT) + permutation;
}

/**
 * An exact breadth-first distance over one half of the state: alignment, the
 * middle bit, and *either* the corner or the edge permutation, with the other
 * ignored entirely.
 *
 * **Why it is admissible.** Dropping one of the two permutations is a
 * homomorphic projection: every phase-2 move acts on the projected state in a
 * way that depends only on the projected state. So any real solution, replayed
 * on the projection, solves the projection in the same number of moves —
 * therefore the projection's *shortest* distance can never exceed the real one.
 * The maximum of the two projections is a lower bound for the same reason.
 *
 * The middle bit is kept in both tables deliberately: it is the parity of the
 * number of slices, so including it makes the table say "you still owe an odd
 * number of slices", which no permutation coordinate on its own can see.
 */
function buildPruningTable(corners: boolean): Uint8Array {
  const {
    turns,
    turnAlignment,
    turnCornerMap,
    turnEdgeMap,
    sliceAlignment,
    sliceCornerMap,
    sliceEdgeMap,
    permMove,
  } = phase2MoveTables();

  const turnMap = corners ? turnCornerMap : turnEdgeMap;
  const sliceMap = corners ? sliceCornerMap : sliceEdgeMap;
  const turnCount = turns.length;

  const distance = new Uint8Array(PHASE2_TABLE_SIZE).fill(255);
  const queue = new Int32Array(PHASE2_TABLE_SIZE);
  const start = pruningIndex(SOLVED_ALIGNMENT_INDEX, false, 0);
  distance[start] = 0;
  queue[0] = start;
  let tail = 1;

  for (let head = 0; head < tail; head += 1) {
    const index = queue[head]!;
    const permutation = index % PERMUTATION_COUNT;
    const rest = (index - permutation) / PERMUTATION_COUNT;
    const middle = rest % 2;
    const alignment = (rest - middle) / 2;
    const depth = distance[index]! + 1;

    for (let turn = 0; turn < turnCount; turn += 1) {
      const at = alignment * turnCount + turn;
      const landedPermutation = permMove[turnMap[at]! * PERMUTATION_COUNT + permutation]!;
      const next =
        (turnAlignment[at]! * 2 + middle) * PERMUTATION_COUNT + landedPermutation;
      if (distance[next] !== 255) continue;
      distance[next] = depth;
      queue[tail] = next;
      tail += 1;
    }

    const sliced = sliceAlignment[alignment]!;
    if (sliced < 0) continue;
    const landedPermutation = permMove[sliceMap[alignment]! * PERMUTATION_COUNT + permutation]!;
    const next = (sliced * 2 + (1 - middle)) * PERMUTATION_COUNT + landedPermutation;
    if (distance[next] !== 255) continue;
    distance[next] = depth;
    queue[tail] = next;
    tail += 1;
  }

  return distance;
}

/** `(alignment, middle, corner parity, edge parity)` — the coarsest useful abstraction. */
export const PHASE2_CLASS_COUNT = PHASE2_ALIGNMENT_COUNT * 2 * 2 * 2;

export function phase2ClassIndex(
  alignment: number,
  middleFlipped: boolean,
  cornerParity: number,
  edgeParity: number,
): number {
  return ((alignment * 2 + (middleFlipped ? 1 : 0)) * 2 + cornerParity) * 2 + edgeParity;
}

function permutationMapParity(map: readonly number[]): number {
  const seen = new Array<boolean>(map.length).fill(false);
  let transpositions = 0;
  for (let start = 0; start < map.length; start += 1) {
    if (seen[start]) continue;
    let length = 0;
    for (let at = start; !seen[at]; at = map[at]!) {
      seen[at] = true;
      length += 1;
    }
    transpositions += length - 1;
  }
  return transpositions % 2;
}

let reachableClasses: Uint8Array | undefined;

/**
 * Which of the 72 classes phase 2 can reach from solved, by breadth-first
 * search over the derived tables. Exactly half of them, and a state outside
 * that half is one phase 2 cannot solve at all — so this is the goal condition
 * phase 1 must satisfy, not merely an optimisation.
 */
export function phase2ReachableClasses(): Uint8Array {
  if (reachableClasses) return reachableClasses;

  const tables = phase2MoveTables();
  const turnCount = tables.turns.length;
  const parityOfMap = tables.maps.map(permutationMapParity);

  const reachable = new Uint8Array(PHASE2_CLASS_COUNT);
  const start = phase2ClassIndex(SOLVED_ALIGNMENT_INDEX, false, 0, 0);
  reachable[start] = 1;
  const queue = [start];

  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head]!;
    const edgeParity = node % 2;
    const cornerParity = Math.floor(node / 2) % 2;
    const middle = Math.floor(node / 4) % 2;
    const alignment = Math.floor(node / 8);

    const successors: number[] = [];
    for (let turn = 0; turn < turnCount; turn += 1) {
      const at = alignment * turnCount + turn;
      successors.push(
        phase2ClassIndex(
          tables.turnAlignment[at]!,
          middle === 1,
          cornerParity ^ parityOfMap[tables.turnCornerMap[at]!]!,
          edgeParity ^ parityOfMap[tables.turnEdgeMap[at]!]!,
        ),
      );
    }
    const sliced = tables.sliceAlignment[alignment]!;
    if (sliced >= 0) {
      successors.push(
        phase2ClassIndex(
          sliced,
          middle === 0,
          cornerParity ^ parityOfMap[tables.sliceCornerMap[alignment]!]!,
          edgeParity ^ parityOfMap[tables.sliceEdgeMap[alignment]!]!,
        ),
      );
    }

    for (const successor of successors) {
      if (reachable[successor] === 1) continue;
      reachable[successor] = 1;
      queue.push(successor);
    }
  }

  reachableClasses = reachable;
  return reachable;
}

/** Whether phase 2 can solve this coordinate at all. */
export function isPhase2Reachable(coordinate: Phase2Coordinate): boolean {
  return (
    phase2ReachableClasses()[
      phase2ClassIndex(
        coordinate.alignment,
        coordinate.middleFlipped,
        permutationParityOfIndex(coordinate.corners),
        permutationParityOfIndex(coordinate.edges),
      )
    ] === 1
  );
}

/**
 * A whole phase-2 state in one number: `9 x 2 x 8! x 8! = 29,262,643,200`, well
 * inside the integers a double represents exactly.
 */
export function phase2StateKey(
  alignment: number,
  middleFlipped: boolean,
  corners: number,
  edges: number,
): number {
  return ((alignment * 2 + (middleFlipped ? 1 : 0)) * PERMUTATION_COUNT + corners) *
    PERMUTATION_COUNT + edges;
}

/**
 * How far the backward table reaches. **Eight**, and the number is chosen by
 * measuring, because the alternating move set makes the frontier grow in steps
 * rather than smoothly — a turn opens 143 ways, a slice exactly one:
 *
 * ```
 *   radius  1     2     3      4      5       6       7        8        9
 *   states  144   176   4,752  5,744  67,104  79,968  763,776  905,728  ~9M
 * ```
 *
 * Eight is where the curve is kindest: it holds only 19% more states than seven
 * and buys a whole extra move, while nine is an order of magnitude more. Every
 * move the table supplies is a move the forward search does not have to branch
 * on, and the search branches ~32 per *pair* of moves — so eight moves of tail
 * is the difference between a search that takes seconds and one that takes
 * milliseconds.
 */
export const PHASE2_BACKWARD_RADIUS = 8;

export interface Phase2BackwardTable {
  /** Open-addressed keys; `-1` marks an empty slot. */
  readonly keys: Float64Array;
  readonly distances: Uint8Array;
  readonly mask: number;
  readonly size: number;
}

let backwardTable: Phase2BackwardTable | undefined;

/**
 * Hashed from the *components*, never from the packed key: the key runs to
 * 2.9e10, and splitting a number that large into halves needs a float modulo,
 * which turned out to cost more than everything else in the build put together.
 * Integer multiplies on the three small components are free by comparison.
 */
function hashComponents(
  alignment: number,
  middle: number,
  corners: number,
  edges: number,
  mask: number,
): number {
  return (
    (Math.imul(corners, 2_654_435_761) ^
      Math.imul(edges, 40_503) ^
      Math.imul(alignment * 2 + middle, 2_246_822_519)) &
    mask
  );
}

export function phase2BackwardLookup(
  table: Phase2BackwardTable,
  alignment: number,
  middle: number,
  corners: number,
  edges: number,
): number {
  const key = phase2StateKey(alignment, middle === 1, corners, edges);
  let slot = hashComponents(alignment, middle, corners, edges, table.mask);
  for (;;) {
    const stored = table.keys[slot]!;
    if (stored === key) return table.distances[slot]!;
    if (stored === -1) return -1;
    slot = (slot + 1) & table.mask;
  }
}

/**
 * Every phase-2 state within `PHASE2_BACKWARD_RADIUS` of solved, with its exact
 * distance — the far half of a meet in the middle.
 *
 * Nothing about optimality is given up by finishing from here: the distances
 * are exact, so `cost + distance` is the true length of the path found, and
 * IDA\* still returns an optimal phase-2 solution.
 *
 * Stored as an open-addressed hash in two typed arrays rather than a `Map`,
 * because 900,000 entries in a `Map` is tens of megabytes of object overhead
 * for the same information that fits in twenty.
 */
export function phase2BackwardTable(): Phase2BackwardTable {
  if (backwardTable) return backwardTable;

  const {
    turns,
    turnAlignment,
    turnCornerMap,
    turnEdgeMap,
    sliceAlignment,
    sliceCornerMap,
    sliceEdgeMap,
    permMove,
  } = phase2MoveTables();
  const turnCount = turns.length;

  // Sized for a load factor near 0.45, so probes stay short.
  let capacity = 2;
  while (capacity < 2_000_000) capacity *= 2;
  const mask = capacity - 1;
  const keys = new Float64Array(capacity).fill(-1);
  const distances = new Uint8Array(capacity);
  let size = 0;

  const insert = (
    alignment: number,
    middle: number,
    corners: number,
    edges: number,
    depth: number,
  ): boolean => {
    const key = phase2StateKey(alignment, middle === 1, corners, edges);
    let slot = hashComponents(alignment, middle, corners, edges, mask);
    for (;;) {
      const stored = keys[slot]!;
      if (stored === key) return false;
      if (stored === -1) {
        keys[slot] = key;
        distances[slot] = depth;
        size += 1;
        return true;
      }
      slot = (slot + 1) & mask;
    }
  };

  // Frontiers are parallel typed arrays: at radius 8 one of them holds ~700,000
  // nodes, and allocating an object per node would dominate the build.
  let frontierAlignment = Int32Array.of(SOLVED_ALIGNMENT_INDEX);
  let frontierMiddle = Int32Array.of(0);
  let frontierCorners = Int32Array.of(0);
  let frontierEdges = Int32Array.of(0);
  insert(SOLVED_ALIGNMENT_INDEX, 0, 0, 0, 0);

  for (let depth = 1; depth <= PHASE2_BACKWARD_RADIUS; depth += 1) {
    const capacityGuess = frontierAlignment.length * (turnCount + 1);
    const nextAlignment = new Int32Array(capacityGuess);
    const nextMiddle = new Int32Array(capacityGuess);
    const nextCorners = new Int32Array(capacityGuess);
    const nextEdges = new Int32Array(capacityGuess);
    let count = 0;

    const consider = (
      alignment: number,
      middle: number,
      corners: number,
      edges: number,
    ): void => {
      if (!insert(alignment, middle, corners, edges, depth)) return;
      nextAlignment[count] = alignment;
      nextMiddle[count] = middle;
      nextCorners[count] = corners;
      nextEdges[count] = edges;
      count += 1;
    };

    for (let index = 0; index < frontierAlignment.length; index += 1) {
      const alignment = frontierAlignment[index]!;
      const middle = frontierMiddle[index]!;
      const corners = frontierCorners[index]!;
      const edges = frontierEdges[index]!;

      for (let turn = 0; turn < turnCount; turn += 1) {
        const at = alignment * turnCount + turn;
        consider(
          turnAlignment[at]!,
          middle,
          permMove[turnCornerMap[at]! * PERMUTATION_COUNT + corners]!,
          permMove[turnEdgeMap[at]! * PERMUTATION_COUNT + edges]!,
        );
      }

      const sliced = sliceAlignment[alignment]!;
      if (sliced < 0) continue;
      consider(
        sliced,
        1 - middle,
        permMove[sliceCornerMap[alignment]! * PERMUTATION_COUNT + corners]!,
        permMove[sliceEdgeMap[alignment]! * PERMUTATION_COUNT + edges]!,
      );
    }

    frontierAlignment = nextAlignment.subarray(0, count);
    frontierMiddle = nextMiddle.subarray(0, count);
    frontierCorners = nextCorners.subarray(0, count);
    frontierEdges = nextEdges.subarray(0, count);
  }

  backwardTable = { keys, distances, mask, size };
  return backwardTable;
}

let cornerTable: Uint8Array | undefined;
let edgeTable: Uint8Array | undefined;

/**
 * The corner table, which is **also** the edge table.
 *
 * Building both and comparing them showed they agree in all 725,760 entries,
 * even though the two map tables are not the same array of map ids. They have
 * to: at every alignment the moves act on the eight edge positions exactly as
 * they act on the eight corner positions — a turn shifts each ring's four
 * cyclically, a slice swaps two pairs — so the two abstractions are the same
 * graph with the pieces renamed, and a renaming cannot change distances.
 *
 * So one table is built and looked up twice, at the corner permutation and at
 * the edge permutation. `phase2-tables.test.ts` builds the edge table
 * explicitly and asserts the equality, which is what keeps this from being a
 * convenient assumption.
 */
export function phase2CornerPruning(): Uint8Array {
  cornerTable ??= buildPruningTable(true);
  return cornerTable;
}

/**
 * Deliberately the same table — see `phase2CornerPruning`. Pass
 * `rebuild: true` to construct the edge-specific one, which only the test that
 * verifies the equality has any reason to do.
 */
export function phase2EdgePruning(rebuild = false): Uint8Array {
  if (!rebuild) return phase2CornerPruning();
  edgeTable ??= buildPruningTable(false);
  return edgeTable;
}
