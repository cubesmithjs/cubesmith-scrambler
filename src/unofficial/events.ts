import { generate222Scramble, prepare222Tables } from '../puzzles/222/solve';
import { generate333ScrambleWithFloor, prepare333Tables } from '../puzzles/333/solve';
import { generateMegaminxScramble } from '../puzzles/megaminx/solve';
import { withMinimumDistance } from '../puzzles/nxn/minimum';
import { withRandomOrientation } from '../puzzles/nxn/orientation';
import { generateCubeNxNScramble, prepareCubeNxNModel, RANDOM_MOVE_CUBES } from '../puzzles/nxn/solve';
import { generatePyraminxScramble, preparePyraminxTables } from '../puzzles/pyraminx/solve';
import type { RandomSource } from '../random/random-source';
import { BIG_CUBES, SHAPE_MODS } from './catalogue';
import { registerUnofficialScrambler } from './registry';

const SIZE_OF_BLD = { '222bf': 2, '666bf': 6, '777bf': 7 } as const;

function lengthForWcaSize(size: number): number {
  const entry = RANDOM_MOVE_CUBES.find((cube) => cube.size === size);
  if (!entry) throw new Error(`unofficial: no shipped random-moves length for size ${size}`);
  return entry.length;
}

/**
 * The blindfolded cube variants: the sighted scramble plus a uniformly random
 * orientation, by the same rule WCA Regulation 4b3a sets for `333bf`, `444bf`
 * and `555bf`. Adopting 4b3a here is a convention (it does not bind an
 * unofficial event), and the helper is the one those three events use, so an
 * even cube gets a rotation suffix and an odd one a wide-move suffix
 * (`puzzles/nxn/orientation.ts` explains why). The ≥ 2-moves floor is checked
 * after the suffix, as for `555bf`.
 */
function blindfoldedCube(size: 2 | 6 | 7, sighted: (random: RandomSource) => string) {
  return (random: RandomSource): string =>
    withMinimumDistance(size, () => withRandomOrientation(sighted(random), random, size));
}

export function registerUnofficialScramblers(): void {
  for (const { event, size, length } of BIG_CUBES) {
    registerUnofficialScrambler(event, {
      scramble: (random) => generateCubeNxNScramble(random, size, length),
      quality: 'random-moves',
      prepare: () => prepareCubeNxNModel(size),
    });
  }

  registerUnofficialScrambler('222bf', {
    scramble: blindfoldedCube(SIZE_OF_BLD['222bf'], generate222Scramble),
    quality: 'random-state',
    prepare: () => {
      prepare222Tables();
      prepareCubeNxNModel(SIZE_OF_BLD['222bf']);
    },
  });
  for (const event of ['666bf', '777bf'] as const) {
    const size = SIZE_OF_BLD[event];
    const length = lengthForWcaSize(size);
    registerUnofficialScrambler(event, {
      scramble: blindfoldedCube(size, (random) => generateCubeNxNScramble(random, size, length)),
      quality: 'random-moves',
      prepare: () => prepareCubeNxNModel(size),
    });
  }

  // Pyraminx: no orientation suffix, and that is not an omission. A Pyraminx's
  // four axial pieces never change position under any turn, so its colour frame
  // is fixed by the puzzle itself. A whole-puzzle rotation is not reachable by
  // turns and has no token in the WCA's Pyraminx notation. The scramble is
  // random-state, so what the solver memorises is already uniform.
  registerUnofficialScrambler('pyrambf', {
    scramble: generatePyraminxScramble,
    quality: 'random-state',
    prepare: preparePyraminxTables,
  });

  // Megaminx: no suffix either, for the opposite reason. Pochmann's `R++`/`D++`
  // turn the bulk of the puzzle, so a WCA scramble already moves the centres.
  // Measured over 30,000 scrambles: all 60 orientations occur, χ² = 57.5 on 59
  // degrees of freedom. The scramble is already uniformly oriented, which
  // `blindfolded.test.ts` keeps true.
  registerUnofficialScrambler('minxbf', {
    scramble: generateMegaminxScramble,
    quality: 'random-moves',
  });

  // Shape mods: the `333` scramble, with its ≥ 2-moves floor, in standard 3x3x3
  // notation relative to the mechanism.
  for (const event of SHAPE_MODS) {
    registerUnofficialScrambler(event, {
      scramble: generate333ScrambleWithFloor,
      quality: 'random-state-mechanism',
      prepare: () => {
        prepare333Tables();
        prepareCubeNxNModel(3);
      },
    });
  }
}
