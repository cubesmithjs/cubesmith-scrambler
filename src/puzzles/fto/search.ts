import {
  ALL_MOVES_FTO,
  centreColoursValue,
  cornerPieceValue,
  cornersValue,
  edgePiecesValue,
  edgesValue,
  faceOfMove,
  mayFollow,
  OPPOSITE_FACE,
} from './coordinates';
import { BLOCK_CORNER_INDEX } from './geometry';
import type { FtoMove } from './notation';
import {
  BLOCK,
  IDENTITY_COLOURS,
  PHASE1_MOVES,
  PHASE2_MOVES,
  PHASE2_TARGETS,
  PHASE3_MOVES,
  phase1Projections,
  phase1Tables,
  phase2Projections,
  phase2Tables,
  phase2To3,
  phase3Projections,
  phase3Table,
  RECOLOUR_A1,
  RECOLOUR_B1,
} from './phases';
import { applyFtoMove, type FtoState } from './state';
import { conjugateFtoState, FTO_SYMMETRIES, moveFromFrame, type Symmetry } from './symmetry';
import { mod3At, UNVISITED_MOD3 } from './tables';

/**
 * The FTO solver: three phases (see `phases.ts`), then move cancellation.
 *
 * Phases 1 and 2 are IDA* over the maximum of their tables — each an exact
 * distance over a projection, so the maximum is admissible and each phase's
 * solution is the shortest *for that phase*. Phase 3's table is exact over the
 * whole of `⟨U, L⟩`, so it is a descent, not a search: from any state, a
 * neighbour one step closer always exists.
 *
 * The whole is not optimal and does not try to be. A random-state scramble needs
 * a uniformly random *state*, which `random-state.ts` supplies before this runs;
 * the solution's only job is to reach it, at a length a scramble sheet can carry.
 *
 * `moveOrder` permutes the order moves are tried in at every node, for the reason
 * `puzzles/skewb/search.ts` gives: a fixed order biases which of several
 * equal-length solutions is found, and therefore how the scramble ends.
 *
 * ## Where the length comes from, and how it is shortened
 *
 * Two levers, both measured (`fto-design.md` §5):
 *
 * - **Frames.** The state is re-expressed under several of the octahedron's 48
 *   symmetries (`symmetry.ts`) and solved in each. Every frame is a different
 *   problem — a different block corner, different faces playing `U` and `L` — and
 *   the shortest wins. This is the freedom xyzzy's solver gets from wide turns.
 * - **Phase 2 is scored with phase 3.** A phase-2 endpoint's phase-3 coordinate is
 *   four array reads (`phase2To3`), so phase 2 is a branch-and-bound over *every*
 *   path up to its optimum plus a slack, keeping the endpoint with the shortest
 *   phase 2 + phase 3 — not the first one, and not a handful.
 */

/**
 * How hard the solver looks for a short whole. Every candidate is scored by its
 * exact total, so these trade time for length and nothing else; see
 * `fto-design.md` §5 for the measurements behind them.
 */
export const SEARCH = {
  /** How many of `FTO_SYMMETRIES` to solve in, from the front of the list. */
  frames: 24,
  phase1Limit: 1,
  phase1Slack: 0,
  phase2Slack: 0,
};

export interface FtoSolveOptions {
  /** A permutation of `0..15`, the order moves are tried in. Defaults to `0..15`. */
  readonly moveOrder?: readonly number[];
}

const IDENTITY_ORDER: readonly number[] = ALL_MOVES_FTO.map((_, i) => i);

/** Moves of a phase, in the caller's preferred order: `moves` filtered by `order`. */
function orderedLocal(phaseMoves: readonly number[], order: readonly number[]): number[] {
  const local: number[] = [];
  for (const move of order) {
    const k = phaseMoves.indexOf(move);
    if (k >= 0) local.push(k);
  }
  return local;
}

/**
 * Up to `limit` phase-1 solutions, shortest first, taking every length from the
 * optimum to `slack` moves beyond it. A longer block can buy a much shorter
 * phase 2, so the caller scores them whole rather than keeping the first.
 */
