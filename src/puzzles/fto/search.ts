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
  phase3Projections,
  phase3Table,
  RECOLOUR_A1,
  RECOLOUR_B1,
} from './phases';
import { applyFtoMove, type FtoState } from './state';
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
 */

/**
 * How hard the solver looks for a short whole. Every candidate is scored by its
 * exact total — phase 3 is a table lookup — so these trade time for length and
 * nothing else; see `fto-design.md` §7 for the measurements behind them.
 */
export const SEARCH = {
  phase1Limit: 4,
  phase1Slack: 0,
  phase2Limit: 16,
  phase2Slack: 1,
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
 * The best phase 2 from a state whose block is solved: among up to `limit`
 * solutions from the optimum to `slack` moves beyond it, the one whose phase 3
 * — read exactly off the phase-3 table — makes the shortest whole. Arriving in
 * `⟨U, L⟩` at all is the one condition the phase-2 tables cannot see, so it is
 * checked on arrival rather than assumed.
 */
function bestPhase2(
  state: FtoState,
  order: readonly number[],
  limit: number,
  slack: number,
): { readonly moves: number[]; readonly total: number } {
  const p = phase2Projections();
  const t = phase2Tables();
  const sizeEdges = p.edges.size;
  const [se, sc, sa, sb] = [p.edges.size, p.corners.size, p.centreA.size, p.centreB.size];
  const te = p.edges.transition;
  const tc = p.corners.transition;
  const ta = p.centreA.transition;
  const tb = p.centreB.transition;
  const local = orderedLocal(PHASE2_MOVES, order);

  const start = [
    p.edges.indexOf(edgePiecesValue(state, PHASE2_TARGETS.edges)),
    p.corners.indexOf(cornersValue(state)),
    p.centreA.indexOf(centreColoursValue(state.centreA, IDENTITY_COLOURS)),
    p.centreB.indexOf(centreColoursValue(state.centreB, IDENTITY_COLOURS)),
  ] as const;
  if (start.some((i) => i < 0)) throw new Error('fto-search: phase 2 began outside its group');

  const h = (e: number, c: number, a: number, b: number): number =>
    Math.max(
      t.centreA[a * sizeEdges + e]!,
      t.centreB[b * sizeEdges + e]!,
      t.corners[c * sizeEdges + e]!,
    );

  let best: { moves: number[]; total: number } | null = null;
  let count = 0;
  const path: number[] = [];

  const consider = (): void => {
    let s = state;
    for (const move of path) s = applyFtoMove(s, ALL_MOVES_FTO[move]!);
    const index = phase3Index(s);
    if (index < 0) return;
    count += 1;
    const total = path.length + phase3Distance(index);
    if (best === null || total < best.total) best = { moves: [...path], total };
  };

  const dfs = (e: number, c: number, a: number, b: number, g: number, bound: number): void => {
    const dist = h(e, c, a, b);
    if (dist === 0) {
      if (g === bound) consider();
      return;
    }
    if (g + dist > bound) return;
    const last = path.length > 0 ? path[path.length - 1]! : -1;
    for (const k of local) {
      if (count >= limit) return;
      const move = PHASE2_MOVES[k]!;
      if (!mayFollow(last, move)) continue;
      path.push(move);
      dfs(te[k * se + e]!, tc[k * sc + c]!, ta[k * sa + a]!, tb[k * sb + b]!, g + 1, bound);
      path.pop();
    }
  };

  let optimum = -1;
  for (let bound = h(...start); count < limit; bound += 1) {
    if (optimum >= 0 && bound > optimum + slack) break;
    dfs(...start, 0, bound);
    if (optimum < 0 && count > 0) optimum = bound;
  }
  if (best === null) throw new Error('fto-search: phase 2 found nothing');
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

/** The three phases' moves, as move indices, before cancellation across the joins. */
export interface FtoPhaseSolution {
  readonly phase1: readonly number[];
  readonly phase2: readonly number[];
  readonly phase3: readonly number[];
}

function applyIndices(state: FtoState, moves: readonly number[]): FtoState {
  return moves.reduce((acc, m) => applyFtoMove(acc, ALL_MOVES_FTO[m]!), state);
}

/**
 * The solver's work phase by phase — what {@link solveFto} joins and cancels.
 * Exposed for the tests that check each phase lands where it claims, and for
 * measuring where the moves go.
 */
export function solveFtoInPhases(
  state: FtoState,
  options: FtoSolveOptions = {},
): FtoPhaseSolution {
  const order = options.moveOrder ?? IDENTITY_ORDER;

  let best: { phase1: number[]; phase2: number[]; total: number } | null = null;
  for (const phase1 of phase1Candidates(state, order, SEARCH.phase1Limit, SEARCH.phase1Slack)) {
    const phase2 = bestPhase2(applyIndices(state, phase1), order, SEARCH.phase2Limit, SEARCH.phase2Slack);
    const total = phase1.length + phase2.total;
    if (best === null || total < best.total) best = { phase1, phase2: phase2.moves, total };
  }
  if (best === null) throw new Error('fto-search: phase 1 found nothing');

  const phase3 = solvePhase3(applyIndices(state, [...best.phase1, ...best.phase2]), order);
  return { phase1: best.phase1, phase2: best.phase2, phase3 };
}

/**
 * A solution for `state`: a sequence that takes it to solved as the eye sees it
 * (centres of one colour are interchangeable, so "solved" is about colours).
 */
export function solveFto(state: FtoState, options: FtoSolveOptions = {}): FtoMove[] {
  const { phase1, phase2, phase3 } = solveFtoInPhases(state, options);
  return cancelFtoMoves([...phase1, ...phase2, ...phase3]).map((m) => ALL_MOVES_FTO[m]!);
}
