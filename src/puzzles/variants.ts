import { registerScrambler } from '../core/scrambler-registry';
import type { RandomSource } from '../random/random-source';
import { generate333Scramble } from './333/solve';
import { generateCubeNxNScramble, RANDOM_MOVE_CUBES } from './nxn/solve';
import { withMinimumDistance } from './nxn/minimum';
import { withRandomOrientation } from './nxn/orientation';

/**
 * Events that are the *same puzzle* as one already implemented, differing only
 * in how a human is allowed to solve it.
 *
 * `333fm` (Fewest Moves) and `333oh` (One-Handed) are plain aliases for
 * `333`: identical cube, identical notation, identical scramble requirements —
 * only the human constraint differs, and a scramble knows nothing about that.
 *
 * The **blindfolded** events are not plain aliases, and this is the one place
 * that distinction bites. WCA Regulation 4b3a:
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
 * Two blindfolded events are deliberately absent:
 *
 * - **`444bf`** waits on `444`, which is not implemented yet. Registering it
 *   against some other puzzle's scrambler would be worse than throwing
 *   `UnimplementedEventError`.
 * - **`333mbf`** (Multi-Blind) is out of scope by design, not oversight: it is
 *   one inspection over *many* cubes, which does not fit a one-scramble-per-call
 *   API. Adding it would mean changing what `generateScramble` returns for
 *   every other event.
 */

const CUBE_333_SIZE = 3;

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
  // Same puzzle, same scramble — only the human constraint differs.
  registerScrambler('333fm', (random) => generate333Scramble(random));
  registerScrambler('333oh', (random) => generate333Scramble(random));

  // Same puzzle, plus a random orientation (Regulation 4b3a).
  registerScrambler('333bf', generate333BlindfoldedScramble);
  registerScrambler('555bf', generate555BlindfoldedScramble, 'random-moves');
}

export { generate333BlindfoldedScramble, generate555BlindfoldedScramble };
