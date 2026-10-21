import {
  ALL_MOVES_FTO,
  buildProjection,
  centreColoursValue,
  cornerPieceValue,
  cornersValue,
  edgePiecesValue,
  edgesValue,
  moveCentreAValue,
  moveCentreBValue,
  moveCornerPieceValue,
  moveCornersValue,
  moveEdgePiecesValue,
  moveEdgesValue,
  moveIndexFto,
  type Projection,
} from './coordinates';
import {
  BLOCK_CORNER_INDEX,
  CENTRE_ORBIT_SIZE,
  EDGE_COUNT_FTO,
  type FtoTurnTable,
} from './geometry';
import { centreColour, getFtoTurnTable, SOLVED_FTO_STATE } from './state';
import { buildMod3Table, buildPairTable } from './tables';

/**
 * The three phases of the FTO solver, and everything each one looks at.
 *
 * A reduction, like `444` and `sq1` here: each phase shrinks the set of moves
 * the next one may use, by solving exactly the pieces those moves cannot reach.
 * The structure is the one xyzzy published for FTO (`fto_event_plan`
 * `01-solver-design.md` §2); this is an independent implementation of it, and
 * the sizes below are checked against that design's stated figures in
 * `phases.test.ts` rather than copied from it.
 *
 * 1. **All sixteen turns** → solve the *block*: every piece that none of
 *    `U F R L` touches. That is the corner where `D B BR BL` meet, the four
 *    edges at it, and the four centres pointing at it.
 * 2. **`U F R L`** (they leave the block alone) → solve every piece those four
 *    reach but `U` and `L` do not, and leave the rest in a state `⟨U, L⟩` can
 *    finish. That is one corner, three edges and six centres — and the four
 *    remaining corners' twists, which `⟨U, L⟩` constrains more than the full
 *    puzzle does.
 * 3. **`U L`** → finish, by descent through a table of exact distances (stored
 *    mod 3) over all 63,504,000 states the two faces can reach.
 *
 * 🔴 Nothing here lists a piece by hand. Each phase's targets are *computed*
 * from which slots its move set touches, so the phases cannot drift from the
 * geometry.
 */

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

export const PHASE1_MOVES: readonly number[] = range(ALL_MOVES_FTO.length);
export const PHASE2_MOVES: readonly number[] = (['U', 'F', 'R', 'L'] as const).flatMap((f) => [
  moveIndexFto(f, 1),
  moveIndexFto(f, 2),
]);
export const PHASE3_MOVES: readonly number[] = (['U', 'L'] as const).flatMap((f) => [
  moveIndexFto(f, 1),
  moveIndexFto(f, 2),
]);

const TABLES: readonly FtoTurnTable[] = ALL_MOVES_FTO.map((m) => getFtoTurnTable(m.face, m.amount));

type Destinations = (t: FtoTurnTable) => readonly number[];

function movedSlots(moves: readonly number[], of: Destinations): Set<number> {
  const moved = new Set<number>();
  for (const m of moves) {
    of(TABLES[m]!).forEach((d, i) => {
      if (d !== i) moved.add(i);
    });
  }
  return moved;
}

function slotsWhere(size: number, keep: (slot: number) => boolean): number[] {
  return range(size).filter(keep);
}

const cornerDest: Destinations = (t) => t.cornerDestination;
const edgeDest: Destinations = (t) => t.edgeDestination;
const centreADest: Destinations = (t) => t.centreADestination;
const centreBDest: Destinations = (t) => t.centreBDestination;

const moved2 = {
  corners: movedSlots(PHASE2_MOVES, cornerDest),
  edges: movedSlots(PHASE2_MOVES, edgeDest),
  centreA: movedSlots(PHASE2_MOVES, centreADest),
  centreB: movedSlots(PHASE2_MOVES, centreBDest),
};
const moved3 = {
  edges: movedSlots(PHASE3_MOVES, edgeDest),
  centreA: movedSlots(PHASE3_MOVES, centreADest),
  centreB: movedSlots(PHASE3_MOVES, centreBDest),
};

/** Pieces solved by phase 1 — the ones `U F R L` never move. */
export const BLOCK = {
  edges: slotsWhere(EDGE_COUNT_FTO, (s) => !moved2.edges.has(s)),
  centreA: slotsWhere(CENTRE_ORBIT_SIZE, (s) => !moved2.centreA.has(s)),
  centreB: slotsWhere(CENTRE_ORBIT_SIZE, (s) => !moved2.centreB.has(s)),
};

