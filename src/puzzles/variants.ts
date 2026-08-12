import { registerMultiScrambler, registerScrambler } from '../core/scrambler-registry';
import type { RandomSource } from '../random/random-source';
import {
  CUBE_333_SIZE,
  generate333Scramble,
  generate333ScrambleWithFloor,
  prepare333Tables,
} from './333/solve';
import { generate444Scramble, prepare444Tables } from './444/solve';
import {
  generateCubeNxNScramble,
  prepareCubeNxNModel,
  RANDOM_MOVE_CUBES,
} from './nxn/solve';
import { withMinimumDistance } from './nxn/minimum';
import { withRandomOrientation } from './nxn/orientation';

/**
 * Events that are the *same puzzle* as one already implemented, differing only
 * in how a human is allowed to solve it.
 *
 * `333oh` (One-Handed) is a plain alias for `333`: identical cube, identical
 * notation, identical scramble requirements — only the human constraint
 * differs, and a scramble knows nothing about that. TNoodle agrees, serving
 * `333oh` from the same `THREE` puzzle it serves `333` from.
 *
 * **`333fm` used to be registered here too, and that was a bug.** The claim
 * that Fewest Moves has "identical scramble requirements" to `333` was simply
 * false: an official FMC scramble is padded with `R' U' F` at both ends, which
 * is why TNoodle gives it a puzzle class of its own
 * (`ThreeByThreeCubeFewestMovesPuzzle`, registered as `THREE_FM`). It now has
 * a generator of its own here as well — see `333/fewest-moves.ts`, which also
 * explains what the padding is for and why it needs the solver's cooperation.
 * Unlike every other gap this package has had, this one was visible on the
 * first scramble: an FMC competitor knows their scramble starts `R' U' F`.
 *
 * The **blindfolded** events are not plain aliases either, and this is the one
 * place that distinction bites. WCA Regulation 4b3a:
 *
 * > For blindfolded events, the scramble sequence must orient the puzzle
 * > randomly (equal probability for each orientation).
 *
 * A 3x3x3 scramble is all single-layer turns, so it never moves a centre and
 * always leaves the cube white-up green-front. For a blindfolded solve the
 * starting orientation is part of what has to be memorised, so always being
 * the same would be a genuine advantage — hence the wide-move suffix that
 * official 3BLD scrambles end with. See `nxn/orientation.ts`, which searches
 * for a complete set of 24 suffixes rather than assuming a vocabulary that
 * covers them.
 *
 * **`333mbf`** (Multi-Blind) is here too, and it used to be the one deliberate
 * absence. The reason given was:
 *
 * > it is one inspection over *many* cubes, which does not fit a
 * > one-scramble-per-call API. Adding it would mean changing what
 * > `generateScramble` returns for every other event.
 *
 * The first sentence is true and the second was not, which is the part that
 * mattered — it was the whole objection, and it was a guess about how the
 * problem would have to be solved rather than a fact about it. Neither
 * reference implementation works that way. `cubing@0.63.3` maps
 * `case "333bf": case "333mbf":` to the *same* `random333OrientedScramble()`
 * and leaves the caller to loop; TNoodle has no multi-blind puzzle class at
 * all, and its `generateScrambles(r, count)` is a bare loop over the ordinary
 * `333ni` generator.
 *
 * So multi-blind is not a different *scramble*, it is a different *number* of
 * them, and the package says that in the two places it costs nothing:
 * `options.count` on the way in, `result.scrambles` on the way out. Both are
 * optional additions — `event`, `moves` and `quality` are untouched, and
 * `moves` is still `scrambles[0]` — so nothing that existed before this
 * changed. Each cube is a full `generate333BlindfoldedScramble`: its own
 * uniform draw, its own orientation suffix, its own 4b3 floor checked after
 * that suffix.
 */

const CUBE_444_SIZE = 4;

/**
 * 5x5x5's size and scramble length, read from the same table `555` registers
 * from — so `555bf` cannot drift out of step with `555` if that length ever
 * changes.
 */
const CUBE_555 = (() => {
  const entry = RANDOM_MOVE_CUBES.find((c) => c.event === '555');
  if (!entry) throw new Error('variants: 555 is missing from RANDOM_MOVE_CUBES');
  return entry;
})();

