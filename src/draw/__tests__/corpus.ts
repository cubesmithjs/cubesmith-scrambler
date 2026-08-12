import type { WcaEventId } from '../../core/types';

/**
 * Real scrambles, as **literal strings**, for the drawing tests to draw.
 *
 * ## 🔴 Why literals and not `generateScramble`
 *
 * A drawing takes **text**. Generating a scramble in order to test a *picture* pays
 * for a two-phase search to produce a string that could simply be written down — and
 * under `npm run test:coverage` that is not a small waste: V8 instrumentation slows
 * the solvers by roughly an order of magnitude, and the first version of these tests
 * (twenty seeded Square-1 draws, one generated scramble per cube size) **timed out at
 * the 180 s per-test limit in CI** while passing comfortably without coverage.
 *
 * Three other things fall out of the change, all of them wanted:
 *
 * - The drawing tests stop depending on the **generator**. A change to how a scramble
 *   is searched for would otherwise churn every golden fixture and every round-trip
 *   assertion, for reasons that have nothing to do with drawing.
 * - They stop depending on the **seed**, so nothing here can be quietly invalidated by
 *   a future change to `createRandomSource`.
 * - They run in milliseconds, which is what makes it affordable to draw *eight*
 *   Square-1 scrambles rather than two.
 *
 * ## Where these came from
 *
 * `generateScramble(event, { seed: 'lit-<event>-<i>' })` at `0.13.0`, captured
 * 2026-08-11. So they are genuine output of this package, not hand-written notation —
 * which matters for `444`, whose 140-move non-optimal solutions are unlike anything a
 * person would write, and for `clock` and `sq1`, whose token grammars a hand-written
 * sample gets subtly wrong.
 *
 * Regenerating them is fine and needs no ceremony; they are inputs, not expectations.
 * The **expectations** live in `__fixtures__/golden.json`, which would then need
 * reviewing.
 */