/** Pieces solved by phase 2 — the ones `U F R L` move and `U L` do not. */
export const PHASE2_TARGETS = {
  edges: slotsWhere(EDGE_COUNT_FTO, (s) => moved2.edges.has(s) && !moved3.edges.has(s)),
  centreA: slotsWhere(CENTRE_ORBIT_SIZE, (s) => moved2.centreA.has(s) && !moved3.centreA.has(s)),
  centreB: slotsWhere(CENTRE_ORBIT_SIZE, (s) => moved2.centreB.has(s) && !moved3.centreB.has(s)),
};

if (moved2.corners.has(BLOCK_CORNER_INDEX)) {
  throw new Error('fto-phases: U F R L must not move the block corner');
}

/**
 * The colour map phase 1 sees a centre orbit through: the colours its block
 * slots need keep their own code, and every other colour becomes `4`, "not one
 * of those". Two colours of four distinguished is what makes the projection
 * 18,480 values rather than 369,600.
 */
function blockRecolour(blockSlots: readonly number[]): number[] {
  const kept = new Set(blockSlots.map(centreColour));
  return range(4).map((c) => (kept.has(c) ? c : 4));
}

export const RECOLOUR_A1 = blockRecolour(BLOCK.centreA);
export const RECOLOUR_B1 = blockRecolour(BLOCK.centreB);
export const IDENTITY_COLOURS: readonly number[] = range(4);

/** A goal flag per projection value: does every listed slot show its home colour (through `recolour`)? */
function centreGoal(p: Projection, slots: readonly number[], recolour: readonly number[]): Uint8Array {
  const goal = new Uint8Array(p.size);
  for (let i = 0; i < p.size; i += 1) {
    const value = p.valueAt(i);
    goal[i] = slots.every((s) => value[s] === recolour[centreColour(s)]) ? 1 : 0;
  }
  return goal;
}

/** Goal flags for a "where are these pieces" projection: every piece at its own slot. */
function piecesHomeGoal(p: Projection, pieces: readonly number[]): Uint8Array {
  const goal = new Uint8Array(p.size);
  for (let i = 0; i < p.size; i += 1) {
    goal[i] = p.valueAt(i).every((slot, k) => slot === pieces[k]) ? 1 : 0;
  }
  return goal;
}

function memo<T>(build: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= build());
}

// --- phase 1 ---------------------------------------------------------------

export const phase1Projections = memo(() => {
  const solved = SOLVED_FTO_STATE;
  return {
    edges: buildProjection(edgePiecesValue(solved, BLOCK.edges), PHASE1_MOVES, moveEdgePiecesValue),
    corner: buildProjection(
      cornerPieceValue(solved, BLOCK_CORNER_INDEX),
      PHASE1_MOVES,
      moveCornerPieceValue,
    ),
    centreA: buildProjection(
      centreColoursValue(solved.centreA, RECOLOUR_A1),
      PHASE1_MOVES,
      moveCentreAValue,
    ),
    centreB: buildProjection(
      centreColoursValue(solved.centreB, RECOLOUR_B1),
      PHASE1_MOVES,
      moveCentreBValue,
    ),
  };
});

export const phase1Tables = memo(() => {
  const p = phase1Projections();
  // The block corner is home when it is in its own slot *and* untwisted.
  const cornerHome = new Uint8Array(p.corner.size);
  for (let i = 0; i < p.corner.size; i += 1) {
    const [slot, twist] = p.corner.valueAt(i);
    cornerHome[i] = slot === BLOCK_CORNER_INDEX && twist === 0 ? 1 : 0;
  }
  return {
    edges: buildPairTable(p.edges, p.corner, piecesHomeGoal(p.edges, BLOCK.edges), cornerHome),
    centreA: buildPairTable(
      p.centreA,
      p.corner,
      centreGoal(p.centreA, BLOCK.centreA, RECOLOUR_A1),
      cornerHome,
    ),
    centreB: buildPairTable(
      p.centreB,
      p.corner,
      centreGoal(p.centreB, BLOCK.centreB, RECOLOUR_B1),
      cornerHome,
    ),
  };
});

// --- phase 3 (before 2, which needs its corner set) -------------------------