/**
 * The 4b3 minimum is checked **after** the orientation suffix, not before.
 *
 * A wide move is a whole-puzzle rotation composed with a turn, so appending one
 * moves the state by a move as well as reorienting it: a state exactly two
 * moves from solved can come back one move from solved. Filtering the draw and
 * then appending would leave the sequence actually handed to a competitor
 * unchecked, which is the wrong end of the process to check.
 */
function generate333BlindfoldedScramble(random: RandomSource): string {
  return withMinimumDistance(CUBE_333_SIZE, () =>
    withRandomOrientation(generate333Scramble(random), random, CUBE_333_SIZE),
  );
}

/**
 * 4x4x4 blindfolded — a `444` scramble plus a random **whole-cube rotation**.
 *
 * This event used to be the one blindfolded event here with no orientation suffix
 * at all, on the argument in §11 of the 4x4x4 design document: a 4x4x4 has no fixed
 * centre, so its orientation is not observable, and the random-state draw already
 * happens in a random frame. That argument is still in §11 and is still sound.
 *
 * It was overruled by what the official program actually emits.
 * TNoodle's `NoInspectionFourByFourCubePuzzle` appends
 * `getRandomOrientationMoves(size - 1)`, which at full thickness spells a rotation
 * — `x`, `y`, `z` — rather than a wide move. So TNoodle does not claim the
 * orientation is observable either; it appends something that changes nothing about
 * the state and only tells the competitor how to pick the puzzle up. cubing.js
 * agrees that `444bf` differs from `444`. Being alone against both was not a
 * position worth holding for a suffix that costs at most two tokens.
 *
 * The 4b3 floor is checked after the suffix, matching the other blindfolded events.
 * For this one it cannot change the answer — a rotation preserves distance to solved
 * exactly — but the check belongs on the sequence handed to a competitor rather than
 * on an intermediate, and writing it the same way as the others is what keeps that
 * true if the suffix ever stops being a pure rotation.
 */
function generate444BlindfoldedScramble(random: RandomSource): string {
  return withMinimumDistance(CUBE_444_SIZE, () =>
    withRandomOrientation(generate444Scramble(random), random, CUBE_444_SIZE),
  );
}

function generate555BlindfoldedScramble(random: RandomSource): string {
  return withMinimumDistance(CUBE_555.size, () =>
    withRandomOrientation(
      generateCubeNxNScramble(random, CUBE_555.size, CUBE_555.length),
      random,
      CUBE_555.size,
    ),
  );
}

/**
 * Registers the variant events. Called explicitly from `src/index.ts` *after*
 * the puzzles they build on, same as every other registration.
 */
export function registerVariantScramblers(): void {
  // Same puzzle, same scramble — only the human constraint differs. `333fm`
  // is deliberately not here; it is a puzzle of its own now.
  registerScrambler('333oh', (random) => generate333ScrambleWithFloor(random), 'random-state', prepare333);

  // Same puzzle, plus a random orientation (Regulation 4b3a). Each carries the
  // *same* preparer as the event it is a variant of, plus the facelet model the
  // orientation suffix and the 4b3 floor check need at that size — the variant's
  // cold cost is the base event's cold cost, and pretending otherwise would make
  // `prepareEvent('444bf')` a partial promise.
  registerScrambler('333bf', generate333BlindfoldedScramble, 'random-state', prepare333);
  registerScrambler('444bf', generate444BlindfoldedScramble, 'random-state', prepare444);
  registerScrambler('555bf', generate555BlindfoldedScramble, 'random-moves', prepare555);

  // Same scramble as `333bf`, drawn `options.count` times — the only event
  // where one attempt covers many cubes.
  registerMultiScrambler('333mbf', generate333BlindfoldedScramble, 'random-state', prepare333);
}

function prepare333(): void {
  prepare333Tables();
  prepareCubeNxNModel(CUBE_333_SIZE);
}

function prepare444(): void {
  prepare444Tables();
  prepareCubeNxNModel(CUBE_444_SIZE);
}

function prepare555(): void {
  prepareCubeNxNModel(CUBE_555.size);
}

export { generate333BlindfoldedScramble, generate555BlindfoldedScramble };