function phase1Candidates(
  state: FtoState,
  order: readonly number[],
  limit: number,
  slack: number,
): number[][] {
  const p = phase1Projections();
  const t = phase1Tables();
  const sizeCorner = p.corner.size;
  const te = p.edges.transition;
  const tc = p.corner.transition;
  const ta = p.centreA.transition;
  const tb = p.centreB.transition;
  const [se, sc, sa, sb] = [p.edges.size, p.corner.size, p.centreA.size, p.centreB.size];
  const local = orderedLocal(PHASE1_MOVES, order);

  const start = [
    p.edges.indexOf(edgePiecesValue(state, BLOCK.edges)),
    p.corner.indexOf(cornerPieceValue(state, BLOCK_CORNER_INDEX)),
    p.centreA.indexOf(centreColoursValue(state.centreA, RECOLOUR_A1)),
    p.centreB.indexOf(centreColoursValue(state.centreB, RECOLOUR_B1)),
  ] as const;
  if (start.some((i) => i < 0)) throw new Error('fto-search: state is not a real FTO position');

  const h = (e: number, c: number, a: number, b: number): number =>
    Math.max(
      t.edges[e * sizeCorner + c]!,
      t.centreA[a * sizeCorner + c]!,
      t.centreB[b * sizeCorner + c]!,
    );

  const found: number[][] = [];
  const path: number[] = [];
  // Collects only solutions of exactly `bound` moves, so each length's pass
  // finds new ones rather than re-finding the shorter ones it passes through.
  const dfs = (e: number, c: number, a: number, b: number, g: number, bound: number): void => {
    const dist = h(e, c, a, b);
    if (dist === 0) {
      if (g === bound) found.push([...path]);
      return;
    }
    if (g + dist > bound) return;
    const last = path.length > 0 ? path[path.length - 1]! : -1;
    for (const k of local) {
      if (found.length >= limit) return;
      const move = PHASE1_MOVES[k]!;
      if (!mayFollow(last, move)) continue;
      path.push(move);
      dfs(te[k * se + e]!, tc[k * sc + c]!, ta[k * sa + a]!, tb[k * sb + b]!, g + 1, bound);
      path.pop();
    }
  };

  let optimum = -1;
  for (let bound = h(...start); found.length < limit; bound += 1) {
    if (optimum >= 0 && bound > optimum + slack) break;
    dfs(...start, 0, bound);
    if (optimum < 0 && found.length > 0) optimum = bound;
  }
  return found;
}

/**
 * The best phase 2 from a state whose block is solved: over **every** phase-2
 * path from the optimum to `slack` moves beyond it, the endpoint whose phase 2 +
 * phase 3 is shortest. Phase 3's exact length is read at each endpoint through
 * `phase2To3` and a descent, so no state is rebuilt to score one.
 *
 * `budget` is a branch-and-bound cutoff: only a total *below* it is wanted (the
 * caller's best so far, minus what phase 1 already spent), and a path that cannot
 * beat it — its length plus the phase-2 heuristic already reaches it — is dropped.
 * Returns `null` when nothing beats the budget.
 */
function bestPhase2(
  state: FtoState,
  order: readonly number[],
  slack: number,
  budget: number,
): { readonly moves: number[]; readonly total: number } | null {
  const p = phase2Projections();
  const t = phase2Tables();
  const toThree = phase2To3();
  const p3 = phase3Projections();
  const table3 = phase3Table();
  const sizeEdges = p.edges.size;
  const [se, sc, sa, sb, sx] = [p.edges.size, p.corners.size, p.centreA.size, p.centreB.size, p.allEdges.size];
  const te = p.edges.transition;
  const tc = p.corners.transition;
  const ta = p.centreA.transition;
  const tb = p.centreB.transition;
  const tx = p.allEdges.transition;
  const [sb3, se3, sc3] = [p3.centreB.size, p3.edges.size, p3.corners.size];
  const local = orderedLocal(PHASE2_MOVES, order);

  const start = [
    p.edges.indexOf(edgePiecesValue(state, PHASE2_TARGETS.edges)),
    p.corners.indexOf(cornersValue(state)),
    p.centreA.indexOf(centreColoursValue(state.centreA, IDENTITY_COLOURS)),
    p.centreB.indexOf(centreColoursValue(state.centreB, IDENTITY_COLOURS)),
    p.allEdges.indexOf(edgesValue(state)),
  ] as const;
  if (start.some((i) => i < 0)) throw new Error('fto-search: phase 2 began outside its group');

  const h = (e: number, c: number, a: number, b: number): number =>
    Math.max(
      t.centreA[a * sizeEdges + e]!,
      t.centreB[b * sizeEdges + e]!,
      t.corners[c * sizeEdges + e]!,
    );

  let best: { moves: number[]; total: number } | null = null;
  let cutoff = budget;
  let reached = false;
  const path: number[] = [];

  const dfs = (e: number, c: number, a: number, b: number, x: number, g: number, bound: number): void => {
    const dist = h(e, c, a, b);
    if (g + dist > bound || g + dist >= cutoff) return;
    if (dist === 0) {
      // A phase-2 endpoint: score it whole. It is also a node like any other — a
      // longer path through it can end somewhere phase 3 finishes faster.
      reached = true;
      const ia = toThree.centreA[a]!;
      const ib = toThree.centreB[b]!;
      const ix = toThree.edges[x]!;
      const ic = toThree.corners[c]!;
      if (ia >= 0 && ib >= 0 && ix >= 0 && ic >= 0) {
        const index = ((ia * sb3 + ib) * se3 + ix) * sc3 + ic;
        if (mod3At(table3, index) !== UNVISITED_MOD3) {
          const total = g + phase3Distance(index);
          if (total < cutoff) {
            best = { moves: [...path], total };
            cutoff = total;
          }
        }
      }
    }
    if (g === bound) return;
    const last = path.length > 0 ? path[path.length - 1]! : -1;
    for (const k of local) {
      const move = PHASE2_MOVES[k]!;
      if (!mayFollow(last, move)) continue;
      path.push(move);
      dfs(te[k * se + e]!, tc[k * sc + c]!, ta[k * sa + a]!, tb[k * sb + b]!, tx[k * sx + x]!, g + 1, bound);
      path.pop();
    }
  };

  // Grow the bound to phase 2's optimum, then `slack` beyond it. An endpoint is
  // "reached" even when the budget forbids keeping it; that still fixes the optimum.
  const first = h(start[0], start[1], start[2], start[3]);
  let optimum = -1;
  for (let bound = first; optimum < 0 || bound <= optimum + slack; bound += 1) {
    if (bound >= cutoff) break;
    dfs(...start, 0, bound);
    if (optimum < 0 && reached) optimum = bound;
  }
  return best;
}

