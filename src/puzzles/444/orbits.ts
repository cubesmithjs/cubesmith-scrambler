import { CENTRE_COUNT_444, pieces444, WING_COUNT_444 } from './pieces';
import { AXIS_PAIRS } from './phase1';
import { move444Tables, type Cube444State } from './state';

/**
 * Which pieces can reach which slots, under which move sets — computed, because
 * `docs/444-design.md` §9 listed it as an open question and the expected answer
 * turned out to be wrong.
 *
 * ## The finding: the wings are one orbit, always
 *
 * The design sketched a phase whose job was to put every wing into "its own
 * orbit", on the understanding that the 24 wings split into two orbits of twelve
 * once inner-slice quarter turns are withdrawn. **They do not.** Measured on this
 * model, the wings are a single orbit of 24 under every move set tried:
 *
 * | move set | wing orbits |
 * |---|---|
 * | all 36 | one of 24 |
 * | outer turns only (18) | one of 24 |
 * | outer turns + wide half turns (24) | one of 24 |
 *
 * The intuition that misled: `U2` sends the wing nearer F on the UR edge to the
 * wing nearer B on UL, so even the outer turns alone mix what looks like two
 * handednesses. A 4x4x4 wing is unflippable *in place*, which is a different
 * statement from being confined to half the slots.
 *
 * So there is no orbit invariant to establish, and the planned phase does not
 * exist. That **simplifies** the chain — from four phases to three — while
 * leaving the expensive one where it was:
 *
 * 1. centres onto their axis pairs, all 36 moves (`phase1.ts`)
 * 2. centres solved and wings paired, within the 24 moves that keep phase 1's
 *    invariant — the reduction to a 3x3x3
 * 3. the 3x3x3 itself, outer turns only, with parity
 *
 * What *is* preserved, and is what phase 3 relies on, is **pairing**: both wings
 * of an edge lie in the same two layers, so an outer turn moves them together.
 * That is asserted in `orbits.test.ts` rather than assumed.
 */

/** The 24 moves that keep every centre on its own axis pair. */
export function centrePreservingMoveIndices(): readonly number[] {
  return move444Tables()
    .map((table, index) => ({ table, index }))
    .filter(({ table }) => table.move.depth === 1 || table.move.amount === 2)
    .map(({ index }) => index);
}

/** The 18 outer turns — the move set a reduced cube is finished with. */
export function outerMoveIndices(): readonly number[] {
  return move444Tables()
    .map((table, index) => ({ table, index }))
    .filter(({ table }) => table.move.depth === 1)
    .map(({ index }) => index);
}

/** Orbit sizes of the wing slots under a move set, by walking them. */
export function wingOrbitSizes(moveIndices: readonly number[]): number[] {
  const tables = move444Tables();
  const of = new Array<number>(WING_COUNT_444).fill(-1);
  const sizes: number[] = [];

  for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
    if (of[slot]! >= 0) continue;
    const id = sizes.length;
    of[slot] = id;
    let size = 0;
    const queue = [slot];
    for (let head = 0; head < queue.length; head += 1) {
      size += 1;
      for (const move of moveIndices) {
        const landed = tables[move]!.wingDestination[queue[head]!]!;
        if (of[landed]! >= 0) continue;
        of[landed] = id;
        queue.push(landed);
      }
    }
    sizes.push(size);
  }

  return sizes;
}

/** Which 3x3x3 edge a wing slot belongs to — the two wings of edge `e` are `2e` and `2e+1`. */
export function edgeOfWingSlot(slot: number): number {
  return Math.floor(slot / 2);
}

/**
 * Whether every 3x3x3 edge slot holds the two wings of one edge — "reduced", the
 * condition that lets the last phase treat the puzzle as a 3x3x3.
 */
export function areWingsPaired(state: Cube444State): boolean {
  for (let edge = 0; edge < WING_COUNT_444 / 2; edge += 1) {
    const first = state.wingPermutation[2 * edge]!;
    const second = state.wingPermutation[2 * edge + 1]!;
    if (edgeOfWingSlot(first) !== edgeOfWingSlot(second)) return false;
  }
  return true;
}

/** Phase 1's invariant, over pieces: every centre on one of its own axis's two faces. */
export function centresOnOwnAxisPair(state: Cube444State): boolean {
  const { centreFace } = pieces444();
  const pairOf = (face: number): number => AXIS_PAIRS.findIndex((pair) => pair.includes(face));
  for (let slot = 0; slot < CENTRE_COUNT_444; slot += 1) {
    if (pairOf(state.centreColour[slot]!) !== pairOf(centreFace[slot]!)) return false;
  }
  return true;
}

/** Every centre showing its own face's colour. */
export function areCentresSolved(state: Cube444State): boolean {
  const { centreFace } = pieces444();
  for (let slot = 0; slot < CENTRE_COUNT_444; slot += 1) {
    if (state.centreColour[slot] !== centreFace[slot]) return false;
  }
  return true;
}

/** Reduced: centres solved and wings paired, so only outer turns are needed. */
export function isReduced(state: Cube444State): boolean {
  return areCentresSolved(state) && areWingsPaired(state);
}

/**
 * Whether a move keeps the two wing slots of each 3x3x3 edge slot **together** —
 * mapping them into one edge slot rather than splitting them across two.
 *
 * This is the decisive question for the phase order, and it has a one-line
 * answer once asked the right way. A wing slot's sibling is the other slot of its
 * edge (`2e` and `2e+1`), and pairing is a statement about what sits in a slot
 * *pair*. So if a move sends every slot pair into some slot pair, it cannot
 * change whether a pair holds two halves of one edge: the contents travel
 * together.
 *
 * Measured: **the 18 outer turns all preserve slot pairs; all 18 wide turns split
 * them**, quarter and half alike (`orbits.test.ts`).
 *
 * The consequence decides the architecture. Pairing is *invariant* under outer
 * turns, so the outer turns cannot pair anything — the reduction has to be done
 * with wide turns available. Wide **quarter** turns would undo phase 1, so what
 * remains is the 24-move set, and within it a wide half turn breaks solved
 * centres as readily as it breaks pairing. Neither goal can therefore be
 * established and then held while the other is worked on:
 *
 * > **Centres-solved and wings-paired must be reached together, in one search
 * > over the 24-move set.**
 *
 * That rules out the cheaper two-step reduction and settles what the next
 * milestone builds.
 */
export function preservesSlotPairs(moveIndex: number): boolean {
  const { wingDestination } = move444Tables()[moveIndex]!;
  for (let slot = 0; slot < WING_COUNT_444; slot += 1) {
    const sibling = slot % 2 === 0 ? slot + 1 : slot - 1;
    if (edgeOfWingSlot(wingDestination[slot]!) !== edgeOfWingSlot(wingDestination[sibling]!)) {
      return false;
    }
  }
  return true;
}
