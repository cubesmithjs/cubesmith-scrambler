# Megaminx — design document

Written *after* the implementation, to record what `src/puzzles/megaminx/`
actually does. This is the only implemented puzzle here with **no solver**, and
that is a regulation requirement rather than a shortcut — §5 makes the case.

Target: `generateScramble('minx')`, shipped since v0.7.

---

## 1. Overview

### WCA event

**`minx` — Megaminx.** Regulation **4b3** with exception **4b3e**:

> 5x5x5 Cube, 6x6x6 Cube, 7x7x7 Cube, and Megaminx: sufficiently many random
> moves (instead of random state), at least 2 moves to solve.

So random moves is the **official** method here. A random-state Megaminx scramble
would be the non-conforming one, and WCA's own scrambler does not produce one
either. `ScrambleResult.quality` reports `'random-moves'` rather than claiming
the stronger method.

### Goal of the implementation

Produce the official fixed-shape 77-move scramble with uniformly random
directions, and model the puzzle accurately enough that the scramble can be
verified — applied, inverted, and checked against the dodecahedron's real
structure. Building a random-state solver would be a large undertaking that
produces something *other than* an official scramble.

The interesting engineering is therefore not in a search but in the **geometry**:
this is the one puzzle in the package that cannot live on an integer lattice, and
the one whose notation holds a face still and turns everything else.

### References used

- WCA Regulations 4b3, 4b3e; the WCA scramble format for the seven-line layout.
- **Pochmann notation** as the WCA specifies it — six tokens, two of which name a
  face to *hold*.
- Standard dodecahedron coordinates (`(±1,±1,±1)` plus the cyclic permutations of
  `(0, ±1/φ, ±φ)`), and the fact that the rotation group of the dodecahedron has
  order 60 — used as a cross-check on the derived move tables.
- No third-party code was read.

### Files

| | |
|---|---|
| `notation.ts` | the six Pochmann tokens as their own move type |
| `geometry.ts` | the dodecahedron, built from coordinates, and the move tables |
| `state.ts` | piece-level state, and the six tokens' tables |
| `solve.ts` | the 77-move template and its randomness — no solver |

---

## 2. Notation

### Supported notation

WCA **Pochmann notation**, which is unlike every other notation in this package
in one important way: **two of its three moves hold a face still and turn
everything else.**

| Token | Meaning |
|---|---|
| `U` / `U'` | turn only the top layer, one fifth (72°) — exactly as a cube `U` turns one layer |
| `R++` / `R--` | hold the **L** face, turn the rest of the puzzle two fifths (144°) |
| `D++` / `D--` | hold the **U** face, turn the rest of the puzzle two fifths |

That is the whole move set: six tokens. It exists because a Megaminx has twelve
faces and no convenient short names for them, and because two-fifth turns of the
bulk are fast to execute — a scrambler's convenience, not a solver's.

`src/notation/move.ts` does not apply: a cube face turn has order 4 and names one
of six faces to *turn*; these have order 5, name a face to *hold*, and `++`/`--`
are two fifths rather than one unit.

### Parsing rules

`parseMegaminxMove` handles `U` and `U'` as literals, then
`/^([RD])(\+\+|--)$/`. Anything else throws. There are exactly six valid tokens
and the test suite round-trips all six.

### Rendering rules

`megaminxMoveToString` prints `U` with a prime and `R`/`D` with `++`/`--`;
`megaminxMovesToString` joins with single spaces.

The scramble's line structure — seven lines of ten alternating `R`/`D` moves plus
a closing `U` — is present in the token *sequence*, not in the whitespace: the
rendered string is one space-separated line. A caller wanting the seven-line
printed layout would break at every eleventh token.

### Examples

The first line of a real generated scramble from the shipped build:

```
R-- D-- R++ D-- R-- D++ R++ D++ R++ D-- U'
```

Ten alternating `R`/`D` tokens, then a `U`. Seven such groups, **always exactly
77 tokens**.

---

## 3. State model

### Internal representation

```ts
interface MegaminxState {
  cornerPermutation: readonly number[]; // 20 entries
  cornerOrientation: readonly number[]; // 20 entries, 0..2
  edgePermutation:   readonly number[]; // 30 entries
  edgeOrientation:   readonly number[]; // 30 entries, 0..1
  centerPermutation: readonly number[]; // 12 entries
}
```

**Centres are modelled, and that is not decoration.** Two of the three Pochmann
moves hold one face and turn *everything else*, so they carry the other eleven
centres with them: a Megaminx scramble genuinely leaves the puzzle in a rotated
orientation, and a model without centres could not represent that. It is also
what makes `isSolvedMegaminx` mean solved rather than "solved up to a rotation".