/** The phase-3 table index of `state`, or `-1` if `⟨U, L⟩` cannot finish it. */
function phase3Index(state: FtoState): number {
  const p = phase3Projections();
  const a = p.centreA.indexOf(centreColoursValue(state.centreA, IDENTITY_COLOURS));
  const b = p.centreB.indexOf(centreColoursValue(state.centreB, IDENTITY_COLOURS));
  const e = p.edges.indexOf(edgesValue(state));
  const c = p.corners.indexOf(cornersValue(state));
  if (a < 0 || b < 0 || e < 0 || c < 0) return -1;
  const index = ((a * p.centreB.size + b) * p.edges.size + e) * p.corners.size + c;
  return mod3At(phase3Table(), index) === UNVISITED_MOD3 ? -1 : index;
}

/**
 * Phase 3 by descent: from the entry at `index`, step to a neighbour whose
 * residue is one less, until the goal (index 0) — which is optimal, because each
 * step is one closer. See `tables.ts` for why mod 3 is enough to tell which
 * neighbour that is.
 */
function descendPhase3(start: number, local: readonly number[]): number[] {
  const p = phase3Projections();
  const table = phase3Table();
  const [sa, sb, se, sc] = [p.centreA.size, p.centreB.size, p.edges.size, p.corners.size];

  let index = start;
  let c = index % sc;
  let rest = (index - c) / sc;
  let e = rest % se;
  rest = (rest - e) / se;
  let b = rest % sb;
  let a = (rest - b) / sb;

  const path: number[] = [];
  while (index !== 0) {
    const closer = (mod3At(table, index) + 2) % 3;
    const last = path.length > 0 ? path[path.length - 1]! : -1;
    let stepped = false;
    for (const k of local) {
      const move = PHASE3_MOVES[k]!;
      if (!mayFollow(last, move)) continue;
      const na = p.centreA.transition[k * sa + a]!;
      const nb = p.centreB.transition[k * sb + b]!;
      const ne = p.edges.transition[k * se + e]!;
      const nc = p.corners.transition[k * sc + c]!;
      const next = ((na * sb + nb) * se + ne) * sc + nc;
      if (mod3At(table, next) === closer) {
        [a, b, e, c, index] = [na, nb, ne, nc, next];
        path.push(move);
        stepped = true;
        break;
      }
    }
    if (!stepped) throw new Error('fto-search: the phase-3 table has a hole');
  }
  return path;
}

const PHASE3_LOCAL_DEFAULT: readonly number[] = PHASE3_MOVES.map((_, k) => k);

/** The exact phase-3 distance of a table entry — the length of its descent. */
function phase3Distance(index: number): number {
  return descendPhase3(index, PHASE3_LOCAL_DEFAULT).length;
}

