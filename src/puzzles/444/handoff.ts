import { allFaceMoves } from '../333/move-tables';
import { applyMoves as apply333, SOLVED_STATE as SOLVED_333, type CubeState } from '../333/state';
import { areCentresSolved, areWingsPaired } from './orbits';
import { CORNER_COUNT_444, WING_COUNT_444 } from './pieces';
import { apply444Moves, move444Tables, SOLVED_444_STATE, type Cube444State } from './state';

/**
 * The **hand-off**: a reduced 4x4x4 read as a 3x3x3, so the existing solver can
 * finish it.
 *
 * This is almost the identity map, and deliberately so. `pieces.ts` indexes 4x4x4
 * corners by `333/geometry.ts`'s own `CORNER_POSITIONS` and pairs wing `2e` with
 * `2e + 1` on `EDGE_POSITIONS[e]`, precisely so that this conversion would not have
 * to reconcile two independently-chosen conventions. What is left is the edge half:
 *
 * - the **piece** at 3x3x3 edge slot `e` is the edge that the wing at 4x4x4 slot
 *   `2e` belongs to — `floor(wing / 2)`;
 * - its **flip** is whether that wing is the first or second of its pair, corrected
 *   by a per-edge reference bit.
 *
 * ## The reference bits, and why they are derived rather than chosen
 *
 * "Which sub-slot the wing sits in" is a perfectly good flip indicator, but it is not
 * *the 3x3x3 module's* indicator. Measured: with the raw bit, the conversion agrees
 * with the 3x3x3 on the edge permutation, the corner permutation and the corner
 * orientation for all thirty-six outer turns, and disagrees on the flips for all
 * thirty-six. A single `U` on a solved cube reads as flipping UF and UB, which no
 * 3x3x3 convention would say.
 *
 * The two conventions differ by a fixed bit per edge — the 4x4x4 orders a pair by
 * "positive odd coordinate first", the 3x3x3 measures flip against a reference
 * facelet, and the two agree on some edges and not others. So the true flip at slot
 * `s` holding piece `p` is `raw XOR c[s] XOR c[p]`, and the bits `c` are **solved
 * for** using the 3x3x3 module itself as the oracle: turn both models, read what each
 * says, and propagate the resulting XOR constraints from `c[0] = 0`. Nothing is
 * hand-tabulated, and if either convention ever changed the derivation would follow
 * it rather than silently disagree.
 *
 * The guarantee is still the homomorphism test: turning the 4x4x4 and converting must
 * agree with converting and turning the 3x3x3, for every outer turn.
 */

let flipReference: readonly number[] | undefined;

/** The per-edge bits reconciling the 4x4x4 pair ordering with the 3x3x3 flip. */
export function edgeFlipReference(): readonly number[] {
  if (flipReference) return flipReference;

  const edges = WING_COUNT_444 / 2;
  const tables = move444Tables();
  // Constraints c[s] XOR c[p] = bit, read off single quarter turns of both models.
  const constraints: [number, number, number][] = [];
  for (const faceMove of allFaceMoves()) {
    const index = tables.findIndex(
      (table) =>
        table.move.depth === 1 &&
        table.move.face === faceMove.face &&
        table.move.amount === faceMove.amount,
    );
    if (index < 0) continue;
    const turned444 = apply444Moves(SOLVED_444_STATE, [index]);
    const turned333 = apply333(SOLVED_333, [faceMove]);
    for (let slot = 0; slot < edges; slot += 1) {
      const wing = turned444.wingPermutation[2 * slot]!;
      const piece = Math.floor(wing / 2);
      if (piece === slot) continue;
      constraints.push([slot, piece, (wing % 2) ^ turned333.edgeOrientation[slot]!]);
    }
  }

  const bits = new Array<number>(edges).fill(-1);
  bits[0] = 0;
  for (let sweep = 0; sweep < edges; sweep += 1) {
    for (const [a, b, bit] of constraints) {
      if (bits[a] !== -1 && bits[b] === -1) bits[b] = bits[a]! ^ bit;
      else if (bits[b] !== -1 && bits[a] === -1) bits[a] = bits[b]! ^ bit;
    }
    if (bits.every((bit) => bit !== -1)) break;
  }
  if (bits.some((bit) => bit === -1)) {
    throw new Error('@cube/scrambler: 4x4x4 flip reference is underdetermined');
  }
  // Every constraint must hold, not merely enough of them to fix the bits: an
  // inconsistency would mean the two conventions do not differ by a per-edge bit at
  // all, and the whole conversion would need rethinking rather than patching.
  for (const [a, b, bit] of constraints) {
    if ((bits[a]! ^ bits[b]!) !== bit) {
      throw new Error('@cube/scrambler: 4x4x4 flip reference is inconsistent');
    }
  }

  flipReference = bits;
  return flipReference;
}