A centre has no orientation — it is one pentagon of one colour.

### Coordinate system

The dodecahedron is **built, not listed**:

- **12 face centres** at the signed cyclic permutations of `(0, φ, 1)`.
- **20 corners** at `(±1,±1,±1)` together with the signed cyclic permutations of
  `(0, 1/φ, φ)`.
- **30 edges** at the midpoints of the corner pairs exactly one edge length
  (`2/φ`) apart.

Each family is generated from a pattern and sorted by a rounded position key, so
the indexing is reproducible across runs without any position being typed out.

Which cyclic family the face centres use is **not** a free choice, and picking
the wrong one is the obvious way to get this silently wrong: with `(0, 1, φ)` the
five vertices nearest a "face centre" are not coplanar and the object is not a
dodecahedron's face at all. `geometry.test.ts` checks the defining property
directly — every face has exactly five corners and five edges, all at one
distance from it.

### Floating point, and why it is sound

This is the one puzzle here that **cannot** live on an integer lattice. `φ` and
`sin 72°` are irrational, and 72° rotations of the dodecahedron are not
expressible over the integers the way the cube-family 90° and tetrahedral 120°
rotations are (see `utils/vec3.ts`). So positions are floats and lookup is
nearest-match within a tolerance of `1e-6`.

That is sound because the structure being recovered is **discrete and well
separated**: the closest two distinct positions of the same kind are about 1.05
apart, while a rotation introduces error on the order of `1e-15`. The tolerance
sits nine orders of magnitude clear of the signal and six orders clear of the
noise — and `geometry.test.ts` *measures* both margins rather than trusting them.

`indexOfPosition` additionally throws if the nearest position is further than the
tolerance, so a genuine geometry error surfaces as an exception rather than as a
silently wrong destination.

### Orientation references

- **Corner orientation** is defined by a cycle *derived from a rotation*: index 0
  is the lowest-keyed of the corner's three faces, and 1 and 2 follow it under a
  third of a turn about the corner's own axis (a symmetry of the solid, so it
  permutes those three faces cyclically). Deriving the cycle rather than writing
  an order per corner is what makes it automatically consistent with each
  corner's chirality — the same reasoning as the Skewb.
- **Edge orientation** references the lowest-keyed of the edge's two faces. Which
  one is arbitrary; any consistent choice only relabels the two values.

### Invariants

Conclusions, asserted over random sequences from solved:

1. **Total corner twist `≡ 0 (mod 3)`** — one corner can never be twisted alone.
2. **Total edge flip is even** — one edge can never be flipped alone.
3. **Corner and edge permutations are each always even.**
4. **Centre permutation is always even**, and is always one of the **60**
   rotations of the dodecahedron. This last one is the sharpest check on the
   geometry in the module: it is a property of the solid, not of the code, and a
   mis-derived bulk turn would fail it immediately.

### Solved state

Identity permutations (corners, edges **and** centres), zero orientations.

---

## 4. Move model

### Primitive moves

Six tables, each built by `deriveMoveTableMinx(axis, fifths, moving)`:

| Token | Axis | Fifths | Moving |
|---|---|---|---|
| `U` | U face | −1 | pieces **on** the layer |
| `U'` | U face | +1 | on-layer |
| `D++` / `D--` | U face | +2 / −2 | pieces **off** the layer |
| `R++` / `R--` | L face | +2 / −2 | off-layer |

The `on-layer` / `off-layer` flag is the **only** structural difference between
turning a layer and holding one, so it is a parameter rather than two code
paths. Which pieces are "on" a face is decided by a projection test against the
maximum projection for that piece kind — a comparison against a computed
extremum, not a hand-set threshold.

Signs follow the package-wide convention that a *negative* right-hand-rule amount
is clockwise seen from outside the axis. `U` is clockwise seen from outside U, so
it is negative about U; `D++` and `R++` are clockwise seen from the *opposite*
side of their held face, so they are positive about it.

That reading is worth being honest about: if it were mirrored, every `++` here
would be a `--`. It could not change a single generated scramble, because the
tokens' directions are drawn uniformly and independently — swapping the two
spellings maps the distribution exactly onto itself. So unlike the Pyraminx and
Skewb, where a mirrored labelling would produce the mirror image of every
scramble and had to be pinned against the real puzzle, here it is genuinely a
free convention.

### Which faces are U and L

Pochmann notation needs exactly two named faces: `U` (turned by `U`, held by `D`)
and `L` (held by `R`). `L` must be a **neighbour** of `U`, and that is the only
constraint — every adjacent face pair of a dodecahedron is carried to every other
by a rotation of the solid, so all choices give the same puzzle up to
relabelling. `U_FACE` is the lowest-keyed face and `L_FACE` its lowest-keyed
neighbour, with "neighbour" defined as *some edge piece lies on both*.

