/**
 * cubing.js's model of the Face Turning Octahedron, frozen as data — test-only.
 *
 * ## Why this exists
 *
 * A consumer will very likely *display* an FTO scramble from this package with
 * cubing.js (`<twisty-player puzzle="fto">`), whose FTO is the reference the
 * community already uses. If the two models disagreed about a single face name
 * or turning direction, the picture would show a state this package did not
 * draw, and nothing in this package alone could notice. These tables let
 * `interop.test.ts` prove, on every CI run, that each of the eight named turns
 * here **is** cubing.js's turn of the same name — without depending on cubing.js,
 * which this package deliberately does not.
 *
 * ## Where it came from
 *
 * `cubing@0.63.3`, read on 2026-10-21 with `puzzles.fto.kpuzzle()` and
 * `kpuzzle.moveToTransformation(face).transformationData`. Orbits there are
 * `C4RNER` (6 pieces, 4 orientation values), `EDGES` (12, 2) and `CENTERS`
 * (24, 1); here they are named `corners`, `edges`, `centres`. Convention:
 * `permutation[i]` is the slot whose piece ends up in slot `i`, and
 * `orientationDelta[i]` is added (mod the orbit's orientation count) to the piece
 * arriving at slot `i`. These are numeric facts about the puzzle's mechanics, not
 * code; nothing here is executed from cubing.js.
 *
 * `SCRAMBLES` are twelve outputs of cubing.js's own `randomScrambleForEvent('fto')`
 * from the same session — xyzzy's random-state solver. Over 40 of them: 23–29 moves,
 * median 27, using exactly the sixteen tokens `U F R L B D BR BL` and their primes.
 */

export interface ReferenceTurn {
  readonly corners: { readonly permutation: readonly number[]; readonly orientationDelta: readonly number[] };
  readonly edges: { readonly permutation: readonly number[]; readonly orientationDelta: readonly number[] };
  readonly centres: { readonly permutation: readonly number[] };
}

export const CUBINGJS_VERSION = '0.63.3';

/** Orientation values per piece in each cubing.js orbit. */
export const ORIENTATIONS = { corners: 4, edges: 2, centres: 1 } as const;