export const phase3Projections = memo(() => {
  const solved = SOLVED_FTO_STATE;
  return {
    centreA: buildProjection(
      centreColoursValue(solved.centreA, IDENTITY_COLOURS),
      PHASE3_MOVES,
      moveCentreAValue,
    ),
    centreB: buildProjection(
      centreColoursValue(solved.centreB, IDENTITY_COLOURS),
      PHASE3_MOVES,
      moveCentreBValue,
    ),
    edges: buildProjection(edgesValue(solved), PHASE3_MOVES, moveEdgesValue),
    corners: buildProjection(cornersValue(solved), PHASE3_MOVES, moveCornersValue),
  };
});

/** Distances mod 3 over everything `⟨U, L⟩` reaches: two bits per state, 15.9 MB. See `buildMod3Table`. */
export const phase3Table = memo(() => {
  const p = phase3Projections();
  return buildMod3Table(p.centreA, p.centreB, p.edges, p.corners);
});

// --- phase 2 ---------------------------------------------------------------

export const phase2Projections = memo(() => {
  const solved = SOLVED_FTO_STATE;
  return {
    edges: buildProjection(
      edgePiecesValue(solved, PHASE2_TARGETS.edges),
      PHASE2_MOVES,
      moveEdgePiecesValue,
    ),
    corners: buildProjection(cornersValue(solved), PHASE2_MOVES, moveCornersValue),
    centreA: buildProjection(
      centreColoursValue(solved.centreA, IDENTITY_COLOURS),
      PHASE2_MOVES,
      moveCentreAValue,
    ),
    centreB: buildProjection(
      centreColoursValue(solved.centreB, IDENTITY_COLOURS),
      PHASE2_MOVES,
      moveCentreBValue,
    ),
    /**
     * Every edge, not just phase 2's three. No phase-2 table reads it; it exists so
     * that a phase-2 endpoint's phase-3 coordinate is a lookup ({@link phase2To3}),
     * which is what lets the search score thousands of endpoints instead of a few.
     */
    allEdges: buildProjection(edgesValue(solved), PHASE2_MOVES, moveEdgesValue),
  };
});

/**
 * Phase 2's coordinates, mapped straight onto phase 3's: `-1` where the value is
 * not one `⟨U, L⟩` reaches. With these, the phase-3 table index of any phase-2
 * search node is four array reads — no state is rebuilt, no string is hashed.
 */
export const phase2To3 = memo(() => {
  const p2 = phase2Projections();
  const p3 = phase3Projections();
  const map = (from: Projection, to: Projection): Int32Array => {
    const out = new Int32Array(from.size);
    for (let i = 0; i < from.size; i += 1) out[i] = to.indexOf(from.valueAt(i));
    return out;
  };
  return {
    centreA: map(p2.centreA, p3.centreA),
    centreB: map(p2.centreB, p3.centreB),
    corners: map(p2.corners, p3.corners),
    edges: map(p2.allEdges, p3.edges),
  };
});

export const phase2Tables = memo(() => {
  const p = phase2Projections();
  const corners3 = phase3Projections().corners;
  const edgesHome = piecesHomeGoal(p.edges, PHASE2_TARGETS.edges);
  // The corners are finished when `⟨U, L⟩` can take them the rest of the way.
  const cornersFinishable = new Uint8Array(p.corners.size);
  for (let i = 0; i < p.corners.size; i += 1) {
    cornersFinishable[i] = corners3.indexOf(p.corners.valueAt(i)) >= 0 ? 1 : 0;
  }
  return {
    centreA: buildPairTable(
      p.centreA,
      p.edges,
      centreGoal(p.centreA, PHASE2_TARGETS.centreA, IDENTITY_COLOURS),
      edgesHome,
    ),
    centreB: buildPairTable(
      p.centreB,
      p.edges,
      centreGoal(p.centreB, PHASE2_TARGETS.centreB, IDENTITY_COLOURS),
      edgesHome,
    ),
    corners: buildPairTable(p.corners, p.edges, cornersFinishable, edgesHome),
  };
});

/**
 * Builds every table the solver reads — all three phases — and nothing else.
 * Memoised, so a second call is free.
 */
export function prepareFtoTables(): void {
  phase1Tables();
  phase2Tables();
  phase3Table();
  phase2To3();
}