### Composition

`applyMegaminxMoves` folds left to right. The two directions of each token are
inverses; every move has order 5.

### Move legality

Every move is legal in every state. There is no search, so there is no
consecutive-move pruning either — and none is needed, since the template
alternates `R` and `D` by construction and never repeats a token kind
consecutively except across the `U` at a line boundary.

### Inverses

`inverseMegaminxMove` maps direction `d → 3 − d`, keeping the kind.
`inverseMegaminxMoves` reverses and inverts. Because there is no solver, this
inversion **is** the end-to-end verification: a scramble applied and then
inverted must return to exactly solved.

---

## 5. Scramble generation algorithm

### High-level algorithm

```
for each of 7 lines:
  10 moves alternating R, D, R, D, …   — each direction an independent coin flip
  1 move U or U'                       — direction likewise
```

77 tokens. **The token sequence is fixed; the randomness is exactly the 77
directions.**

### Why the template has this shape

The structure is the notation's whole point. `R` holds the L face and `D` holds
the U face, so alternating them churns the puzzle without the scrambler ever
having to name or find any of the twelve faces; the `U` at the end of each line
turns the top layer so the next line's `R`/`D` pair bites somewhere new. It is a
scrambling procedure designed for a human with the puzzle in their hands, and the
implementation reproduces it rather than inventing its own.

### Random-state vs random-move

**Random moves**, per 4b3e, which names the Megaminx explicitly alongside the
three big cubes. This is not a simplification of the official method — it *is*
the official method. §1 covers the reasoning; `quality: 'random-moves'` reports
it to the caller.

### Uniformity argument

There is no state distribution to argue about, because the regulation does not
ask for one. What is claimed is narrower and exactly true: **the 77 directions
are independent uniform bits**, drawn through `randomInt(random, 2)`, which uses
rejection sampling to avoid modulo bias. `solve.test.ts` checks that each of the
77 positions takes both directions across a sample, roughly evenly.

"Sufficiently many random moves" is the phrase 4b3e uses without naming a number.
77 is the conventional length WCA's own scrambler uses, and the property that
makes it *sufficient* is tested directly rather than assumed: essentially every
piece ends up displaced.

### The 4b3e two-move floor — not enforced

4b3e's clause is *"sufficiently many random moves (instead of random state), **at
least 2 moves to solve**"*. The move-count floor survives the exception.

For `555`, `666`, `777` and the blindfolded events, `puzzles/nxn/minimum.ts`
enforces it by applying the rendered scramble to a solved cube and regenerating
if it lands within one move of solved. **The Megaminx has no equivalent.**
`generateMegaminxScramble` returns its 77 tokens unchecked. See §8.

### WCA compliance

| Requirement | Status |
|---|---|
| 4b3e random moves, sufficiently many | ✅ 77 moves, displacement verified |
| 4b3e at least 2 moves to solve | ❌ **not enforced** — see §8 |
| Official token template | ✅ asserted token-for-token in `solve.test.ts` |
| `quality` reports the method actually used | ✅ `'random-moves'` |

---

## 6. Validation

### Existing tests

Four test files, `src/puzzles/megaminx/*.test.ts`. Because there is no solver,
the geometry carries the whole verification burden — and it is tested harder than
any other module here.

| Test | What it rules out |
|---|---|
| 12 faces, 20 corners, 30 edges; Euler's formula holds | a wrong coordinate family |
| all corners equidistant from the centre, and so all faces, and all edges | a non-regular solid |
| **every face has exactly five corners and five edges, all at one distance** | the `(0,1,φ)` trap that produces non-coplanar "faces" |
| every corner on 3 faces, every edge on 2, every face with 5 neighbours | a wrong incidence structure |
| **the closest two distinct positions of a kind are ≥ 1 apart, against a 1e-6 tolerance** | the float model being unsound |
| **a full turn returns every position to within 1e-12** | accumulated rotation error |
| `rotateFifths` has order 5, fixes its axis, permutes each kind among itself | a wrong rotation |
| a third of a turn about a corner is a symmetry | the corner orientation cycle's premise |
| `U` and `L` are adjacent | the only constraint Pochmann notation imposes |
| an on-layer turn moves 5 corners, 5 edges and 1 centre, and nothing else | a wrong layer test |
| an off-layer turn moves everything the held layer does not contain | a wrong hold |
| every move has order 5; the two directions are inverses | a wrong table |
| all six group invariants (twist, flip, three parities) | a plausible-but-wrong model |
| **the centre permutation is always one of the 60 dodecahedral rotations** | the sharpest single check on the bulk turns |
| `R` and `D` each move ten of the twelve centres | the puzzle really does reorient |
| two-move element orders are exactly `{5, 552, 840, 1560, 5130}` | a move table outside the group |
| every scramble parses, scrambles, and **inverts back to exactly solved** | the end-to-end chain, in place of a solver |
| 77 moves displaces essentially every piece | "sufficiently many" |
| the template is asserted token-for-token | a drifted scramble shape |

