import { FACES } from '../../notation/move';
import { allMovesForSize, type WideMove } from '../nxn/notation';
import { deriveFaceletPermutation } from '../nxn/geometry';
import { solvedCubeNxN, type CubeNxNState } from '../nxn/state';
import {
  CENTRE_COUNT_444,
  CORNER_COUNT_444,
  FACELET_COUNT_444,
  pieces444,
  SIZE_444,
  WING_COUNT_444,
} from './pieces';

/**
 * The 4x4x4 as pieces, with move tables derived from the facelet model.
 *
 * ## Why a second model at all
 *
 * `puzzles/nxn/` already applies 4x4x4 moves correctly, and the 5x5x5, 6x6x6
 * and 7x7x7 scramblers are built on it. But a facelet array cannot be indexed
 * into a coordinate, and a random-state scrambler is nothing but coordinates.
 * So this module holds what a solver needs — a permutation and an orientation
 * per piece kind — while the facelet model stays as the **oracle** every table
 * here is checked against.
 *
 * Nothing is written by hand. Each of the 36 moves' effect on pieces is read
 * off the facelet permutation the geometry produces: follow a piece's facelets,
 * see which piece's slot they land in, and for corners, how far round they
 * turned. `state.test.ts` then checks the derived tables against the facelet
 * model directly, on every move and on long random sequences.
 *
 * ## The state
 *
 * - **corners** — a permutation of 8 and an orientation in `Z3` each.
 * - **wings** — a permutation of 24, and *no* orientation: a wing slot admits
 *   only one placement of a given wing, which is why a 4x4x4 has no edge flip.
 * - **centres** — a colour per slot, not a permutation. The four centres of a
 *   face are physically identical, and modelling them as distinguishable would
 *   count `4!^6 = 191,102,976` states that do not exist.
 */

export interface Cube444State {
  readonly cornerPermutation: readonly number[];
  readonly cornerOrientation: readonly number[];
  readonly wingPermutation: readonly number[];
  /** Face index (into `FACES`) of the colour showing at each centre slot. */
  readonly centreColour: readonly number[];
}

export const SOLVED_444_STATE: Cube444State = {
  cornerPermutation: Array.from({ length: CORNER_COUNT_444 }, (_, i) => i),
  cornerOrientation: new Array<number>(CORNER_COUNT_444).fill(0),
  wingPermutation: Array.from({ length: WING_COUNT_444 }, (_, i) => i),
  centreColour: Array.from({ length: CENTRE_COUNT_444 }, (_, i) => pieces444().centreFace[i]!),
};

export interface Move444Table {
  readonly move: WideMove;
  /** Where the piece in each slot goes. */
  readonly cornerDestination: readonly number[];
  /** How far round the corner turns on the way, in thirds. */
  readonly cornerTwist: readonly number[];
  readonly wingDestination: readonly number[];
  readonly centreDestination: readonly number[];
}

let tables: readonly Move444Table[] | undefined;

