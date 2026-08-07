/**
 * The CFOP case library `cube-manager-frontend` ships, as an **external
 * corpus** for the parser.
 *
 * Why it is copied rather than imported: the two live in separate repositories
 * with separate release cycles, and this package has no dependency on the app
 * — importing across that boundary would invent one. Copied verbatim from
 * `cube-manager-frontend/src/lib/algorithm-data.ts` on 2026-08-07; the
 * frontend was not modified.
 *
 * Its value is that it was **not written for this parser**. It is real
 * third-party notation that `cubing/alg` already validates in the app, and it
 * exercises exactly the spellings a hand-rolled grammar gets wrong: lowercase
 * wide moves (`r`, `l'`, `r2`), slice moves (`M`, `M'`, `M2`) and rotations
 * (`x`, `x'`, `y`, `y'`), mixed freely with ordinary face turns.
 *
 * These strings are notation samples. Whether each is the *correct* algorithm
 * for its case is the app's question, not this package's, and the frontend's
 * own doc comment already records that as unverified.
 */

export const CFOP_CORPUS: readonly string[] = [
  'R U2 R2 F R F\' U2 R\' F R F\'', // OLL-01
  'r U r\' U2 r U2 R\' U2 R U\' r\'', // OLL-02
  'r\' R2 U R\' U r U2 r\' U M\'', // OLL-03
  'M U R U R\' U\' M\' R\' F R F\'', // OLL-04
  'r\' U2 R U R\' U r', // OLL-05
  'r U R\' U\' r\' F R F\'', // OLL-06
  'r U R\' U R U2 r\'', // OLL-07
  'r\' U\' R U\' R\' U2 r', // OLL-08
  'R U R\' U\' R\' F R2 U R\' U\' F\'', // OLL-09
  'R U R\' U R\' F R F\' R U2 R\'', // OLL-10
  'r\' R2 U R\' U R U2 R\' U M\'', // OLL-11
  'M\' R\' U\' R U\' R\' U2 R U\' R r\'', // OLL-12
  'F U R U\' R2 F\' R U R U\' R\'', // OLL-13
  'R\' F R U R\' F\' R F U\' F\'', // OLL-14
  'r\' U\' r R\' U\' R U r\' U r', // OLL-15
  'r U r\' R U R\' U\' r U\' r\'', // OLL-16
  'R U R\' U R\' F R F\' U2 R\' F R F\'', // OLL-17
  'r U R\' U R U2 r2 U\' R U\' R\' U2 r', // OLL-18
  'r\' R U R U R\' U\' M\' R\' F R F\'', // OLL-19
  'r U R\' U\' M2 U R U\' R\' U\' M\'', // OLL-20
  'R U2 R\' U\' R U R\' U\' R U\' R\'', // OLL-21
  'R U2 R2 U\' R2 U\' R2 U2 R', // OLL-22
  'R2 D\' R U2 R\' D R U2 R', // OLL-23
  'F l\' U\' L U L\' F\' L\'', // OLL-24
  'F\' r U R\' U\' r\' F R', // OLL-25
  'R U2 R\' U\' R U\' R\'', // OLL-26
  'R U R\' U R U2 R\'', // OLL-27
  'r U R\' U\' r\' R U R U\' R\'', // OLL-28
  'R U R\' U\' R U\' R\' F\' U\' F R U R\'', // OLL-29
  'F R\' F R2 U\' R\' U\' R U R\' F2', // OLL-30
  'R\' U\' F U R U\' R\' F\' R', // OLL-31
  'L U F\' U\' L\' U L F L\'', // OLL-32
  'R U R\' U\' R\' F R F\'', // OLL-33
  'R U R2 U\' R\' F R U R U\' F\'', // OLL-34
  'R U2 R2 F R F\' R U2 R\'', // OLL-35
  'L\' U\' L U\' L\' U L U L F\' L\' F', // OLL-36
  'F R\' F\' R U R U\' R\'', // OLL-37
  'R U R\' U R U\' R\' U\' R\' F R F\'', // OLL-38
  'L F\' L\' U\' L U F U\' L\'', // OLL-39
  'R\' F R U R\' U\' F\' U R', // OLL-40
  'R U R\' U R U2 R\' F R U R\' U\' F\'', // OLL-41
  'R\' U\' R U\' R\' U2 R F R U R\' U\' F\'', // OLL-42
  'F\' U\' L\' U L F', // OLL-43
  'F U R U\' R\' F\'', // OLL-44
  'F R U R\' U\' F\'', // OLL-45
  'R\' U\' R\' F R F\' U R', // OLL-46
  'R\' U\' R\' F R F\' R U\' R\' U2 R', // OLL-47
  'F R U R\' U\' R U R\' U\' F\'', // OLL-48
  'r U\' r2 U r2 U r2 U\' r', // OLL-49
  'r\' U r2 U\' r2 U\' r2 U r\'', // OLL-50
  'F U R U\' R\' U R U\' R\' F\'', // OLL-51
  'R U R\' U R U\' B U\' B\'', // OLL-52
  'r\' U\' R U\' R\' U R U\' R\' U2 r', // OLL-53
  'r U R\' U R U\' R\' U R U2 r\'', // OLL-54
  'R U2 R2 U\' R U\' R\' U2 F R F\'', // OLL-55
  'r\' U\' r U\' R\' U R U\' R\' U R r\' U r', // OLL-56
  'R U R\' U\' M\' U R U\' r\'', // OLL-57
  'x R\' U R\' D2 R U\' R\' D2 R2 x\'', // PLL-Aa
  'x R2 D2 R U R\' D2 R U\' R x\'', // PLL-Ab
  'x\' R U\' R\' D R U R\' D\' R U R\' D R U\' R\' D\' x', // PLL-E
  'R\' U\' F\' R U R\' U\' R\' F R2 U\' R\' U\' R U R\' U R', // PLL-F
  'R2 U R\' U R\' U\' R U\' R2 U\' D R\' U R D\'', // PLL-Ga
  'R\' U\' R U D\' R2 U R\' U R U\' R U\' R2 D', // PLL-Gb
  'R2 U\' R U\' R U R\' U R2 U D\' R U\' R\' D', // PLL-Gc
  'R U R\' U\' D R2 U\' R U\' R\' U R\' U R2 D\'', // PLL-Gd
  'M2 U M2 U2 M2 U M2', // PLL-H
  'L\' U\' L F L\' U\' L U L F\' L2 U L', // PLL-Ja
  'R U R\' F\' R U R\' U\' R\' F R2 U\' R\'', // PLL-Jb
  'R U R\' U R U R\' F\' R U R\' U\' R\' F R2 U\' R\' U2 R U\' R\'', // PLL-Na
  'R\' U R U\' R\' F\' U\' F R U R\' F R\' F\' R U\' R', // PLL-Nb
  'R U\' R\' U\' R U R D R\' U\' R D\' R\' U2 R\'', // PLL-Ra
  'R\' U2 R U2 R\' F R U R\' U\' R\' F\' R2', // PLL-Rb
  'R U R\' U\' R\' F R2 U\' R\' U\' R U R\' F\'', // PLL-T
  'R2 U\' R\' U\' R U R U R U\' R', // PLL-Ua
  'R2 U R U R\' U\' R\' U\' R\' U R\'', // PLL-Ub
  'R\' U R\' U\' y R\' F\' R2 U\' R\' U R\' F R F', // PLL-V
  'F R U\' R\' U\' R U R\' F\' R U R\' U\' R\' F R F\'', // PLL-Y
  'M2 U M2 U M\' U2 M2 U2 M\'', // PLL-Z
  'U R U\' R\'', // F2L-01
  'U\' F\' U F', // F2L-02
  'y\' U\' L\' U L U R U\' R\'', // F2L-03
  'U R U\' R\' U\' F\' U F', // F2L-04
  'R U\' R\' U R U\' R\'', // F2L-05
  'U\' F\' U\' F U F\' U\' F', // F2L-06
  'R U R\' U\' R U R\'', // F2L-07
  'F\' U F U\' F\' U F', // F2L-08
  'U R U2 R\' U R U\' R\'', // F2L-09
  'U\' F\' U2 F U\' F\' U F', // F2L-10
  'R U2 R\' U\' R U R\'', // F2L-11
  'F\' U2 F U F\' U\' F', // F2L-12
  'U\' R U R\' U R U\' R\'', // F2L-13
  'U F\' U\' F U\' F\' U F', // F2L-14
  'R U\' R\' U\' R U\' R\' U R U\' R\'', // F2L-15
  'F\' U F U F\' U F U\' F\' U F', // F2L-16
  'U R U\' R\' U R U\' R\'', // F2L-17
  'U\' F\' U F U\' F\' U F', // F2L-18
  'R U R\' U R U\' R\' U R U\' R\'', // F2L-19
  'F\' U\' F U\' F\' U F U F\' U\' F', // F2L-20
  'U R U2 R\' U\' R U R\'', // F2L-21
  'U\' F\' U2 F U F\' U\' F', // F2L-22
  'R U\' R\' U2 R U\' R\'', // F2L-23
  'F\' U F U2 F\' U F', // F2L-24
  'y L\' U\' L U\' L\' U L', // F2L-25
  'y\' R U R\' U R U\' R\'', // F2L-26
  'U R U\' R\' U2 R U\' R\'', // F2L-27
  'U\' F\' U F U2 F\' U F', // F2L-28
  'R U R\' U2 R U R\' U\' R U R\'', // F2L-29
  'F\' U\' F U2 F\' U\' F U F\' U\' F', // F2L-30
  'U\' R U R\' U R U R\'', // F2L-31
  'U F\' U\' F U\' F\' U\' F', // F2L-32
  'R U\' R\' U R U R\'', // F2L-33
  'F\' U F U\' F\' U\' F', // F2L-34
  'R U2 R\' U2 R U\' R\'', // F2L-35
  'F\' U2 F U2 F\' U F', // F2L-36
  'U R U R\' U\' R U\' R\' U R U\' R\'', // F2L-37
  'U\' F\' U\' F U F\' U F U\' F\' U F', // F2L-38
  'R U\' R\' U R U2 R\' U R U\' R\'', // F2L-39
  'F\' U F U\' F\' U2 F U\' F\' U F', // F2L-40
  'y L\' U2 L U L\' U\' L U L\' U\' L', // F2L-41
  'R\' D\' R D', // BEG-01
  'U\' L\' U L U F U\' F\'', // BEG-03
  'U R U\' L\' U R\' U\' L', // BEG-06
];