### Independent verification

- **Euler's formula and the 60 rotations** are facts about the dodecahedron, not
  about this code. Reproducing them from generated coordinates and derived move
  tables is the strongest available substitute for the state-count checks the
  solver-bearing puzzles get.
- **The float tolerance is measured, not assumed** — separation ≥ 1 against a
  `1e-6` tolerance against `~1e-15` rotation error, all three read off at test
  time.
- **Scramble-then-invert** replaces scramble-then-solve. It exercises generation,
  rendering, parsing and the derived move tables in one pass, and would catch any
  non-invertible table.

### Edge cases

- **Every scramble is the same length and shape.** There is no branch to get
  wrong: no rejection, no padding, no variable-length tail.
- **A position off the lattice** throws from `indexOfPosition` with the measured
  distance in the message, rather than snapping to a wrong piece.
- **A corner touching other than 3 faces, or an edge other than 2**, throws
  during table construction.
- **A state within one move of solved** is *not* handled — see §8.

---

## 7. Complexity

### Time complexity

| Step | Cost |
|---|---|
| Coordinate families | generated once at module load — a few hundred vectors |
| Edge midpoints | `C(20,2) = 190` distance tests |
| Six move tables | `6 × (20 + 30 + 12)` rotations, each a nearest-position scan over ≤ 30 candidates |
| Scramble | 77 `randomInt` calls and a string join |

`indexOfPosition` is a **linear scan** over the position list rather than a
spatial index. At 30 candidates that is entirely reasonable, and it runs only at
table-construction time — never per scramble.

### Memory usage

| | |
|---|---|
| Position families (12 + 20 + 30 float triples) | ≈ **2 KB** |
| Six move tables | ≈ **20 KB** |
| Total | **well under 100 KB** |

No pruning table, no state-space BFS, nothing to memoise beyond the tables. The
second-smallest footprint in the package after the Clock.

### Expected scramble generation time

Measured on the development machine (Windows 11, Node 22.14):

| | |
|---|---|
| Cold — first `generateScramble('minx')` in a fresh process | **3.9 ms** |
| Steady state, public async API | **0.181 ms** mean, 0.262 ms p90 |

Essentially no cold start. Note where the geometry cost actually lands: the
position families and the six move tables are **module-level constants**, and the
package's barrel re-exports `state.ts`, so they are built when
`@cubesmith/scrambler` is *imported* rather than when a scramble is first
requested. The 3.9 ms above therefore excludes them; they are paid once at import
regardless of which event a caller uses. Generation itself never applies a move —
it only draws 77 directions and joins strings.

---

## 8. Known limitations

### Fixed since this document was written

**The 4b3e two-move floor is now enforced.** `megaminxScrambleIsFarEnough`
(`puzzles/megaminx/solve.ts`) applies the drawn moves to a solved puzzle and
tests `isAtLeastTwoMovesFromSolved(state, allMovesMegaminx(),
applyMegaminxMove, isSolvedMegaminx)` — the generic helper from
`core/scramble-shape.ts`, with the puzzle's own six tokens as the one-move
neighbourhood rather than a cube's eighteen. `generateMegaminxScramble` redraws
until the check passes, capped at 100 attempts, in the same shape as
`nxn/minimum.ts`'s `withMinimumDistance`.

Seeded output does not change: the first draw clears the floor with probability
indistinguishable from 1, so the redraw loop consumes the random stream
identically. `solve.test.ts` asserts that directly rather than assuming it.

**This is *not* stricter than the official program**, contrary to what the plan
that scheduled the work first believed. `MegaminxPuzzle.generateRandomMoves`
has no check of its own — which is what a first reading finds — but it is not
the entry point. `Puzzle.generateWcaScramble` is, it is `final`, and it redraws
while `psag.state.solveIn(wcaMinScrambleDistance - 1) != null` with
`wcaMinScrambleDistance = 2`. `MegaminxPuzzle` does not override `solveIn`. So
TNoodle enforces exactly this floor on Megaminx, generically, and the package
is matching it rather than exceeding it.

### The one part of that fix that is not complete