/** All 36 moves — six faces, depths 1 and 2, three amounts — with their piece tables. */
export function move444Tables(): readonly Move444Table[] {
  if (tables) return tables;

  const { facelets, cornerFacelets, wingFacelets, centreFacelets } = pieces444();
  const cornerSlotOfFacelet = new Map<number, { slot: number; index: number }>();
  cornerFacelets.forEach((ids, slot) => {
    ids.forEach((id, index) => cornerSlotOfFacelet.set(id, { slot, index }));
  });
  const wingSlotOfFacelet = new Map<number, number>();
  wingFacelets.forEach((ids, slot) => ids.forEach((id) => wingSlotOfFacelet.set(id, slot)));
  const centreSlotOfFacelet = new Map<number, number>();
  centreFacelets.forEach((id, slot) => centreSlotOfFacelet.set(id, slot));

  tables = allMovesForSize(SIZE_444).map((move) => {
    const destination = deriveFaceletPermutation(facelets, move, SIZE_444);

    const cornerDestination = new Array<number>(CORNER_COUNT_444).fill(-1);
    const cornerTwist = new Array<number>(CORNER_COUNT_444).fill(-1);
    for (let slot = 0; slot < CORNER_COUNT_444; slot += 1) {
      const landed = cornerSlotOfFacelet.get(destination[cornerFacelets[slot]![0]!]!)!;
      cornerDestination[slot] = landed.slot;
      cornerTwist[slot] = landed.index;
      // Every facelet of the corner must land on the same corner, rotated by the
      // same amount, or the piece has been torn apart rather than moved.
      for (let index = 0; index < 3; index += 1) {
        const other = cornerSlotOfFacelet.get(destination[cornerFacelets[slot]![index]!]!)!;
        if (other.slot !== landed.slot || other.index !== (index + landed.index) % 3) {
          throw new Error(`444-state: ${move.face} tore corner ${slot} apart`);
        }
      }
    }

    const wingDestination = new Array<number>(WING_COUNT_444).fill(-1);
    for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
      const ids = wingFacelets[slot]!;
      const landed = wingSlotOfFacelet.get(destination[ids[0]!]!)!;
      if (wingSlotOfFacelet.get(destination[ids[1]!]!) !== landed) {
        throw new Error(`444-state: ${move.face} tore wing ${slot} apart`);
      }
      wingDestination[slot] = landed;
    }

    const centreDestination = new Array<number>(CENTRE_COUNT_444).fill(-1);
    for (let slot = 0; slot < CENTRE_COUNT_444; slot += 1) {
      centreDestination[slot] = centreSlotOfFacelet.get(destination[centreFacelets[slot]!]!)!;
    }

    return { move, cornerDestination, cornerTwist, wingDestination, centreDestination };
  });

  return tables;
}

export function apply444Table(state: Cube444State, table: Move444Table): Cube444State {
  const cornerPermutation = new Array<number>(CORNER_COUNT_444);
  const cornerOrientation = new Array<number>(CORNER_COUNT_444);
  for (let slot = 0; slot < CORNER_COUNT_444; slot += 1) {
    const landing = table.cornerDestination[slot]!;
    cornerPermutation[landing] = state.cornerPermutation[slot]!;
    cornerOrientation[landing] = (state.cornerOrientation[slot]! + table.cornerTwist[slot]!) % 3;
  }

  const wingPermutation = new Array<number>(WING_COUNT_444);
  for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
    wingPermutation[table.wingDestination[slot]!] = state.wingPermutation[slot]!;
  }

  const centreColour = new Array<number>(CENTRE_COUNT_444);
  for (let slot = 0; slot < CENTRE_COUNT_444; slot += 1) {
    centreColour[table.centreDestination[slot]!] = state.centreColour[slot]!;
  }

  return { cornerPermutation, cornerOrientation, wingPermutation, centreColour };
}

export function apply444Moves(
  state: Cube444State,
  moveIndices: readonly number[],
): Cube444State {
  const all = move444Tables();
  return moveIndices.reduce((current, index) => apply444Table(current, all[index]!), state);
}

export function is444Solved(state: Cube444State): boolean {
  return cube444StatesEqual(state, SOLVED_444_STATE);
}

export function cube444StatesEqual(a: Cube444State, b: Cube444State): boolean {
  return (
    a.cornerPermutation.every((v, i) => v === b.cornerPermutation[i]) &&
    a.cornerOrientation.every((v, i) => v === b.cornerOrientation[i]) &&
    a.wingPermutation.every((v, i) => v === b.wingPermutation[i]) &&
    a.centreColour.every((v, i) => v === b.centreColour[i])
  );
}

