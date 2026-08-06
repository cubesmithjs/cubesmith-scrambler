import { isAtLeastTwoMovesFromSolved } from '../../core/scramble-shape';
import { allMovesForSize, parseWideMove } from './notation';
import {
  applyWideMove,
  applyWideMoves,
  isUniformlyColouredNxN,
  solvedCubeNxN,
} from './state';

/**
 * Regulation 4b3's floor, checked on a **rendered scramble** rather than on a
 * drawn state.
 *
 * > An official scramble sequence must produce a random state from all states
 * > that require at least 2 moves to solve
 *
 * and 4b3e repeats the same "at least 2 moves to solve" for the random-moves
 * events. Checking the rendered string is what makes this usable for the
 * blindfolded events, where the scramble is *not* simply the drawn state: a
 * random orientation suffix is appended afterwards, and a wide move is a whole
 * puzzle rotation composed with a turn — so it moves the state by a move as
 * well as reorienting it. Filtering the draw and then appending would leave the
 * thing actually handed to a competitor unchecked, which is the wrong end.
 *
 * Applying the scramble to a solved cube and testing the result also means this
 * check shares nothing with whichever generator produced the string.
 */
export function cubeScrambleIsFarEnough(scramble: string, size: number): boolean {
  const moves = scramble
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map(parseWideMove);
  const state = applyWideMoves(solvedCubeNxN(size), moves);
  // Solvedness here is "every face one colour", not "every facelet home": a
  // blindfolded scramble deliberately rotates the puzzle, and a rotated solved
  // cube is solved.
  return isAtLeastTwoMovesFromSolved(
    state,
    allMovesForSize(size),
    applyWideMove,
    isUniformlyColouredNxN,
  );
}

/**
 * Regenerates until the scramble is far enough from solved. The probability of
 * ever redrawing is vanishing — a 60-move random-moves 5x5x5 sequence landing
 * within one move of solved is not something that will be seen — but "so
 * unlikely it cannot happen" is not the same as "cannot happen", and the
 * regulation states a requirement rather than a likelihood.
 */
export function withMinimumDistance(
  size: number,
  generate: () => string,
  attempts = 100,
): string {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const scramble = generate();
    if (cubeScrambleIsFarEnough(scramble, size)) return scramble;
  }
  throw new Error(
    `nxn-minimum: ${attempts} scrambles of a ${size}x${size}x${size} in a row were within one move of solved`,
  );
}
