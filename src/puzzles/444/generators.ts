import { moveAxis, moveLayerSet } from '../nxn/notation';
import { applyCentreCoordinate, centreTable, solvedCentreCoordinate } from './centres';
import { centrePreservingMoveIndices } from './orbits';
import { WING_COUNT_444 } from './pieces';
import { move444Tables, SOLVED_444_STATE } from './state';

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

/**
 * The **deep** library, built by construction rather than by search.
 *
 * The shallow search above cannot reach the sequences that actually pair wings:
 * they run eight to eleven moves, and a tree that deep cannot be walked.
 * Conjugation reaches them cheaply — `A X A'`, slice out, work with outer turns,
 * slice back, which is the shape of the pairing algorithms a human uses. Taking `A`
 * from the wide moves is what makes the conjugate split slot pairs, the thing the
 * shallow library could not do.
 *
 * ## The claim that looked structural and is not
 *
 * This construction was first justified like so: an outer turn permutes four
 * *identical* centres within a face, which is invisible, so `X` has no centre effect
 * and `A X A'` is centre-neutral by construction.
 *
 * **That is wrong, and it produced a library a quarter of which breaks the
 * centres.** The four centres of a face are only identical when the centres are
 * *solved*; after the setup `A` they are not, so an outer turn in the core moves
 * centres of differing colours and does change the arrangement. The error survived
 * a test that sampled the first 250 members, all of small support, where it happens
 * to come out right.
 *
 * So centre neutrality is **verified, not assumed**: every candidate is run through
 * the exact centre coordinate and kept only if it returns to where it started. The
 * check costs one table-free coordinate application per move, and it is the
 * difference between a library that works and one that quietly corrupts the
 * centres four generators into a pairing.
 */
export interface Conjugate444 extends Generator444 {
  readonly setup: readonly number[];
  readonly core: readonly number[];
}

function wingEffectOf(moves: readonly number[]): number[] {
  const tables = move444Tables();
  const destination = Array.from({ length: WING_COUNT_444 }, (_, slot) => slot);
  for (const move of moves) {
    for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
      destination[slot] = tables[move]!.wingDestination[destination[slot]!]!;
    }
  }
  return destination;
}

function inverseMoveIndex(move: number): number {
  const tables = move444Tables();
  const { face, depth, amount } = tables[move]!.move;
  const wanted = amount === 2 ? 2 : amount === 1 ? 3 : 1;
  const index = tables.findIndex(
    (candidate) =>
      candidate.move.face === face &&
      candidate.move.depth === depth &&
      candidate.move.amount === wanted,
  );
  if (index < 0) throw new Error('444-generators: a move without an inverse');
  return index;
}

/** Whether a wing map keeps every slot pair intact. */
export function preservesSlotPairsMap(destination: readonly number[]): boolean {
  for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
    const sibling = slot % 2 === 0 ? slot + 1 : slot - 1;
    if (Math.floor(destination[slot]! / 2) !== Math.floor(destination[sibling]! / 2)) {
      return false;
    }
  }
  return true;
}


/**
 * Whether a sequence returns the **solved** centre arrangement to itself.
 *
 * Checked on the centre **colours**, not on the centre coordinate. The coordinate
 * of `centres.ts` can only represent arrangements in which every centre is still on
 * its own axis pair, so asking it about a sequence containing a quarter wide turn —
 * `Rw`, `Uw'` — is meaningless: such a turn carries U centres into F, off their
 * pair, and the coordinate has nowhere to put them.
 *
 * Rejecting those sequences, which is what an earlier version of this function did,
 * threw away every gadget with a quarter wide setup: the entire family the human
 * pairing algorithms live in, `Uw' (R U R' F R' F') Uw` and its relatives. What was
 * left could only set up with a 180° wide turn, and pairing stalled on the last two
 * edges for want of exactly the sequences that had been discarded.
 *
 * Colours are the right level anyway. Two centres of the same colour are
 * interchangeable — that is the whole reason a 4x4x4 has fewer states than its
 * piece count suggests — so what has to come back is the *arrangement of colours*,
 * and nothing finer.
 */
export function isCentreNeutral(moves: readonly number[]): boolean {
  const tables = move444Tables();
  const solved = SOLVED_444_STATE.centreColour;
  let colours = solved;
  for (const move of moves) {
    const { centreDestination } = tables[move]!;
    const next = new Array<number>(colours.length);
    for (let slot = 0; slot < colours.length; slot += 1) {
      next[centreDestination[slot]!] = colours[slot]!;
    }
    colours = next;
  }
  for (let slot = 0; slot < colours.length; slot += 1) {
    if (colours[slot] !== solved[slot]) return false;
  }
  return true;
}

