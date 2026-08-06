import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import { solveCentres444 } from './centres';
import { isCentreNeutral } from './generators';
import { areCentresSolved } from './orbits';
import { phase1Search } from './phase1-search';
import { WING_COUNT_444 } from './pieces';
import { apply444Moves, move444Tables, SOLVED_444_STATE } from './state';

/**
 * The two **parity gadgets** — and both are derived here, not recited from a table
 * of learned algorithms.
 *
 * A reduced 4x4x4 sits outside the 3x3x3 subgroup about three times in four, in one
 * of two independent ways (`handoff.ts`):
 *
 * | what is wrong | what fixes it |
 * |---|---|
 * | an odd number of dedges paired the wrong way round | a centre-neutral sequence that is **odd** on the 24 wings |
 * | corner and edge permutation parities disagree | another pass of the wing-odd gadget and a fresh pairing |
 *
 * ## Why the first one has to be searched for
 *
 * The flip sum's parity equals the parity of the wing permutation: moving whole
 * paired dedges around is even (each is two wing transpositions), so all that is left
 * is the flips. And the pairing phase generates `A24` — everything even — so it
 * cannot change that parity. Nor can the reduction be nudged into fixing it: the
 * first thing tried here was a wide quarter turn followed by a fresh reduction, and it
 * never worked, because a wide turn leaves the centres one move from solved and the
 * centre solver simply inverts it.
 *
 * Measured facts that make the search well-posed rather than hopeful: outer turns are
 * **even** on the wings, wide quarter turns are **odd**, and random walks followed by
 * a centre solve come out odd about half the time. So centre-neutral wing-odd
 * sequences exist, and they are found by exactly that construction — a random prefix,
 * then a centre solve, keeping the first result that lands odd. Around twenty moves,
 * once per process, cached.
 *
 * ## Why there is no second gadget, which took two attempts to learn
 *
 * The plan was a matching gadget for the permutation mismatch, taken from the
 * conjugates that *keep* every slot pair together — the set `generators.ts` discards.
 * A three-move one with an odd dedge permutation turned up immediately, and it was
 * useless: it flipped the **corner** parity too, and the mismatch being fixed is
 * between corner and edge parity, so flipping both changes nothing.
 *
 * Adding the corner condition and classifying the whole family by both parities gave
 * the reason. Only two of the four combinations occur at all: `dedge-odd/corner-odd`
 * and `dedge-even/corner-even`. **In this family the two parities are locked
 * together**, so no member of it — and no product of members, since the locking is
 * preserved under composition — can ever change one without the other. The gadget being
 * searched for does not exist there, and no amount of deepening the search would find
 * it.
 *
 * What does work is re-pairing. Another pass of the wing-odd gadget followed by a fresh
 * pairing lands on *some* paired arrangement, and which one is not something the parity
 * argument constrains — so the mismatch is resolved by trying again rather than by a
 * targeted fix. `solve.ts` runs that loop.
 */

const EDGES = WING_COUNT_444 / 2;

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

/** The parity of a state's wing permutation, which is also its flip sum's parity. */
export function wingParityOf(wingPermutation: readonly number[]): number {
  return permutationParity(wingPermutation);
}

/** The dedge permutation a wing map induces, when it keeps slot pairs together. */
export function dedgePermutationOf(wingDestination: readonly number[]): number[] {
  return Array.from({ length: EDGES }, (_, edge) =>
    Math.floor(wingDestination[2 * edge]! / 2),
  );
}

const oddWings: number[][] = [];
let searchState: { random: ReturnType<typeof createRandomSource>; attempt: number } | undefined;

/**
 * The `index`-th centre-neutral sequence that is odd on the wings.
 *
 * There has to be more than one, and the reason is a cycle. The solver applies a
 * gadget, pairs again, and re-checks; with a *single* gadget all of that is
 * deterministic, so a cube that goes flip -> permutation goes permutation -> flip on
 * the next pass and alternates for ever. Twenty-four passes measured, no convergence.
 * Handing each pass a different gadget lands the dedges somewhere genuinely different,
 * and the loop terminates.
 *
 * The sequences are found by one shared search that resumes where it left off, so
 * asking for the tenth does not redo the first nine, and the fixed seed keeps the whole
 * list identical in every process.
 */
export function oddWingGadget(index = 0): readonly number[] {
  const tables = move444Tables();
  searchState ??= { random: createRandomSource('cubesmith 4x4x4 odd wing gadget'), attempt: 0 };

  while (oddWings.length <= index) {
    if (searchState.attempt >= 20_000) {
      throw new Error(`@cube/scrambler: only ${oddWings.length} odd-wing gadgets found`);
    }
    const attempt = searchState.attempt;
    searchState.attempt += 1;
    const prefix = Array.from({ length: 3 + (attempt % 6) }, () =>
      randomInt(searchState!.random, tables.length),
    );
    const seeded = apply444Moves(SOLVED_444_STATE, prefix);
    const toPairs = phase1Search(seeded);
    const withPairs = apply444Moves(seeded, toPairs);
    const sequence = [...prefix, ...toPairs, ...solveCentres444(withPairs)];
    const landed = apply444Moves(SOLVED_444_STATE, sequence);
    if (!areCentresSolved(landed) || !isCentreNeutral(sequence)) continue;
    if (wingParityOf(landed.wingPermutation) !== 1) continue;
    oddWings.push(sequence);
  }
  return oddWings[index]!;
}
