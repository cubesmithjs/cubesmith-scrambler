# Pyraminx — design document

Written *after* the implementation, to record what `src/puzzles/pyraminx/`
actually does. Every count below is computed by the code and cross-checked
against a figure published independently of it.

Target: `generateScramble('pyram')`, shipped since v0.4. Public notation
validation (`validateScramble('pyram', …)`) shipped since v0.12 — §2 and §6.

---

## 1. Overview

### WCA event

**`pyram` — Pyraminx.** Regulation **4b3** with exception **4b3f**:

> 4b3f — Pyraminx: at least **6** moves.

Random state, uniform over the states that qualify, with a six-move floor.

### Goal of the implementation

The first non-cube puzzle in the package, and the one that establishes the
pattern the Skewb then follows: derive the turn tables from real 3D rotations on
an **exact integer lattice**, encode the *whole* coordinate space including
values the puzzle cannot reach, and let a breadth-first search discover which of
them are real. The constraints are then *proved* by the BFS rather than assumed
— and the numbers it lands on (933,120 states, God's number 11) are published
figures the model has to reproduce.

Tips are modelled but not searched: nothing on the puzzle can observe a tip, so
folding them into the search would multiply its state space by 81 for no
information.

### References used

- WCA Regulations 4b3, 4b3f; the WCA scramble format for the uppercase /
  lowercase convention.
- Jaap Scherphuis' Pyraminx page and the Speedsolving wiki — the notation, the
  group order `933,120` (tips excluded) and God's number 11, all used as
  cross-checks rather than inputs.
- thewca/tnoodle#69 — a real reported move-order bias this implementation avoids.
- No third-party code was read.

### Files

| | |
|---|---|
| `notation.ts` | the puzzle's own move type — `FaceMove` does not apply |
| `geometry.ts` | the tetrahedron on a cube lattice, and the turn tables |
| `state.ts` | piece-level state, and the 8 composed turn tables |
| `coordinates.ts` | three integer coordinates, all values encodable |
| `tables.ts` | per-move coordinate transitions |
| `pruning.ts` | one exact distance table over the whole encodable space |
| `search.ts` | IDA\*, and the fixed-length variant |
| `random-state.ts` | the uniform, constraint-correct draw |
| `solve.ts` | tips, the 4b3f filter, padding, registration |

---

## 2. Notation

### Supported notation

Four vertices — `U` (up), `L` (front-left), `R` (front-right), `B` (back) — in
two cases:

| Token | Meaning |
|---|---|
| `U` | **two-layer** turn about the U vertex: tip, axial piece and the three edges touching it, 120° clockwise seen from outside that vertex |
| `U'` | the same, counterclockwise |
| `u` | **single-layer** turn of just that tip |
| `u'` | the same, counterclockwise |

Sixteen tokens in all. `src/notation/move.ts` is deliberately **not** reused: a
cube face turn has order 4 and its `2` means a half turn, while a Pyraminx turn
has order 3, so `2` would have to mean *counterclockwise*. Sharing the `Amount`
type would admit a meaningless `U2` at the type level and render every
counterclockwise turn wrong.

### Parsing rules

`parsePyraminxMove` accepts `/^([ULRBulrb])(')?$/`. Case decides `tip`: a
lowercase letter is the tip-only turn. A prime is amount 2, i.e.
counterclockwise; there is no other suffix, and `U2` is rejected.

### Rendering rules

`pyraminxMoveToString` lowercases the letter for a tip turn and appends `'` for
amount 2. `pyraminxMovesToString` joins with single spaces.

Scramble layout follows WCA practice: **all layer turns first, then the tip
turns**, emitted in `U, L, R, B` order and only for tips that actually need
moving. A tip turn commutes with every other move on the puzzle, so where they
sit in the sequence is free — putting them last is a presentation convention
that this implementation produces directly rather than by reordering afterwards.

### Examples

A real generated scramble from the shipped build:

```
L U R' U R' U L B' R L' B' l r b
```

Eleven layer turns — always exactly eleven — followed by zero to four tip turns.
Measured over 300 scrambles: 11 to 15 tokens, mean 13.6.

### Reason codes

`parsePyraminxScramble(text)`, added in v0.12, walks
`notation/tokenize-words.ts` and calls `parsePyraminxMove` per token, turning a
rejection into a `ScrambleSyntaxError` carrying an `offset`, a `length` and a
stable code. **No new grammar was needed**: `parsePyraminxMove`'s
`/^([ULRBulrb])(')?$/` already reads the lowercase tip branch, so the tail of
tip moves an official scramble ends with parses like anything else.

| Code | Example | Carries |
|---|---|---|
| `pyraminx-not-a-vertex` | `Z`, `f` | `token`, `char` |
| `pyraminx-bad-amount` | `U2`, `U''`, `u2'` | `token` |

The split is where the regex splits: which letter, versus what followed it.
`U2` is the interesting arm — a Pyraminx turn has **order 3**, so `2` is not a
half turn and there is no spelling for one; the counterclockwise turn is `'`.
The letter set comes from `PYRAMINX_VERTICES`, uppercased for the comparison,
so all four tips stay legal and a lowercase letter that is not a vertex does
not sneak through.

🔴 No message strings ship for these codes, in any language.

---

## 3. State model

### Internal representation

```ts
interface PyraminxState {
  edgePermutation:  readonly number[]; // 6 entries
  edgeOrientation:  readonly number[]; // 6 entries, 0..1
  axialOrientation: readonly number[]; // 4 entries, 0..2
  tipOrientation:   readonly number[]; // 4 entries, 0..2
}
```

Four kinds of piece, only two combinatorially interesting:

- **edges (6)** — permuted and flipped; the only pieces that move.
- **axial pieces (4)** — the pieces directly under each tip. Their *position* is
  fixed by the mechanism, so all that varies is a twist in `Z3`. They are what
  give a Pyraminx an absolute reference frame, and therefore why all four
  vertices are meaningful moves here — contrast the 2x2x2, where the absence of
  a frame is exactly what makes three faces sufficient.
- **tips (4)** — twist in `Z3`, and nothing else on the puzzle can observe them.

Tips are modelled anyway, so the end-to-end round trip covers a *complete*
physical state and so the fact that an uppercase turn carries its tip along is
represented rather than assumed.

### Coordinate system

The geometric model is the document's central trick. A regular tetrahedron's
four vertices are **exactly four alternate corners of a cube**, so the puzzle
lives on integer coordinates:

```
U = ( 1,  1,  1)     L = (-1,  1, -1)
R = (-1, -1,  1)     B = ( 1, -1, -1)
```

In this embedding the six edge midpoints land precisely on the six cube face
centres `(±1,0,0), (0,±1,0), (0,0,±1)`, and the four face centroids on the four
*other* cube corners. Every position the module needs is an exact small integer
vector, so destination lookup is plain equality — **no floating-point tolerance
appears anywhere**. (Compare the Megaminx, where `φ` makes that impossible.)

A vertex turn is a ±120° rotation about the axis through that vertex and the
centroid. Substituting `cos 120° = −1/2`, `sin 120° = ±√3/2` and `n = A/√3` into
Rodrigues' formula collapses every irrational factor:

```
v' = ( −v + A(A·v) ± (A × v) ) / 2
```

`utils/vec3.ts`'s `rotate120` implements exactly that and throws if a result
leaves the integer lattice — a cheap guard that would fire immediately on a
non-diagonal axis.

The search uses three integer coordinates:

| Coordinate | Size | Encoding |
|---|---|---|
| `edgePerm` | `6! = 720` | rank against an exhaustively generated permutation list |
| `edgeOrientation` | `2^6 = 64` | base 2 over all six slots |
| `axial` | `3^4 = 81` | base 3 over all four vertices |

Flattened as `(edgePerm · 64 + orientation) · 81 + axial`, giving **3,732,480**
encodable values.

**Every value is encodable, including illegal ones.** That is the deliberate
part: encoding only the legal half of each coordinate would bake the constraints
into the representation and make them unfalsifiable. Leaving them encodable lets
the BFS *measure* them.

### Invariants

Two, and both are conclusions rather than premises:

1. **Edge permutation is even.** Every layer turn 3-cycles three edges, and a
   3-cycle is even.
2. **Total edge flip is even.** Each turn flips exactly two of the three edges
   it moves.

The pruning BFS reaches exactly

```
360 × 32 × 81 = 933,120     of     720 × 64 × 81 = 3,732,480
```

— exactly a quarter of the encodable space, being half the permutations times
half the flip vectors — and `933,120` is the published Pyraminx group order with
tips excluded. Neither constraint is written anywhere in the coordinate code.

What is *not* constrained is worth stating too: **a single twisted axial piece
is reachable**, unlike a single twisted cube corner. The axial twists are free
and independent, which the test suite asserts directly.

### Solved state

Identity edge permutation, all orientations zero — including tips.
`isSolvedPyraminx` requires all four arrays clean, so "solved" means the whole
physical puzzle, tips included.

---

## 4. Move model

### Primitive moves

Eight searchable layer turns (`4 vertices × 2 amounts`) plus eight tip turns
that the search never sees.

`deriveTurnTable` builds the clockwise two-layer turn about a vertex:

- only the three edges touching that vertex are on its layer; everything else is
  a fixed point;
- each moved edge's destination is `rotate120(axis, position, -1)`;
- its flip is decided by carrying the slot's *reference normal* through the same
  rotation and asking whether it lands on the destination slot's reference
  normal.

Which of an edge slot's two faces is the "reference" is arbitrary — any
consistent choice yields a faithful model, since it only relabels the two
orientation values — so it is resolved by a fixed total order on the normals
rather than by an appeal to sticker colours the model does not have.

The axial twist is definitional rather than derived: an axial piece never moves,
so its "orientation" is just a net-clockwise-turn counter, and a turn adds 1 to
its own vertex. There is nothing there to get geometrically backwards.

### The chirality pin

Any self-consistent vertex labelling produces *a* Pyraminx; a mirrored one
produces the mirror image of every scramble, silently. WCA orients the puzzle
with one vertex up and the other three around the base, so looking down at `U`
from outside, they read clockwise as **B → R → L**. `VERTEX_POSITIONS` is the
assignment that reproduces exactly that cycle under the clockwise rotation, and
`geometry.test.ts` asserts the cycle directly rather than trusting the comment.

### Composition

`composeSelf` builds the counterclockwise turn by applying the clockwise one
twice — the turn has order 3, so that is the whole story. `tables.ts` then
builds per-coordinate transitions by decoding a coordinate, pushing it through
the already-tested `applyPyraminxMove`, and re-encoding. All three coordinates
are independently closed under the move set: permutation obviously, orientation
because it is stored per-*slot*, and the axial twists because they are pure
counters.

### Move legality

Every move is legal in every state. The search skips a move on the same vertex
as the previous one, since two consecutive turns of one vertex always collapse
into one — an optimisation, and the source of the printed scramble's "never
repeats a vertex consecutively" property.

### Inverses

`inversePyraminxMove` maps amount `a → 3 − a`, preserving vertex and tip-ness.
With only two amounts on an order-3 turn that is the entire definition. Every
turn has order 3, asserted per move; a sequence followed by its inverse returns
to solved.

---

## 5. Scramble generation algorithm

### High-level algorithm

```
1. draw a uniformly random reachable state  (edges, axials, tips)
2. if its exact layer distance is < 6, discard and draw again        (4b3f)
3. shuffle the move try-order
4. solve the layers in exactly max(distance, 11) turns
5. invert that solution
6. apply it to a solved puzzle and append the tip turns that reach the
   drawn state's tip values
```

Steps 2 and 4 are `core/scramble-shape.ts`, shared with the 2x2x2, Skewb, Clock
and Square-1.

Step 6 is the part worth reading twice. Tips are reconciled by *applying the
scramble and comparing* rather than by inverting the solution's own tip moves —
so they land where WCA scrambles put them without relying on a commutation
argument to reorder anything after the fact.

### Random-state vs random-move

**Random-state.** 4b3e does not name the Pyraminx.

### Uniformity argument

`randomPyraminxState` draws:

- an edge permutation uniformly by Fisher–Yates, corrected with a single swap
  when it comes out odd. That swap is a bijection from the odd half onto the
  even half, so the result is uniform *over the even permutations* rather than
  merely landing in them.
- five edge flips freely, the sixth forced to make the total even — a bijection
  from `2^5` onto the 32 legal vectors.
- four axial twists and four tip twists, each uniform on `{0,1,2}` and
  unconstrained.

`933,120 = 360 × 32 × 81` states, drawn uniformly. The 4b3f rejection then
conditions that distribution, and the conditional distribution of a uniform draw
is uniform on the condition. Padding to eleven turns changes the route, never
the destination.

The move-order shuffle is the same cosmetic fix as elsewhere in the package,
and here it is not hypothetical: with a perfect heuristic the search never
backtracks at the root, and a fixed order produced exactly the artefact reported
as thewca/tnoodle#69, *"Pyraminx scrambles all start with U L"*.

### WCA compliance

| Requirement | Where |
|---|---|
| 4b3 random state, equal probability | `random-state.ts` + BFS-verified reachable set |
| 4b3f at least 6 moves | `drawStateAtLeastMovesFromSolved(…, 6)`, exact distance |
| Sequence long enough not to leak difficulty | `solveAtLeastLength(…, 11, …)` |
| Tips last, in canonical order | `tipMoves`, asserted in `solve.test.ts` |

Note the tension the constants encode: 4b3f's ≥ 6 is about the **state**, the 11
is about the **sequence**, and 11 is also this puzzle's God's number. So a padded
scramble is frequently a deliberately non-optimal route to a state only eight or
nine turns from solved. That is the point — the printed length must carry no
information about the state's difficulty.

---

## 6. Validation

### Existing tests

Seven test files, `src/puzzles/pyraminx/*.test.ts`.

| Test | What it rules out |
|---|---|
| the four vertices are distinct alternate cube corners, all six pair distances equal | a non-regular embedding |
| the six edge midpoints land exactly on the six cube face centres | a wrong lattice |
| `rotate120` has order 3, fixes its axis, and the two signs are inverses | a wrong rotation |
| **a clockwise `U` cycles B → R → L** | the mirror-image labelling |
| a turn moves exactly the three edges touching its vertex | a wrong layer test |
| a turn flips exactly two of its three moved edges | the flip rule that forces order 3 |
| a turn twists only its own axial, by exactly one | a leaked axial twist |
| every coordinate round-trips over all 720 / 64 / 81 values | an encode/decode mismatch |
| coordinate tables agree with full-state application, 2,000 states × 8 moves | a drifted transition table |
| **the BFS reaches exactly 933,120 states** | a wrong group order — i.e. a wrong model |
| **maximum distance is exactly 11** | the same, independently |
| an odd permutation and a single flipped edge are never reached; a single twisted axial **is** | the two constraints, and the absence of a third |
| every distance step is ±1 and a step down always exists | a corrupted BFS |
| solution length always equals the table distance | a non-optimal search |
| tip turns commute with everything | the assumption that lets them be emitted last |
| every one- to three-turn element's order divides 933,120 | a move table outside the group |
| scramble is exactly 11 layer turns; state ≥ 6 turns from solved | the two `scramble-shape` rules |

### Independent verification

Building the pruning table from scratch and reading off its histogram:

| distance | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| states | 1 | 8 | 48 | 288 | 1,728 | 9,896 | 51,808 | 220,111 | 480,467 | 166,276 | 2,457 | 32 |

Total **933,120**, maximum **11**. Both the total and the full per-depth
distribution match figures published independently of this code, and the
remaining 2,799,360 encodable values are never reached — which is the
constraints being measured rather than assumed. A sign error in the rotation or
a mis-derived flip rule would reproduce none of it.

### Edge cases

- **Already solved.** `solvePyraminxLayers` returns `[]`; the padding path still
  produces eleven turns for a scrambled state.
- **Unreachable state.** `pyraminxLayerSolveDistance` throws rather than
  returning the `UNVISITED` sentinel as if it were a distance — the one place
  where "255" could otherwise leak into arithmetic.
- **The 4b3f rejection genuinely fires.** 11,969 of the 933,120 states are
  within five turns of solved, so about **1.28% of draws** are discarded. Unlike
  most floors in this package this one is not vanishingly rare, which makes it
  properly exercised by the test suite.
- **Tips already correct.** `tipMoves` skips any tip whose twist already
  matches, so a scramble can legitimately end with fewer than four tip turns —
  or none.

### Public validation, since v0.12

`validateScramble('pyram', text)` dispatches on the event and returns
`{ valid: true, notation: 'pyraminx' }` or `{ valid: false, error }` without
throwing. Tests cover a generated scramble (tips asserted present, so a parser
that only handled the uppercase layer turns would fail), empty input, both
reason codes with offsets and spans, and a failure in the middle of a scramble
rather than only at the first token.

**What it does not check.** Only that the string is Pyraminx notation. Not
Regulation 4b3f's six-move floor, not that the tips are emitted last, and
nothing about the resulting state — those are §5's business and stay there.

---

## 7. Complexity

### Time complexity

| Step | Cost |
|---|---|
| Turn tables | 8 tables over 6 edges — negligible |
| Coordinate transition tables | `8 × (720 + 64 + 81)` full-state applications |
| Pruning BFS | `3,732,480 × 8 ≈ 30M` edge relaxations |
| Draw | `O(1)` |
| Distance check | `O(1)` — one table lookup |
| Search | IDA\* with an **exact** heuristic; the first iteration succeeds, and the work is entirely in the padding slack |

### Memory usage

| | |
|---|---|
| Pruning table | `Uint8Array(3,732,480)` = **3.73 MB** |
| Coordinate transition tables | `8 × (720 + 64 + 81)` entries ≈ **55 KB** |
| Permutation list (720 arrays of 6) + index map | ≈ **150 KB** |
| Total, steady state | **~4 MB**, built once per process |

Three quarters of the pruning table is unreachable states holding the `255`
sentinel. That waste is deliberate: it is the same array that *proves* those
states unreachable.

### Expected scramble generation time

Measured on the development machine (Windows 11, Node 22.14):

| | |
|---|---|
| Cold — first `generateScramble('pyram')` in a fresh process | **185 ms** |
| Steady state, `npm run bench` | **0.0179 ms** (≈ 56,000 scrambles/second) |
| Steady state, public async API | 0.105 ms mean, 0.140 ms p90 |

The cheapest cold start of any table-driven puzzle in the package, by an order of
magnitude — 3.7M BFS entries is simply not much work.

---

## 8. Known limitations

### Current bugs

None known. Every published figure the model could be checked against is
reproduced, and no test is skipped.

### Rough edges, stated plainly

1. **Three quarters of the pruning table is holes.** 2.8 MB of the 3.73 MB
   array holds `UNVISITED`. Densely re-indexing the reachable set — the approach
   `puzzles/skewb/` takes — would cut it to ~0.9 MB, at the cost of losing the
   in-place proof that the discarded values really are unreachable. The trade was
   made in favour of the proof; on the Skewb the same trade goes the other way,
   because there the closed-form product would be 227 MB.
2. **Tips are outside the padding rule.** The scramble is padded to eleven
   *layer* turns; tip turns are appended after and do not count. That is correct
   — a tip carries no difficulty — but it does mean the total token count varies
   between 11 and 15 and so weakly correlates with how many tips were off. No
   regulation speaks to this, and no solve difficulty follows from it.
3. **A ~185 ms cold start**, for the usual reason: tables are built lazily
   rather than shipped serialized.

### Planned improvements

- Ship the serialized pruning table.
- Nothing else outstanding. This module is the package's most thoroughly
  cross-checked puzzle relative to its size.

---

## 9. References

### WCA regulations

- [WCA Regulations](https://www.worldcubeassociation.org/regulations/) — 4b3
  (random state, equal probability), 4b3f (Pyraminx at least 6 moves), and the
  scramble format's uppercase/lowercase convention.
- [WCA incident 28](https://www.worldcubeassociation.org/incidents/28) — why the
  printed sequence is padded to a fixed length.

### Published figures used as cross-checks

- [Jaap Scherphuis — Pyraminx](https://www.jaapsch.net/puzzles/pyraminx.htm) —
  the group order `933,120` excluding tips, God's number 11, and the per-depth
  distance distribution reproduced in §6.
- [Pyraminx (Wikipedia)](https://en.wikipedia.org/wiki/Pyraminx) — the same
  counts, and the `933,120 × 3^4` figure including tips.

### Algorithms and mathematics

- Olinde Rodrigues' rotation formula — specialised to 120° about a cube body
  diagonal in `utils/vec3.ts`, which is what makes the model exact over the
  integers.
- Richard E. Korf, *Depth-First Iterative-Deepening: An Optimal Admissible Tree
  Search* (1985) — IDA\*; with an exact heuristic it becomes a single guided DFS.
- [thewca/tnoodle#69](https://github.com/thewca/tnoodle/issues/69) — *"Pyraminx
  scrambles all start with U L"*, the move-order bias the shuffled try-order
  exists to prevent.

### Related documents in this repository

- `docs/skewb-design.md` — the same 120° machinery applied to a corner-turning
  cube, with the opposite decision about coordinate density.
- `docs/square1-design.md` — the design-document standard this one follows.