let conjugates: readonly Conjugate444[] | undefined;

/**
 * Conjugates `A X A'` with `A` a single wide move and `X` an outer-turn sequence
 * of at most `coreDepth` moves — every one centre-neutral by construction, and
 * kept only if it **splits a slot pair**, since that is what pairing needs.
 *
 * Deduplicated by wing effect, shortest and smallest-support first.
 */
export function conjugateLibrary(coreDepth = 4): readonly Conjugate444[] {
  if (conjugates) return conjugates;

  const tables = move444Tables();
  const wide = tables
    .map((table, index) => ({ table, index }))
    .filter(({ table }) => table.move.depth === 2)
    .map(({ index }) => index);
  const outer = tables
    .map((table, index) => ({ table, index }))
    .filter(({ table }) => table.move.depth === 1)
    .map(({ index }) => index);

  const byEffect = new Map<string, Conjugate444>();
  const core: number[] = [];

  const walkCore = (setup: number, setupInverse: number, previous: number): void => {
    if (core.length > 0) {
      const moves = [setup, ...core, setupInverse];
      const destination = wingEffectOf(moves);
      if (!preservesSlotPairsMap(destination) && isCentreNeutral(moves)) {
        let support = 0;
        for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
          if (destination[slot] !== slot) support += 1;
        }
        const key = destination.join(',');
        const existing = byEffect.get(key);
        if (!existing || existing.moves.length > moves.length) {
          byEffect.set(key, {
            moves,
            setup: [setup],
            core: [...core],
            wingDestination: destination,
            support,
          });
        }
      }
    }
    if (core.length >= coreDepth) return;
    for (const move of outer) {
      if (previous >= 0 && tables[move]!.move.face === tables[previous]!.move.face) continue;
      core.push(move);
      walkCore(setup, setupInverse, move);
      core.pop();
    }
  };

  for (const setup of wide) {
    walkCore(setup, inverseMoveIndex(setup), -1);
  }

  conjugates = [...byEffect.values()].sort(
    (a, b) => a.support - b.support || a.moves.length - b.moves.length,
  );
  return conjugates;
}

let extended: readonly Conjugate444[] | undefined;

/**
 * The library plus the **support-4 gadgets**, which is what pairing actually needs.
 *
 * Greedy pairing over `conjugateLibrary` alone stalls at ten of twelve edges, every
 * time, and the reason is exact rather than statistical. In the last-two-edges shape
 * each bad edge holds one wing of the other, so the fix is a single transposition —
 * an **odd** permutation, and every generator here is even (checkpoint G, step 1).
 * The even way to do it is a transposition of the two bad wings *together with* a
 * transposition of the two wings inside some already-paired edge, which leaves that
 * edge paired: cycle type `2+2`, support 4.
 *
 * No member of the library has support 4 — the smallest is `3+3` — but products of
 * two members do, which is why the stall is a gap in the *move set* rather than in
 * the group. So they are computed once, deduplicated by wing effect, and handed to
 * the pairing loop as ordinary generators. Their words are the two concatenated, so
 * they cost about twice as much as an ordinary generator and are used at most once
 * per solve.
 *
 * This is why the depth-2 lookahead was the wrong shape for the problem: a `3+3`
 * generator can unpair as many as six edges, so the intermediate position on the way
 * to a support-4 gadget can be far *worse* than the stall it is escaping, and any
 * lookahead that prunes on "no worse than" cannot see it.
 */
export function extendedLibrary(): readonly Conjugate444[] {
  if (extended) return extended;

  const library = conjugateLibrary(4);
  const small = library.filter((generator) => generator.support === 6);
  const byEffect = new Map<string, Conjugate444>();

  for (const first of small) {
    for (const second of library) {
      const destination = new Array<number>(WING_COUNT_444);
      let support = 0;
      for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
        const landed = second.wingDestination[first.wingDestination[slot]!]!;
        destination[slot] = landed;
        if (landed !== slot) support += 1;
      }
      if (support === 0 || support > 4) continue;
      const key = destination.join(',');
      const moves = [...first.moves, ...second.moves];
      const existing = byEffect.get(key);
      if (existing && existing.moves.length <= moves.length) continue;
      byEffect.set(key, {
        moves,
        setup: first.setup,
        core: first.core,
        wingDestination: destination,
        support,
      });
    }
  }

  extended = [...library, ...byEffect.values()].sort(
    (a, b) => a.support - b.support || a.moves.length - b.moves.length,
  );
  return extended;
}
