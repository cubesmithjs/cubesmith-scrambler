import type { Face } from '../../notation/move';
import { buildFacelets, deriveFaceletPermutation, type Facelet } from './geometry';
import { allMovesForSize, moveLayerSet, type WideMove } from './notation';
import { orientationMoves } from './orientation';

/**
 * An NxNxN cube as facelet slots: `occupant[i]` is which facelet *started* at
 * slot `i` and is sitting there now.
 *
 * Two notions of solved matter and they are not the same. `isSolvedNxN` is the
 * real one — every slot wearing its own face's color — because same-face
 * facelets are physically interchangeable. `isIdentityNxN` is the stricter
 * one, every facelet back in its original slot; it's what a
 * scramble-then-invert round trip must satisfy, and it would miss nothing that
 * the colour check catches.
 */
export interface CubeNxNState {
  readonly size: number;
  readonly occupant: readonly number[];
}

interface SizeModel {
  readonly facelets: readonly Facelet[];
  readonly permutations: ReadonlyMap<string, readonly number[]>;
  readonly moves: readonly WideMove[];
}

const models = new Map<number, SizeModel>();

/**
 * The facelets and move permutations for a cube size, built once. Derived
 * lazily and cached because 7x7x7 has 294 facelets and 54 moves, and nothing
 * should pay for a size it doesn't use.
 */
export function modelForSize(size: number): SizeModel {
  let model = models.get(size);
  if (model) return model;

  const facelets = buildFacelets(size);
  const moves = allMovesForSize(size);
  const permutations = new Map<string, readonly number[]>();
  // The scramble move set, plus the deeper blocks `orientation.ts` needs to
  // reorient the puzzle for the blindfolded events. Those are outside the
  // depth cap on purpose: past halfway a block turn is redundant *as a state
  // transformation up to orientation*, which is precisely why it's the tool
  // for changing orientation.
  for (const move of [...moves, ...orientationMoves(size)]) {
    const key = moveKey(move);
    if (permutations.has(key)) continue;
    permutations.set(key, deriveFaceletPermutation(facelets, move, size));
  }
  model = { facelets, permutations, moves };
  models.set(size, model);
  return model;
}

function moveKey(move: WideMove): string {
  return `${moveLayerSet(move)}.${move.amount}`;
}

export function solvedCubeNxN(size: number): CubeNxNState {
  const { facelets } = modelForSize(size);
  return { size, occupant: facelets.map((_, i) => i) };
}

export function applyWideMove(state: CubeNxNState, move: WideMove): CubeNxNState {
  const { permutations } = modelForSize(state.size);
  const destination = permutations.get(moveKey(move));
  if (!destination) {
    throw new Error(
      `nxn-state: ${moveLayerSet(move)} is not a legal move on a ${state.size}x${state.size}x${state.size}`,
    );
  }
  const occupant = new Array<number>(state.occupant.length);
  for (let i = 0; i < destination.length; i += 1) {
    occupant[destination[i]!] = state.occupant[i]!;
  }
  return { size: state.size, occupant };
}

export function applyWideMoves(
  state: CubeNxNState,
  moves: readonly WideMove[],
): CubeNxNState {
  return moves.reduce(applyWideMove, state);
}

/** The face color a facelet wears — the face it started on. */
export function faceletFace(size: number, faceletId: number): Face {
  const { facelets } = modelForSize(size);
  const facelet = facelets[faceletId];
  if (!facelet) throw new Error(`nxn-state: no facelet ${faceletId} on size ${size}`);
  return facelet.face;
}

/** Solved in the sense that matters: every slot shows its own face's color. */
export function isSolvedNxN(state: CubeNxNState): boolean {
  const { facelets } = modelForSize(state.size);
  for (let slot = 0; slot < state.occupant.length; slot += 1) {
    if (facelets[slot]!.face !== facelets[state.occupant[slot]!]!.face) return false;
  }
  return true;
}

/**
 * Solved in the sense a **competitor** means it: every face shows one colour,
 * whichever colour that is.
 *
 * `isSolvedNxN` is a different and deliberately stricter question — it asks
 * whether every slot shows *its own* face's colour, which a solved cube that has
 * merely been rotated fails. Both predicates are wanted, and confusing them is a
 * real hazard: the blindfolded events append a wide move precisely in order to
 * rotate the puzzle, so anything asking "is this scramble too close to solved"
 * has to ask this question rather than that one.
 */
export function isUniformlyColouredNxN(state: CubeNxNState): boolean {
  const { facelets } = modelForSize(state.size);
  const faceColour = new Map<Face, Face>();
  for (let slot = 0; slot < state.occupant.length; slot += 1) {
    const slotFace = facelets[slot]!.face;
    const showing = facelets[state.occupant[slot]!]!.face;
    const already = faceColour.get(slotFace);
    if (already === undefined) faceColour.set(slotFace, showing);
    else if (already !== showing) return false;
  }
  return true;
}

/** Every facelet back in its own slot — the round-trip check. */
export function isIdentityNxN(state: CubeNxNState): boolean {
  return state.occupant.every((v, i) => v === i);
}

export function cubeNxNStatesEqual(a: CubeNxNState, b: CubeNxNState): boolean {
  return a.size === b.size && a.occupant.every((v, i) => v === b.occupant[i]);
}

/** How many facelets are showing the wrong face's color — a coarse "how scrambled" measure. */
export function misplacedFaceletCount(state: CubeNxNState): number {
  const { facelets } = modelForSize(state.size);
  let count = 0;
  for (let slot = 0; slot < state.occupant.length; slot += 1) {
    if (facelets[slot]!.face !== facelets[state.occupant[slot]!]!.face) count += 1;
  }
  return count;
}

export function faceletCount(size: number): number {
  return 6 * size * size;
}