function solvePhase3(state: FtoState, order: readonly number[]): number[] {
  const index = phase3Index(state);
  if (index < 0) throw new Error('fto-search: phase 3 began outside ⟨U, L⟩');
  return descendPhase3(index, orderedLocal(PHASE3_MOVES, order));
}

/**
 * Merges adjacent turns of one face — including across an opposite face, with
 * which a turn commutes — and drops any that cancel to nothing. The phases meet
 * at two seams, and the move a phase ends on is often a move the next begins with.
 */
export function cancelFtoMoves(moves: readonly number[]): number[] {
  const out: number[] = [];
  for (const move of moves) {
    const face = faceOfMove(move);
    let target = out.length - 1;
    if (target >= 0 && OPPOSITE_FACE[faceOfMove(out[target]!)] === face) target -= 1;
    if (target >= 0 && faceOfMove(out[target]!) === face) {
      const amount = ((out[target]! & 1) + 1 + (move & 1) + 1) % 3;
      if (amount === 0) out.splice(target, 1);
      else out[target] = face * 2 + amount - 1;
      continue;
    }
    out.push(move);
  }
  return out.length === moves.length ? out : cancelFtoMoves(out);
}

/**
 * The three phases' moves, as move indices **in the frame they were solved in**,
 * before cancellation across the joins. `frame` is the symmetry the state was
 * re-expressed under (`symmetry.ts`); the identity when no other frame won.
 */
export interface FtoPhaseSolution {
  readonly frame: Symmetry;
  readonly phase1: readonly number[];
  readonly phase2: readonly number[];
  readonly phase3: readonly number[];
}

function applyIndices(state: FtoState, moves: readonly number[]): FtoState {
  return moves.reduce((acc, m) => applyFtoMove(acc, ALL_MOVES_FTO[m]!), state);
}

/**
 * The solver's work phase by phase — what {@link solveFto} joins, maps back out of
 * its frame and cancels. Exposed for the tests that check each phase lands where
 * it claims, and for measuring where the moves go.
 */
export function solveFtoInPhases(
  state: FtoState,
  options: FtoSolveOptions = {},
): FtoPhaseSolution {
  const order = options.moveOrder ?? IDENTITY_ORDER;
  const frames = FTO_SYMMETRIES.slice(0, Math.max(1, SEARCH.frames));

  let best: { frame: Symmetry; framed: FtoState; phase1: number[]; phase2: number[]; total: number } | null =
    null;
  for (const frame of frames) {
    const framed = frame === FTO_SYMMETRIES[0] ? state : conjugateFtoState(state, frame);
    for (const phase1 of phase1Candidates(framed, order, SEARCH.phase1Limit, SEARCH.phase1Slack)) {
      const budget = best === null ? Number.POSITIVE_INFINITY : best.total - phase1.length;
      if (budget <= 0) continue;
      const phase2 = bestPhase2(applyIndices(framed, phase1), order, SEARCH.phase2Slack, budget);
      if (phase2 === null) continue;
      const total = phase1.length + phase2.total;
      if (best === null || total < best.total) best = { frame, framed, phase1, phase2: phase2.moves, total };
    }
  }
  if (best === null) throw new Error('fto-search: no frame produced a solution');

  const phase3 = solvePhase3(applyIndices(best.framed, [...best.phase1, ...best.phase2]), order);
  return { frame: best.frame, phase1: best.phase1, phase2: best.phase2, phase3 };
}

/** A move index in `frame`, as the move index it is in the original frame. */
export function moveIndexFromFrame(move: number, frame: Symmetry): number {
  const mapped = moveFromFrame(ALL_MOVES_FTO[move]!, frame);
  return (FTO_FACE_INDEX.get(mapped.face)! << 1) | (mapped.amount - 1);
}

const FTO_FACE_INDEX = new Map(ALL_MOVES_FTO.filter((_, i) => i % 2 === 0).map((m, f) => [m.face, f]));

/**
 * A solution for `state`: a sequence that takes it to solved as the eye sees it
 * (centres of one colour are interchangeable, so "solved" is about colours).
 */
export function solveFto(state: FtoState, options: FtoSolveOptions = {}): FtoMove[] {
  const { frame, phase1, phase2, phase3 } = solveFtoInPhases(state, options);
  const original = [...phase1, ...phase2, ...phase3].map((m) => moveIndexFromFrame(m, frame));
  return cancelFtoMoves(original).map((m) => ALL_MOVES_FTO[m]!);
}
