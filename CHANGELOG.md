# Changelog

This file starts at **0.10.0**. Versions `0.1.0` through `0.9.1` shipped without
one and no entries have been reconstructed for them — an invented history would
be less useful than an honest gap. What each earlier version added is recorded
in the `docs/*-design.md` header lines ("shipped since v0.4", and so on).

The package is pre-1.0, so by convention a **minor** bump may carry breaking
changes and a patch bump may not.

---

## 0.10.0

Event coverage reaches **17 of 17**, two events' scrambles change, and the
package can now read the notation it writes.

### ⚠️ Breaking: two events produce different scrambles for the same seed

Neither is an API change — no export was removed or altered — but if you have
recorded seeded fixtures or snapshot tests for either event, they will change.

- **`333fm` — the old output was not a Fewest Moves scramble at all.** It was
  registered as a plain alias for `333`. Every official FMC scramble is padded
  `R' U' F` … `R' U' F`; TNoodle, the official WCA scramble program, models it
  as a separate puzzle class (`ThreeByThreeCubeFewestMovesPuzzle`) for exactly
  this reason. If you recorded `333fm` fixtures before this release you
  recorded invalid data — re-record them, but do not assume the old ones were
  merely differently-shaped.
- **`444bf` now ends with a random whole-cube rotation** (`x`, `y`, `z`).
  Previously it carried no orientation suffix, on the argument that an even
  cube has no fixed centre and so no observable orientation. TNoodle appends
  one anyway — and appends a *rotation*, which cannot change the state, only
  how the competitor is told to hold the puzzle. cubing.js agrees that `444bf`
  differs from `444`. The full argument and why it was overruled is in
  `docs/444-design.md` §11.

### Added

- **`333mbf` (Multi-Blind)** — the last unimplemented event. One attempt covers
  many cubes, so `generateScramble` gained an optional `count` and
  `ScrambleResult` an optional `scrambles`. `moves` is still `scrambles[0]`, so
  existing callers are unaffected. Draws are independent and deliberately not
  de-duplicated. `count` is capped at the new `MAX_SCRAMBLE_COUNT` (100) — a
  guard against blocking a caller's main thread, not a regulation — and passing
  it to any other event throws the new `InvalidScrambleCountError` rather than
  being silently ignored.
- **An algorithm-notation layer**: `parseAlgorithm`, `serializeAlgorithm`,
  `invertAlgorithm`, `AlgorithmSyntaxError` and the AST types. Reads face,
  wide, slice and rotation moves (including `3Rw`, `2-3Rw` and lowercase `r`),
  groups with repetitions, commutators, conjugates, pauses and `//` comments,
  nested arbitrarily; syntax errors carry the offset. It is **syntax only** —
  there is no puzzle behind it, so no `simplify()` and no move cancellation.
  See `docs/notation-design.md`.

### Fixed

- **Regulation 4b3's two-move floor now applies to every one of the seventeen
  events.** It was missing for `333`, `333oh` and `minx`, while `README.md`
  claimed it was enforced everywhere. Seeded output for those events is
  unchanged — the first draw clears the floor with probability
  `1 − 4 × 10⁻¹⁹` — so this is additive in practice and a conformance fix in
  principle.

### Notes

- `parseMove`, `moveToString`, `movesToString`, `inverseMove`, `inverseMoves`,
  `FACES` and `AMOUNTS` are unchanged and not deprecated. They are the narrow
  face-move primitives the cube puzzles are built on, and the new notation
  layer does not supersede them.
- Bundle: `dist/index.js` is 207,943 B raw / 45,397 B gzip, of which the
  notation layer accounts for 10,966 B raw / 2,743 B gzip.
- Two known defects are documented rather than fixed, both far below anything
  observable and both breaking seeded output if fixed: a same-face pair can
  print at the phase-1/phase-2 boundary of a 3x3x3 solve
  (`docs/333-design.md` §8), and Megaminx's floor is measured against the
  identity state rather than "solved up to whole-puzzle rotation"
  (`docs/megaminx-design.md` §8).