**The floor is measured against the identity state, not against "solved as a
competitor means it".**

`isSolvedMegaminx` requires the centre permutation to be the identity. But `R`
and `D` in Pochmann notation are whole-puzzle rotations composed with a single
face turn — which is why §3 can say the centres only ever move as a rigid body
— so a scramble genuinely reorients the puzzle, and a *rotated* solved Megaminx
would be reported as unsolved while a competitor would call it solved and
stop the clock.

This is the same trap `docs/blindfolded-review.md` §4.3 identifies for the
cubes, where it was closed by adding `isUniformlyColouredNxN` alongside
`isSolvedNxN`. An earlier draft of this section argued the strict predicate was
"arguably the right one" for the Megaminx because a reoriented Megaminx is not
solved "in the same trivial way a rotated cube is". That argument does not
hold: a rotated solved Megaminx is exactly as solved as a rotated solved cube.

The real reason the strict predicate is in place is narrower and worth stating
plainly: **the piece model cannot currently express the other one.** There is
no facelet model here, and deciding "is this state a pure rotation of solved"
needs the rotation induced on corners and edges by the centre permutation —
derivable from `geometry.ts` (`facesAtCorner`, `cornerFaceCycle`,
`FACE_CENTERS`, `rotateFifths` are all present) but a piece of work in its own
right, not a line in a floor check.

- **What is closed:** every state that is solved, or one move from solved, in
  the puzzle's fixed frame.
- **What remains open:** the 59 non-identity rotations of solved, and their
  one-move neighbourhoods. A 77-token draw landing on one of those is on the
  order of `10^-66` — far below even the `4 × 10^-19` figure the cube case
  calls unobservable.
- **Fix:** derive the corner/edge permutation induced by a centre-permutation
  rotation and add an orientation-agnostic `isSolvedUpToRotationMegaminx`, then
  pass that to `isAtLeastTwoMovesFromSolved` instead. Deferred deliberately;
  it is a new capability rather than a correction to this one.

### Rough edges, stated plainly

1. **No solver, and therefore no distance function.** By design (4b3e), but it
   does mean this is the one implemented event where nothing can be said about
   how far the scramble is from solved beyond "essentially every piece moved".
2. **No benchmark.** Every other implemented puzzle has a `solve.bench.ts`;
   `puzzles/megaminx/` does not, so `npm run bench` reports nothing for `minx`.
   The timings in §7 were measured for this document rather than tracked by the
   repository.
3. **The seven-line layout is not in the output.** Official scramble sheets print
   a Megaminx scramble as seven lines; this returns one space-separated string.
   The structure is in the token sequence, so a caller can break it at every
   eleventh token, but nothing in the API says so.
4. **`indexOfPosition` is a linear scan.** Fine at 30 candidates and
   construction-time only, but it is `O(n)` where a keyed lookup would be `O(1)`.

### Planned improvements

- Add an orientation-agnostic solvedness predicate and measure the 4b3e floor
  against it (above).
- Add `solve.bench.ts` so `minx` is tracked alongside every other event.

---

## 9. References

### WCA regulations

- [WCA Regulations](https://www.worldcubeassociation.org/regulations/) — 4b3, and
  **4b3e**: *"5x5x5 Cube, 6x6x6 Cube, 7x7x7 Cube, and Megaminx: sufficiently many
  random moves (instead of random state), at least 2 moves to solve."*

### Notation

- **Pochmann notation**, as used by the WCA scramble program — six tokens, `R`
  holding the L face and `D` holding the U face, both at two fifths.

### Published figures used as cross-checks

- Standard dodecahedron coordinates: `(±1,±1,±1)` and the cyclic permutations of
  `(0, ±1/φ, ±φ)` for vertices, `(0, ±φ, ±1)` for face centres.
- The **rotation group of the dodecahedron has order 60** — reproduced here as
  the set of centre permutations a scramble can produce.
- Euler's formula `V − E + F = 2`, checked against the generated solid.
- [Megaminx (Wikipedia)](https://en.wikipedia.org/wiki/Megaminx) — piece
  inventory (12 centres, 20 corners, 30 edges) and the state count, which this
  implementation does not need but which the piece counts feed.
- [Jaap Scherphuis — Megaminx](https://www.jaapsch.net/puzzles/megaminx.htm) —
  mechanism and structure.

### Related documents in this repository

- `docs/nxn-design.md` — the other three 4b3e events, and the two-move floor
  machinery this puzzle is missing.
- `docs/blindfolded-review.md` — §4.1, the review that added that floor.
- `docs/clock-design.md` — the other solver-less puzzle here, for an unrelated
  reason.