export const CUBINGJS_FTO_TURNS: Readonly<Record<string, ReferenceTurn>> = {
  U: {
    corners: { permutation: [0, 5, 2, 1, 4, 3], orientationDelta: [0, 0, 0, 0, 0, 0] },
    edges: { permutation: [0, 1, 2, 3, 4, 5, 8, 7, 11, 9, 10, 6], orientationDelta: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    centres: { permutation: [0, 1, 2, 3, 4, 12, 6, 10, 8, 9, 18, 11, 21, 13, 14, 15, 16, 17, 7, 19, 23, 5, 20, 22] },
  },
  F: {
    corners: { permutation: [2, 0, 1, 3, 4, 5], orientationDelta: [2, 3, 3, 0, 0, 0] },
    edges: { permutation: [10, 0, 2, 3, 4, 5, 6, 7, 8, 9, 1, 11], orientationDelta: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    centres: { permutation: [14, 0, 2, 3, 4, 5, 7, 9, 8, 6, 10, 21, 12, 13, 1, 15, 16, 11, 18, 19, 20, 17, 22, 23] },
  },
  R: {
    corners: { permutation: [0, 2, 5, 3, 4, 1], orientationDelta: [0, 3, 3, 0, 0, 2] },
    edges: { permutation: [4, 1, 2, 3, 6, 5, 0, 7, 8, 9, 10, 11], orientationDelta: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    centres: { permutation: [4, 2, 20, 3, 23, 7, 6, 11, 8, 9, 10, 5, 12, 13, 14, 15, 16, 17, 18, 19, 1, 21, 22, 0] },
  },
  L: {
    corners: { permutation: [1, 3, 2, 0, 4, 5], orientationDelta: [3, 2, 0, 3, 0, 0] },
    edges: { permutation: [0, 1, 2, 3, 4, 5, 6, 10, 8, 9, 11, 7], orientationDelta: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    centres: { permutation: [22, 1, 2, 0, 4, 5, 6, 7, 8, 21, 10, 11, 12, 13, 20, 15, 16, 17, 9, 14, 19, 18, 3, 23] },
  },
  B: {
    corners: { permutation: [0, 1, 2, 5, 3, 4], orientationDelta: [0, 0, 0, 2, 3, 3] },
    edges: { permutation: [0, 1, 9, 3, 4, 5, 6, 7, 2, 8, 10, 11], orientationDelta: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    centres: { permutation: [0, 1, 16, 3, 4, 5, 6, 7, 8, 9, 13, 11, 10, 12, 14, 19, 22, 17, 18, 23, 20, 21, 2, 15] },
  },
  D: {
    corners: { permutation: [4, 1, 0, 3, 2, 5], orientationDelta: [0, 0, 0, 0, 0, 0] },
    edges: { permutation: [0, 3, 2, 5, 4, 1, 6, 7, 8, 9, 10, 11], orientationDelta: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    centres: { permutation: [0, 3, 2, 15, 14, 5, 17, 7, 6, 9, 10, 11, 12, 13, 16, 1, 4, 8, 18, 19, 20, 21, 22, 23] },
  },
  BR: {
    corners: { permutation: [0, 1, 4, 3, 5, 2], orientationDelta: [0, 0, 2, 0, 3, 3] },
    edges: { permutation: [0, 1, 4, 3, 5, 2, 6, 7, 8, 9, 10, 11], orientationDelta: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    centres: { permutation: [0, 1, 4, 3, 15, 6, 13, 7, 10, 9, 11, 8, 12, 5, 14, 2, 16, 17, 18, 19, 20, 21, 22, 23] },
  },
  BL: {
    corners: { permutation: [3, 1, 2, 4, 0, 5], orientationDelta: [3, 0, 0, 3, 2, 0] },
    edges: { permutation: [0, 1, 2, 7, 4, 5, 6, 9, 8, 3, 10, 11], orientationDelta: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    centres: { permutation: [0, 1, 2, 19, 4, 5, 6, 7, 9, 12, 10, 11, 8, 17, 14, 15, 3, 18, 13, 16, 20, 21, 22, 23] },
  },
};

/** Twelve scrambles from cubing.js's `randomScrambleForEvent('fto')`, verbatim. */
export const CUBINGJS_FTO_SCRAMBLES: readonly string[] = [
  "R B R D' L' B' BL' L' B BL' L' D BL' B R BL' B' D' B' BR B' U' B BR' BL'",
  "D' R' L D' L D' B R' BR R BR' R BR' D B L D B' R' BL U' BR BL F L' BR'",
  "L D' B' R B L B' D' F' R F' D L' B' F L R B' R' D' BL' BR' BL F' R' BR",
  "D L' D R L' B L' B' BL' L B' D BL L' B BL' B D' L' B' R' BL' F' R' U BR BL' B BL'",
  "L D' B D' B' R' L D BL L D' BL' L' BL' L' B BL L' R L BL U' BR' B BL' BR B BL'",
  "R' D' L' D' L B' L' BL' L BL B' BL L' B' R BL' D BL' D L' BR' D F' BL' F L' F",
  "R' L B D' B R' B L' BR R' BR R B' BR D' BR' R B' BR' D' U F' U BL B F' U",
  "L R L' B' L D R' B' BR R BR R B' L' BR R BR' B D' R BR' BL' F BL BR R' F' BL",
  "B D L' R B' L' B R' BL' B' D' BL L R' L BL L' B R BL' L BR F' BL BR B L'",
  "R D L R D' B' R BR R L' BR R' B' BR' B D' R' BR' B' F' BR B' U' B L' U'",
  "D L B' D' L D L BL' B D BL' B BL' B D' B' BL D BL' L' U' L B U' L' F U'",
  "L D L D B D R L BL L' BL L' D B' R' BL' D' BL D' L BR' R BL' U BL' D' BL'",
];