export function to333State(state: Cube444State): CubeState {
  if (!areWingsPaired(state) || !areCentresSolved(state)) {
    throw new Error('@cube/scrambler: 4x4x4 hand-off needs a reduced cube');
  }

  const reference = edgeFlipReference();
  const edgePermutation = new Array<number>(WING_COUNT_444 / 2);
  const edgeOrientation = new Array<number>(WING_COUNT_444 / 2);
  for (let edge = 0; edge < WING_COUNT_444 / 2; edge += 1) {
    const wing = state.wingPermutation[2 * edge]!;
    const piece = Math.floor(wing / 2);
    edgePermutation[edge] = piece;
    edgeOrientation[edge] = (wing % 2) ^ reference[edge]! ^ reference[piece]!;
  }

  return {
    cornerPermutation: [...state.cornerPermutation],
    cornerOrientation: [...state.cornerOrientation],
    edgePermutation,
    edgeOrientation,
  };
}

function permutationParity(permutation: readonly number[]): number {
  const seen = new Array<boolean>(permutation.length).fill(false);
  let transpositions = 0;
  for (let start = 0; start < permutation.length; start += 1) {
    if (seen[start]) continue;
    let length = 0;
    for (let at = start; !seen[at]; at = permutation[at]!) {
      seen[at] = true;
      length += 1;
    }
    transpositions += length - 1;
  }
  return transpositions % 2;
}

/**
 * Whether a hand-off state is one a 3x3x3 can actually be in — which a reduced
 * 4x4x4 need **not** be.
 *
 * Three invariants hold on every physical 3x3x3 and only two of them survive
 * reduction:
 *
 * 1. **Twist sum divisible by 3.** Survives: corners are ordinary 3x3x3 corners on
 *    a 4x4x4 and nothing in the reduction touches them.
 * 2. **Flip sum even.** Does *not* survive. A dedge can be paired the other way
 *    round — its two wings swapped inside their slot pair — which reads as a single
 *    flipped edge. An odd number of those is the parity competitors call **OLL
 *    parity**, and it is a genuine 4x4x4 position with no 3x3x3 counterpart.
 * 3. **Corner and edge permutation parities equal.** Does *not* survive either.
 *    A 4x4x4 has no invariant tying the wings to the corners (checkpoint B), so the
 *    reduced position can want a bare two-edge swap — **PLL parity**.
 *
 * So this is not a sanity check on the conversion. It is the question "did the
 * reduction land in the 3x3x3 subgroup or in the other coset", and the answer is no
 * about three times in four.
 */
export function is333Reachable(state: CubeState): boolean {
  const twist = state.cornerOrientation.reduce((sum, twist) => sum + twist, 0);
  if (twist % 3 !== 0) return false;
  const flips = state.edgeOrientation.reduce((sum, flip) => sum + flip, 0);
  if (flips % 2 !== 0) return false;
  return (
    permutationParity(state.cornerPermutation) === permutationParity(state.edgePermutation)
  );
}

/** Which of the three invariants a hand-off state breaks, for diagnostics and tests. */
export function parityOf444Handoff(state: CubeState): 'none' | 'flip' | 'permutation' | 'both' {
  const flips = state.edgeOrientation.reduce((sum, flip) => sum + flip, 0) % 2 !== 0;
  const swapped =
    permutationParity(state.cornerPermutation) !== permutationParity(state.edgePermutation);
  if (flips && swapped) return 'both';
  if (flips) return 'flip';
  if (swapped) return 'permutation';
  return 'none';
}

export { CORNER_COUNT_444 };