/**
 * The bridge to the oracle: **the colour showing at every facelet slot**.
 *
 * Not "which facelet sits where" — that was the first attempt and it cannot
 * work. Four centres of a face are physically identical, so the piece state
 * records a colour per centre slot and no identity; asking it to name a facelet
 * would mean inventing one, and the solved state came back as a non-permutation
 * for exactly that reason.
 *
 * Colours are the right notion anyway. They are what a competitor sees, what
 * "solved" means, and what makes two states equal — which is precisely why
 * identical centres should be indistinguishable in it.
 *
 * A corner piece's own facelets are listed in the same consistently-rotating
 * order as its home slot's, so an orientation of `o` means the piece's facelet
 * `k` shows at the slot's facelet `(k + o) mod 3`. Wings have no orientation, so
 * their two facelets follow the slot's order directly.
 */
export function faceletColoursOf444(state: Cube444State): number[] {
  const { cornerFacelets, wingFacelets, centreFacelets, facelets } = pieces444();
  const colours = new Array<number>(FACELET_COUNT_444).fill(-1);
  const colourOf = (id: number): number => FACES.indexOf(facelets[id]!.face);

  for (let slot = 0; slot < CORNER_COUNT_444; slot += 1) {
    const piece = state.cornerPermutation[slot]!;
    const twist = state.cornerOrientation[slot]!;
    for (let index = 0; index < 3; index += 1) {
      colours[cornerFacelets[slot]![(index + twist) % 3]!] = colourOf(
        cornerFacelets[piece]![index]!,
      );
    }
  }

  for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
    const piece = state.wingPermutation[slot]!;
    for (let index = 0; index < 2; index += 1) {
      colours[wingFacelets[slot]![index]!] = colourOf(wingFacelets[piece]![index]!);
    }
  }

  for (let slot = 0; slot < CENTRE_COUNT_444; slot += 1) {
    colours[centreFacelets[slot]!] = state.centreColour[slot]!;
  }

  return colours;
}

/** The same reading, taken from the facelet oracle. */
export function faceletColoursOfNxN(state: CubeNxNState): number[] {
  const { facelets } = pieces444();
  return state.occupant.map((sticker) => FACES.indexOf(facelets[sticker]!.face));
}

/** Reads a piece state back out of a facelet state produced by the oracle. */
export function from444Facelets(facelets: CubeNxNState): Cube444State {
  const { cornerFacelets, wingFacelets, centreFacelets, facelets: model } = pieces444();

  const cornerHome = new Map<number, { slot: number; index: number }>();
  cornerFacelets.forEach((ids, slot) =>
    ids.forEach((id, index) => cornerHome.set(id, { slot, index })),
  );
  const wingHome = new Map<number, number>();
  wingFacelets.forEach((ids, slot) => ids.forEach((id) => wingHome.set(id, slot)));

  const cornerPermutation = new Array<number>(CORNER_COUNT_444).fill(-1);
  const cornerOrientation = new Array<number>(CORNER_COUNT_444).fill(-1);
  for (let slot = 0; slot < CORNER_COUNT_444; slot += 1) {
    const showing = facelets.occupant[cornerFacelets[slot]![0]!]!;
    const home = cornerHome.get(showing)!;
    cornerPermutation[slot] = home.slot;
    cornerOrientation[slot] = (3 - home.index) % 3;
  }

  const wingPermutation = new Array<number>(WING_COUNT_444).fill(-1);
  for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
    wingPermutation[slot] = wingHome.get(facelets.occupant[wingFacelets[slot]![0]!]!)!;
  }

  const centreColour = new Array<number>(CENTRE_COUNT_444).fill(-1);
  for (let slot = 0; slot < CENTRE_COUNT_444; slot += 1) {
    centreColour[slot] = FACES.indexOf(model[facelets.occupant[centreFacelets[slot]!]!]!.face);
  }

  return { cornerPermutation, cornerOrientation, wingPermutation, centreColour };
}

export function solved444Facelets(): CubeNxNState {
  return solvedCubeNxN(SIZE_444);
}