export const SCRAMBLE_CORPUS: Readonly<Partial<Record<WcaEventId, readonly string[]>>> = {
  "222": [
    "R' U' R F2 U' F' U' F2 R2 U2 F2",
    "U' F2 U F' R2 F' R F' R' F2 R'",
    "U2 F U' R2 F R' F R F R U2",
  ],
  "333": [
    "R2 U' F2 U B2 R2 D F2 D2 L2 U' R2 U' F2 L2 L' U2 L' B R' L' D B L2 U'",
    "U2 F2 R2 U' L2 U F2 U2 B2 U' R2 L2 B2 R' U2 F D B' L' U L' U R",
    "U B2 U' L2 U' F2 D' B2 U2 L2 F2 U L' U B' L' D U2 B R2 F2",
  ],
  "444": [
    "F2 U F2 L2 F2 U' L2 U R2 B2 D2 L2 F2 F' U' B R B L D B' R' Uw R D R' D' Uw' Uw2 F D' F' D Uw2 Lw D' R D Lw' Uw2 L' D L Uw2 Uw R D R' Uw' Lw B2 D B2 D' Lw' Uw2 R' U R U' Uw2 Uw2 R B' Lw2 F' D' Rw' D Lw2 B Uw2 D' D Lw U' F' F' D Lw' Fw F U' F' U Fw' Fw2 F' U' F U Fw2 Uw B D' B' Uw' Lw2 U' L' U Lw2 Lw D L D' Lw' Fw R' F R Fw' Lw2 B' R2 L2 B Lw2 Uw2 R Bw2 F Uw2 L' U' Fw2 Dw' R2 Uw Lw F2 Bw' Uw2 Fw2 R",
    "R2 D' L2 F2 D2 F2 D L2 U B2 F2 U B2 U' R' U B' R' L D' L2 Fw' D B' D' B Fw Fw B' D B D' Fw' Uw' F D2 F' D2 Uw Uw B D2 B' D2 Uw' Fw D' B2 D Fw' Bw2 R' D Lw2 F Uw2 U' Uw' F' Lw2 Uw' Lw2 U B' Uw Uw R D R' D' Uw' Uw2 D R D' R' Uw2 Uw2 B' D2 B D2 Uw2 Uw D2 B' D2 B Uw' Uw L' D' L Uw' Fw2 R' F2 R F2 Fw2 Fw F2 U' F2 U Fw' Lw2 B R L2 B' Lw2 Uw' R D2 R' Uw Uw2 R B Uw2 L Bw2 F' Lw2 U Rw' Uw' Lw' B R' Fw2 Lw Fw' U",
  ],
  "555": [
    "Rw2 Bw2 Lw2 Fw U' B2 Fw Rw U2 L' F2 L2 Dw' R' Lw Uw' Lw' Bw Rw B2 D2 Uw2 Fw2 Lw' Dw2 Rw' Bw2 F Fw2 B2 Lw2 D2 Bw Dw2 R' B2 Bw2 D' F R' L2 Fw Lw Fw' L2 B' Bw R2 L2 Lw2 F D U2 L Rw Lw D' B2 Bw2 Uw'",
    "B' Dw2 F' Rw' L' R D R2 Lw2 Bw Uw' B2 D' Lw Dw R2 Fw' Uw U Bw B' Uw R Uw2 Fw' Uw U Bw2 R' B F Fw2 U2 Rw' B' Dw D' Uw2 B Fw U' Lw' D2 L2 Rw2 Fw Uw R Lw Dw U2 Fw R' B' F2 Dw2 Bw2 B' Rw2 D'",
  ],
  "666": [
    "Uw2 D2 F Rw2 3Bw B2 3Rw2 R2 3Bw Fw2 F2 3Lw2 B' Dw 3Bw2 3Lw' D' Fw2 L Bw2 F L' Dw F' L' F' 3Bw2 3Fw' Rw Lw D2 F U2 D' F' R' D' F' R' Fw Rw Lw' F2 L 3Fw' 3Uw' Bw L 3Lw Dw' Bw Uw Dw2 Rw' L 3Fw2 3Bw' D 3Rw 3Lw U B' 3Dw L R' F2 3Lw2 Bw2 3Dw' Fw2 3Rw 3Lw' Rw2 Lw D 3Rw2 3Fw' Uw2 B F",
    "Uw' D' Dw F' Fw' 3Uw Uw' 3Fw' F' 3Rw U' Lw' Dw Bw 3Rw' L U2 Lw' Dw' Fw' R B 3Fw2 Uw Lw2 R2 Dw' Uw' 3Uw Rw2 B' Lw Fw Lw2 L2 R' D' F' R2 3Uw' 3Bw2 F Lw' 3Fw2 Bw' Lw 3Dw Uw' 3Rw 3Bw' Fw 3Rw2 3Lw2 L' Lw B' 3Bw' Uw' Rw2 L' Uw U' 3Lw 3Uw2 3Lw Lw L2 U F Dw2 3Fw R' D 3Bw' Fw2 F' 3Lw2 Dw' 3Fw2 U",
  ],
  "777": [
    "Rw L2 3Rw 3Uw2 D Uw' 3Bw2 Lw' Fw U 3Bw 3Dw2 Uw L2 3Bw2 U B D Fw2 U2 F B2 Dw 3Rw Uw2 3Uw2 Fw' L 3Fw Rw2 D2 Uw' 3Rw2 Rw2 B' R2 Uw' Lw' 3Bw2 Uw B' L' Rw F D' R' D' Fw' Rw2 3Rw Dw 3Lw' L2 3Dw Fw2 3Lw' B2 D' Fw2 B' Dw' R Lw Bw2 3Uw' B2 Rw2 3Bw 3Rw2 3Lw2 D2 3Uw 3Dw2 U2 3Fw2 L' 3Bw Dw' Lw L' 3Dw2 Fw' B' 3Uw' R2 3Fw2 3Dw' Rw2 3Bw2 Rw' Uw' Rw F 3Lw' 3Uw 3Fw2 3Lw B2 Dw2 3Fw2",
    "3Dw2 R2 3Rw B 3Lw Uw' Bw2 Fw 3Uw2 B 3Fw2 L Dw L U 3Rw2 Lw2 3Lw2 Rw' U L 3Bw Dw U' Fw2 L U' 3Rw F2 B Fw L2 D' Bw' 3Fw Dw' 3Uw2 D' R Uw 3Bw2 3Rw Fw2 3Fw2 Lw Dw 3Uw R' Uw2 3Fw Rw' Bw2 Lw 3Dw2 Rw' 3Dw2 Fw' R' Dw 3Lw' Fw2 3Rw2 B 3Bw' Dw2 Lw2 D' Dw2 3Uw' Bw2 Uw2 3Bw2 3Lw U' Fw R' Rw F' 3Lw U' Uw' Lw' 3Dw Bw2 B' 3Dw' Bw2 R' 3Fw U 3Uw Fw' Lw' 3Dw2 3Bw' Uw' Rw U2 Uw2 3Dw2",
  ],
  "333bf": [
    "R2 U L2 B2 D' U' F2 D' R2 U L2 L' U' F L' F2 D F D F U Uw Lw2",
    "F2 R2 U' F2 U R2 D F2 L2 U2 R2 U' B2 U2 F' U2 F2 U' F2 L D' L2 F2 U' Uw'",
  ],
  "333fm": [
    "R' U' F R2 U2 F2 D F2 U' L2 U' R2 B2 R2 D B2 U' R' U F2 D B' D' U' R U' R' U' F",
  ],
  "333mbf": [
    "U R2 U' B2 U F2 L2 F2 R2 D F2 D' R2 B2 B' D2 U' F2 R2 B' R' B L' F' U' Lw'",
  ],
  "444bf": [
    "F2 U2 F2 R2 L2 U R2 U' L2 B2 U B2 U B' U2 R F U L2 B2 U' Fw' D B' D' B Fw Fw B' D B D' Fw' Uw' F D2 F' D2 Uw Uw B D2 B' D2 Uw' Fw D' B2 D Fw' Bw2 R' D Lw2 F Uw2 U' Uw' F' Lw2 Uw' Lw2 U B' Uw Uw F' D F D' Uw' Uw2 L' D' L D Uw2 Uw2 B D' B' D Uw2 Uw L D L' D' Uw' Uw2 F D F' D' Uw2 Uw D F D' F' Uw' Fw U B' U' Fw' Uw F' U2 F Uw' Fw L' B2 F' L Fw' Lw' F' R F Lw Uw2 R' F2 R F2 Uw2 Bw2 U Rw2 D Fw2 R F Uw2 L' F' Bw' L2 Uw' Lw' B2 U Fw D Fw Uw' x2",
    "U2 L2 D' R2 D' R2 L2 F2 D' R2 D2 B2 F' D' B R' L D R2 B R2 D2 Lw L D' L' D Lw' Lw F' D F D' Lw' Lw2 B R B' R' Lw2 Lw R B R' B' Lw' Fw2 L' F' L Fw2 Fw2 L' F2 L Fw2 Fw2 U L2 U' L2 Fw2 Uw' F D2 F' Uw Lw U R' L' U' Lw' Fw2 R' Uw2 U Fw2 F' U' Dw' F' Rw' Lw' L D2 Uw2 Bw' B2 Lw Rw Dw' Fw' D B' D' B Fw Fw B' D B D' Fw' Uw' F D2 F' D2 Uw Uw B D2 B' D2 Uw' Fw D' B2 D Fw' Bw2 R' D Lw2 F Uw2 U' Uw' F' Lw2 Uw' Lw2 U B' Uw Fw L D' L' D Fw' Fw2 L' U L U' Fw2 Fw2 L F' L' F Fw2 Fw F' D F D' Fw' Fw' U F' U' Fw Uw' L D2 L' Uw Uw' F D2 F' Uw Lw' F D2 F' D2 Lw Rw2 Bw2 R B Fw2 U2 Fw' Dw' D Lw L2 Fw' R F' Lw2 z' y'",
  ],
  "pyram": [
    "R B U' B U' R' L' B' R L' R u' l",
    "U R L' R L' U R L' R' B' R' u' l' r' b",
    "L' U L' R' L R' L' U' B L B u r' b'",
    "R' B R' B U' B R L' R' L' R' u' r b'",
    "L' B L' U B L B' R' L B' L l r b",
    "U L' R' U B' U R U' R U R l' b'",
    "U L U' R' B U B L' R' L' R' r' b'",
    "R' L B L' B L' B L' B' U B' l' r",
  ],
  "skewb": [
    "U B' U' L' R' L R' B' U R L",
    "B R B' L B' L U' B L' R L'",
    "L U' R' L' B' L B U L U R",
    "B' U R' L' B' L B R B' R B'",
    "L' U' R B L R L' U L R U",
    "B U' B' U L U R' L' R L B",
    "L' R B' L B R L B L' U L",
    "L' R L' R L' U R B' R U' R",
  ],
  "clock": [
    "UR2+ DR4- DL6+ UL6+ U3- R1+ D0+ L3+ ALL5- y2 U5+ R1+ D5+ L4- ALL0+ UR DR DL",
    "UR4+ DR5+ DL0+ UL2+ U1- R5- D5+ L0+ ALL0+ y2 U1+ R5+ D0+ L5- ALL1- UR DL UL",
    "UR1- DR4+ DL3+ UL3- U4+ R5+ D3- L2+ ALL5+ y2 U4+ R0+ D2+ L6+ ALL4- UR",
    "UR0+ DR4- DL4- UL6+ U4- R0+ D5+ L0+ ALL4- y2 U4+ R0+ D5+ L2+ ALL4+ UR DL",
  ],
  "minx": [
    "R++ D-- R++ D++ R++ D-- R-- D-- R++ D++ U R-- D++ R++ D++ R++ D-- R++ D++ R-- D-- U' R++ D++ R++ D-- R++ D++ R++ D++ R++ D++ U R++ D++ R-- D++ R++ D-- R++ D-- R-- D++ U R++ D++ R++ D++ R++ D++ R-- D-- R++ D++ U R-- D-- R-- D++ R-- D-- R++ D-- R++ D-- U R-- D-- R-- D-- R++ D++ R++ D-- R-- D-- U",
    "R++ D++ R++ D++ R-- D-- R++ D-- R-- D-- U' R-- D-- R-- D++ R++ D++ R++ D++ R++ D-- U R++ D-- R-- D++ R-- D-- R-- D-- R++ D-- U' R-- D++ R-- D-- R++ D++ R++ D++ R-- D-- U R-- D++ R-- D++ R++ D++ R++ D++ R++ D++ U' R-- D-- R-- D++ R++ D-- R-- D++ R-- D++ U R++ D++ R-- D-- R-- D++ R-- D-- R-- D-- U'",
    "R-- D-- R++ D-- R++ D++ R++ D++ R-- D-- U' R-- D++ R++ D-- R++ D-- R-- D++ R++ D++ U R-- D-- R-- D-- R-- D++ R++ D++ R++ D++ U' R++ D-- R-- D-- R-- D++ R-- D-- R++ D-- U' R-- D-- R-- D++ R-- D-- R-- D-- R-- D++ U' R-- D++ R-- D++ R-- D-- R-- D++ R++ D++ U R-- D-- R++ D++ R-- D++ R-- D-- R++ D-- U'",
    "R++ D-- R-- D-- R-- D++ R-- D++ R++ D-- U R-- D++ R++ D++ R++ D-- R++ D-- R-- D++ U R-- D-- R++ D++ R-- D-- R-- D-- R++ D-- U R++ D++ R-- D++ R-- D-- R-- D++ R++ D-- U R-- D++ R++ D-- R-- D++ R-- D-- R++ D-- U R++ D++ R-- D-- R++ D-- R++ D-- R++ D++ U R++ D++ R-- D++ R++ D-- R++ D-- R++ D++ U",
  ],
  "sq1": [
    "(3,-4) / (-5,-2) / (-4,5) / (-3,3) / (-5,-2) / (0,-3) / (-1,3) / (-3,0) / (-2,-3) / (-2,-1) / (-2,4) / (-4,-3) / (-5,-4)",
    "(4,6) / (5,-1) / (0,-3) / (-5,4) / (-1,-1) / (-3,6) / (-5,1) / (-3,-4) / (0,-3) / (-1,-2) / (0,-2) / (-5,6) / (-4,0) / (-1,0) /",
    "(-3,2) / (4,-2) / (-1,2) / (-2,-5) / (-4,-1) / (-2,1) / (-3,3) / (-3,5) / (0,-3) / (-1,4) / (0,2) / (0,-1)",
    "(3,5) / (-3,0) / (-3,6) / (-2,1) / (-1,2) / (-3,3) / (-5,-2) / (-4,-4) / (0,-2) / (-3,0) / (-2,5) / (-2,0) /",
    "(-3,2) / (3,0) / (-3,0) / (-2,1) / (0,3) / (-4,-1) / (-3,-5) / (-3,0) / (-2,-3) / (-2,-1) / (-2,1) / (-2,-1)",
    "(-2,3) / (-4,2) / (0,3) / (-2,-5) / (-1,-4) / (-2,1) / (-4,2) / (-2,3) / (0,3) / (-3,6) / (-1,-3)",
    "(3,5) / (-5,1) / (0,-3) / (0,3) / (-1,2) / (-2,4) / (-1,5) / (0,1) / (-3,0) / (-2,5) / (0,-4) / (-2,-5) /",
    "(-3,5) / (6,3) / (0,3) / (-5,-2) / (0,-3) / (-1,2) / (-3,0) / (-2,0) / (0,3) / (-4,1) / (-4,6) / (0,4) / (-3,0) /",
  ],
};

/** The scrambles for one event, or a loud failure — a silent empty array would pass every loop. */
export function corpusFor(event: WcaEventId): readonly string[] {
  const scrambles = SCRAMBLE_CORPUS[event];
  if (!scrambles || scrambles.length === 0) {
    throw new Error(`corpus: no scrambles recorded for "${event}"`);
  }
  return scrambles;
}
