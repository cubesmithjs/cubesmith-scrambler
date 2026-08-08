# Square-1 — compatibility and design document

Written before any implementation, to make the modelling decisions explicit and
reviewable. Every claim here is either sourced or flagged as an open question
to be settled by computation rather than by assumption.

Target: `generateScramble('sq1')`, WCA-conforming, for v0.9.x. Public notation
validation (`validateScramble('sq1', …)`) shipped since v0.12 — §1 and §10.
(This document numbers its sections differently from the other four: notation is
§1 and validation strategy is §10.)

---

## 1. Official notation format

A Square-1 scramble is a sequence of **layer-turn pairs**, each followed by a
**slice**:

```
(x, y) /   (x, y) /   (x, y) /   …
```

- `x` — number of 30° **clockwise** turns of the **upper** layer. Negative is
  counterclockwise.
- `y` — the same for the **lower** layer.
- `/` — turn the **right half** of the puzzle 180°.

Each number is "a sum of 1s, representing edge pieces, and 2s, representing
corners" — i.e. it counts 30° units, and a corner is two of them.

### Move-count metric (decided)

The regulations do **not** define what a Square-1 "move" is, and the tools
disagree — [wca-regulations#364](https://github.com/thewca/wca-regulations/issues/364)
is exactly this question, open since 2016, whose opener notes *"I suppose right
now, TNoodle is the de-facto standard for this"*.

| Metric | `(x,y)` | `/` | God's number |
|---|---|---|---|
| Face-turn | 2 moves | 1 | 31 (Chen Shuang, 2017) |
| Twist | — | 1 | 13 (Masonjones, 2005) |
| **WCA axis-turn (TNoodle de facto)** | **1 move** | **1 move** | unknown, est. 25–27 |

**Decision: the WCA axis-turn metric.** `(x,y)` is one move, `/` is one move.
Compatibility with existing WCA/TNoodle scramblers is the priority, and this is
what competitors' scrambles are measured by in practice.

### Value range

Sources disagree slightly on the canonical range, because `x` and `y` live in
`Z12` and different generators pick different representatives:

- One states the numbers "are always between -5 and 6, and they must not both
  equal 0" — 12 values, exactly one per residue.
- A real example (below) contains `(-6, 0)`, and `-6 ≡ 6 (mod 12)`.

**Decision:** the parser is liberal — it accepts any integer and reduces mod 12
— while the renderer emits the canonical **`[-5, 6]`** representative, which
gives exactly one spelling per residue and no `6`/`-6` ambiguity. `(0,0)` is
rejected as a move, since it is a no-op that only exists as a spelling.

### Rendering (decided)

Match the attested official form, including the **trailing slash**:

```
(-2, 0) / (-3, -3) / (2, 5) / …  / (-6, 0) /
```

Space after the comma, spaces around each slash. The parser is deliberately
tolerant of spacing and of a missing trailing slash so that scrambles copied
from other tools round-trip.

### Reason codes (v0.12)

`parseSquare1Scramble` needed no wrapper and almost no work: it drives a
`g`-flagged `RegExp` in a loop, so **`match.index` was already in scope** at
both of its throw sites. Since v0.12 it throws a `ScrambleSyntaxError` carrying
that offset, a `length`, and a stable code.

| Code | Example | Carries |
|---|---|---|
| `square1-stray-character` | `(1, 0) x`, `(1 0)`, `(1, 0`, `(1, 0, 2)` | `char` |
| `square1-zero-turn` | `(0, 0)`, `(12, -12)` | `token` |

**Two codes, which is what the grammar actually distinguishes** rather than
what one might expect. A missing comma, a third number and an unbalanced
parenthesis all fail the pair alternative, so the `(` itself is what is left
over and gets reported as a stray — at the offset of the parenthesis, which is
where a reader needs to look. There is no "amount out of range" code because
there is no such condition: any integer is reduced mod 12 (§1's tolerance
above), which is what lets `(-6, 0)` from another generator parse.

`parseSquare1Amount`'s and `normalizeUnits`' own throws are unreachable from
this path — the text they receive is what `[+-]?\d+` already matched — so the
one reachable second throw is `layerTurn`'s refusal of `(0,0)`: a spelling
rather than a move, which would still cost a move under §1's metric.

The `\s*` tolerance inside a pair is load-bearing and now has its own test: the
official layout is `(6, 2) / (-2, 4)`, with a space after the comma, and that
is exactly what a consumer will paste.

🔴 No message strings ship for these codes, in any language.

---

## 2. Example official scrambles

Verbatim, from a Square-1 scramble tutorial:

```
(-2, 0) / (-3, -3) / (2, 5) / (0, 3) / (-3, 0) / (-5, -2) / (-4, 0) / (-3, 3) / (3, 0) / (1, 2) / (0, 2) / (-6, 0) /
```

Twelve pairs, each followed by a slash, trailing slash present.

Shorter illustrative tokens from a scramble generator's own documentation:
`1, 0 /` · `0, -2 /` · `-2, 3 /`.

These are format anchors for the validation step: the parser must accept them,
and the renderer's output must satisfy the same grammar.

---

## 3. State representation

**24 unit-slots plus one bit.**

```
topSlots:      12 piece ids   (slot 0..11)
bottomSlots:   12 piece ids   (slot 0..11)
middleFlipped: boolean
```

Piece ids: **corners 0–7**, **edges 8–15**. A corner occupies **two
consecutive slots** in one ring; an edge occupies one. That accounts for every
slot exactly: `8×2 + 8×1 = 24`.

Why this representation:

- A corner spanning two slots is what makes shape changes representable at all
  — the puzzle's defining feature is that corners and edges share one circular
  track, and "shape" is just *which slots are corner-halves*.
- Pieces move freely between the two layers, so there is no such thing as "a
  top corner". Storing pieces in slots rather than layers reflects that.
- The awkward part of Square-1 — slice legality — collapses to a one-line test
  (§5).

### Slot geometry

Slot `i` spans absolute angles `[30i + 15, 30i + 45)`, so its centre is at
`30i + 30`. This alignment is chosen so slot boundaries coincide with piece
boundaries of a solved cube: a solved layer has corners at slots
`(0,1) (3,4) (6,7) (9,10)` and edges at `2 5 8 11`.

### Solved state

Both layers in that alignment, `middleFlipped = false`:

| | slots 0,1 | 2 | 3,4 | 5 | 6,7 | 8 | 9,10 | 11 |
|---|---|---|---|---|---|---|---|---|
| top | C0 | E8 | C1 | E9 | C2 | E10 | C3 | E11 |
| bottom | C4 | E12 | C5 | E13 | C6 | E14 | C7 | E15 |

---

## 4. Move definitions

### `U(x)` / `D(y)` — layer turns

A cyclic shift of that ring's 12 slots by `x`. **Always legal**: the whole
layer rotates, and a corner's two slots stay adjacent under a cyclic shift, so
no piece can be sheared.

A layer turn *changes the shape* in the absolute sense: it moves which slots
hold corner-halves.

### `/` — the slice

Derived, not assumed. The slice rotates the half-space on one side of a
vertical cut plane by 180°. For that rotation to map the moving half to
itself, its axis must be perpendicular to the cut plane and horizontal, so the
map is `(x, y, z) → (x, −y, −z)`: the layer flips **and the angle reflects**,
`θ → −θ` about the axis.

With the cut boundaries at ±90° from the axis, and slot centres at `30i + 30`:

- **moving half** = slots `{9, 10, 11, 0, 1, 2}` (the 180° arc centred on the
  axis)
- **slot map** = `i → 11 − i`, an involution on exactly that set:
  `9↔2`, `10↔1`, `11↔0`

So `/` is:

```
newTop[11 − i]    = oldBottom[i]     for i in the moving half
newBottom[11 − i] = oldTop[i]
middleFlipped     = !middleFlipped
```

`/` has order 2, and the angular **reversal** is the part that makes Square-1
behave unlike anything else in this package: it is a reflection, not a
rotation, of the moving arc.

---

## 5. Legality rules

A slice is legal **iff no corner straddles a cut boundary**, on either ring.
The boundaries fall between slots `2|3` and `8|9`, so:

```
legal  ⟺  top[2]    ≠ top[3]    and top[8]    ≠ top[9]
      and  bottom[2] ≠ bottom[3] and bottom[8] ≠ bottom[9]
```

Because a corner is the *same piece id in two consecutive slots*, "a corner
straddles the cut" is literally "the same id appears on both sides of it". No
separate shape bookkeeping is needed.

This also guarantees the model stays consistent: a corner in the moving half at
slots `(a, a+1)` maps to `(11−a−1, 11−a)`, still adjacent — and the only cases
where it would be split are exactly the ones legality forbids.

**Regulation 4b3d, second clause** — *"The (random) state must allow a `/` move
to be applied without a prior (X, Y) move"* — is precisely this predicate
holding on the final state.

---

## 6. Shape model

"Shape" = which of the 24 slots hold corner-halves. Equivalently, the pair of
cyclic corner/edge patterns of the two rings.

Published counts, used as **cross-checks, not inputs**:

| Count | Meaning |
|---|---|
| **170** | (top, bottom) shape pairs, layer rotations disregarded: `5·1 + 10·3 + 10·10 + 3·10 + 1·5`, indexed by 2/3/4/5/6 corners in the top layer |
| **3,678** | absolute **twistable** shapes — rotations distinguished, slice legal |
| **11,958,666,854,400** | twistable positions = `3678 × 8! × 8! × 2` |
| 435,891,456,000 | `15!/3`, a *different* accounting that identifies rotations **and** reflections — not the model here |

A layer with `c` corners satisfies `2c + e = 12`, and the 8 corners split
between the layers, so `c ∈ {2,3,4,5,6}` per layer.

**"Cube shape"** is a layer whose pattern alternates `C E C E C E C E`. There
are three rotational alignments per layer (corners starting at slots `≡ 0`,
`1`, or `2 mod 3`). Alignment `2` puts corners on `(2,3)` and `(8,9)` — i.e. it
is **not twistable**.

---

## 7. Random-state generation approach

Draw uniformly over the twistable positions, which is exactly the set 4b3d
allows a scramble to end in:

1. Pick one of the **3,678** twistable absolute shapes, uniformly.
2. Assign the 8 corners to the shape's corner positions: `8!`.
3. Assign the 8 edges to its edge positions: `8!`.
4. Pick `middleFlipped`: `2`.

`3678 × 8! × 8! × 2 = 11,958,666,854,400`, matching the published twistable
count — which is the evidence that **no further constraint applies**. That is a
check to run, not an assumption: if some combination turns out unreachable, the
enumeration in step 3 will not match and the design changes before any solver
work happens.

Uniform over that product is uniform over states, and the 4b3d minimum-distance
filter is then applied by **rejection**, which preserves uniformity on the
condition (§9).

---

## 8. Solver strategy

The state space is ~1.2 × 10¹³ — far too large for a single pruning table, so a
two-phase decomposition is required. Jaap describes the standard one: *"Phase 1
makes a cube with an even permutation of pieces, and the second stage solves
it."* TNoodle ships `scrambler-sq12phase`, "a copy of Chen Shuang's square 1
two phase solver".

- **Phase 1** — reach cube shape (plus whatever parity phase 2 needs).
  Coordinate: absolute shape × middle flip × permutation parity. Small enough
  for an exact BFS table.
- **Phase 2** — from cube shape, solve the permutation. Coordinate: corner
  permutation (`8! = 40,320`) and edge permutation (`8! = 40,320`) as two
  pattern databases, combined as `max(...)` — an admissible heuristic — driving
  IDA*.

### Open question — **answered in step 2**

Phase 2 needs the set of moves that **preserve cube shape**. Layer turns by
multiples of 3 obviously do. Whether a single `/` does is **not** obvious, and
my first analysis of it was wrong in both directions before I worked it through
on the slot model:

Because `/` *reverses* the moving arc (§4), and a cube-shape half always reads
`C E C E` — never a palindrome, for any of the four valid cut diameters — a
single slice appears **not** to preserve absolute cube shape.

That is now computed rather than supposed, and it is what the model says
(`state.test.ts`, "a single slice does not preserve cube shape from solved").
Geometrically it has to be so: the cut of a cube-shaped layer runs **15° off a
face normal** — the four valid diameters are at 15° or 75° from one — and a cube
has no 180° symmetry about an axis 15° off a face normal, so the rotation cannot
map the solid to itself.

The refinement that matters for phase 2: a slice **does** preserve cube shape
when the two rings sit in *complementary* alignments, because then the reversed
`C E C E` arriving from one ring is exactly the `E C E C` the other ring wants.
A cube-shaped ring has three alignments (corners starting at slots `≡ 0`, `1` or
`2 mod 3`), of which `2` is not twistable — so cube shape is preserved by
`/` from alignment pairs `(0,1)` and `(1,0)`, and broken from `(0,0)` and
`(1,1)`. Phase 2's move set is therefore built from **composite** moves, which
is also consistent with how real Square-1 algorithms look: they visibly pass
through non-cube shapes.

Note also that the scrambler does **not** need optimal solutions — only the
distance *check* in §9 needs exactness. That gives phase 2 useful freedom.

---

## 9. Exact 4b3d compliance

Regulation 4b3 requires *"a random state from all states that require at least
N moves to solve (equal probability for each state)"*, with `N = 11` for
Square-1 (4b3d).

The parenthetical is the hard part. Rejection sampling on the **true** distance
keeps the distribution uniform on the qualifying states, because the
conditional distribution of a uniform draw is uniform on the condition.
Rejecting on an *approximate* lower bound would not: it would throw away
qualifying states whose bound happened to read low, biasing the result. So the
test has to be exact.

Under the chosen metric, typical distances sit around 13–16 with God's number
estimated 25–27, so states below 11 are a small but **non-negligible**
fraction — this filter really does fire, and therefore really does have to be
correct.

**Plan:**

1. Compute an admissible lower bound from the pattern databases. If it already
   reaches 11, accept — this will be the overwhelming majority of draws, at
   negligible cost.
2. Otherwise decide exactly, by **meet-in-the-middle**: a precomputed set of
   all states within 5 moves of solved, intersected against a 5-move BFS from
   the drawn state. That detects distance ≤ 10 exactly. Since a move alternates
   between a layer-turn pair (143 choices) and a slice (1), depth 5 is roughly
   `143³ ≈ 2.9 × 10⁶` states per side — feasible; depth 10 head-on would be
   `143⁵ ≈ 6 × 10¹⁰` and is not.

Both clauses of 4b3d are then satisfied: the minimum distance exactly, and the
"`/` applicable without a prior `(X,Y)`" clause automatically, by drawing only
from twistable shapes (§7).

---

## 10. Validation strategy

Per the project's existing standards, plus the checkpoint the plan calls for.

- **Step 1 — notation.** Round-trip `parse → render → parse` over the full
  `12 × 12` move space; accept the real scrambles in §2; reject malformed
  tokens and `(0,0)`.
- **Step 2 — state model.** Layer turns always legal; `/` is an involution;
  slice legality matches the cut-straddling rule; a sequence followed by its
  inverse restores the state; corners never split across rings; shape
  transitions behave as specified.
- **Step 3 — enumeration (hard checkpoint).** Must reproduce **3,678**
  twistable shapes and `3678 × 8! × 8! × 2 = 11,958,666,854,400` states.
  **Work stops here if these do not match**, because every number downstream
  depends on the slice mapping in §4 being right, and this is the first place a
  sign or index error in it becomes visible.
- **Step 4 — solver.** Phase tables verified by BFS coverage; heuristics
  verified admissible (never exceeding a known true distance); solutions
  verified to actually solve.
- **Step 5 — distance check.** Verified against brute force at small depths;
  the meet-in-the-middle result cross-checked against a direct search where
  both are affordable.
- **Step 6 — generation.** Uniform-draw statistics; end-to-end round trip
  (scramble → apply → solve → solved); and the same **independent validator**
  treatment the other events get, with rules rewritten from the notation docs
  rather than reusing the package's own parser.

### Public notation validation, since v0.12

`validateScramble('sq1', text)` dispatches on the event and returns
`{ valid: true, notation: 'square1' }` or `{ valid: false, error }` without
throwing. It is the **notation** half of validation only, and sits beside — not
instead of — everything above: the exact 4b3d distance check of §9, the shape
enumeration of §6, and the solver verification of §12.

Tests cover a generated `sq1` scramble (in `core/validate-scramble.test.ts`
rather than in the notation tests, because generating one builds the pruning
tables and Vitest isolates by file), the real official scramble verbatim, all
143 layer turns, both reason codes with offsets and spans, the spaces-inside-
pairs tolerance, and a failure in the middle of a scramble.

**What it does not check.** Whether `(13, 0)` is reachable on a real puzzle is
a question about a puzzle, not about notation, and is not asked here.

---

## 11. What the first three steps actually found

Recorded as they landed, because several of them change what later steps can
assume.

**Two conventions the sources do not state, pinned against external data
(step 2).** Neither Speedsolving's notation page nor Jaap's says which eye the
lower layer's "clockwise" is measured with, and neither fixes which of the two
twistable cube alignments is solved. Tracing the attested official scramble of
§2 through all four candidate models — with an applier sharing no code with
`state.ts` — leaves **exactly one** standing; the other three jam at move 1 or
5. A slice is blocked roughly half the time, so twelve surviving in a row is not
something a wrong model gets away with. `y` is measured from *outside* the lower
face, and solved is the alignment with corners on slots `(0,1) (3,4) (6,7)
(9,10)`.

Two gauge facts keep that claim the right size: relabelling `i → 11 − i` on both
rings maps the model onto itself while flipping both signs, so only the
*relative* sign is physical; and reflecting through the cut (`i → 5 − i`) maps
one solved alignment onto the other while negating both amounts, so alignment is
a chirality convention. The test pins the pair, which is what matters.

**The checkpoint numbers (step 3).** All reproduced, by two enumerations that
share nothing — one combinatorial (corner starts are an independent set of the
12-cycle), one by breadth-first search over the real move model:

| Count | Result |
|---|---|
| absolute shapes, all rings | **19,305** — and *every one* is reachable |
| twistable shapes | **3,678** ✓ published |
| twistable positions | **11,958,666,854,400** ✓ published |
| shape pairs up to rotation | **170** ✓ published |
| shape-only diameter | **14** moves |

Consequences for the solver: phase 1 needs no reachability filter, since the
shape graph is the whole space; and 14 is an exact bound on the shape phase
rather than an estimate.

**No parity constraint on the puzzle (step 3).** The `× 8! × 8! × 2`
factorisation is only honest if shape, corner permutation, edge permutation and
the middle bit are independent. Returning 200 scrambled states to the solved
*shape* and reading the three parities there produces **all eight**
combinations, so no constraint links them — unlike every other puzzle in this
package, none of the permutation parities is pinned. (Inside phase 2's move
set, one *is* — see below. The two statements are about different move sets and
both hold.)

---

## 12. The solver, as built (step 4)

### Architecture

| | Phase 1 | Phase 2 |
|---|---|---|
| Goal | square layers, correct parity | solved |
| Coordinate | shape (19,305) × parity (2) | alignment (9) × middle (2) × corners (8!) × edges (8!) |
| Size | 38,610 | 29,262,643,200 |
| Method | exact breadth-first table, no search | IDA\* + meet in the middle |
| Optimal? | yes, per ending | yes, per ending |

"Square layers" means both rings alternate corner-edge. It is **not** cube
shape, which additionally requires the two squares to be aligned with each
other; the larger set is the one a slice can keep you inside, and the one real
Square-1 algorithms move through.

### The invariant, and the deviation that wasn't

Phase 2 reaches **exactly 36 of the 72** `(alignment, middle, corner parity,
edge parity)` classes. So phase 1 must deliver parity as well as shape — the
classic decomposition's "a cube with an even permutation", in this package's
coordinates. This was got wrong twice before the tests settled it, once by
asserting the invariant with a wrong argument and once by dropping it on the
strength of a walk that had only been changing alignment. The class table is
now *computed*, and phase 1's goal parity is read out of it rather than written
down.

### Heuristic, and why it is admissible

`max(h(corners), h(edges))`, each an exact breadth-first distance over the
projection that forgets the other permutation. Dropping a coordinate is a
homomorphic projection — every move acts on the projection using only the
projection — so any real solution solves the projection in the same number of
moves, and the projection's *shortest* distance can therefore never exceed the
truth. The maximum of two lower bounds is a lower bound.

One surprise: the corner and edge tables come out **identical**, entry for
entry, because the moves act on the eight edge positions exactly as they act on
the eight corner positions. One table is built and looked up twice, and a test
builds the other to check.

### Meet in the middle

The search stops eight moves short and finishes from a table of every state
within eight moves of solved (905,728 of them). The frontier grows unevenly —
a turn opens 143 ways, a slice one — which makes radius 8 a bargain at 19% more
states than radius 7 and an order of magnitude less than radius 9.

### Sweeping endings

Phase 2's difficulty depends enormously on *which* square-layer state phase 1
hands it: the same puzzle through two equally short endings took 41ms one way
and 5.7s the other. So endings are enumerated **lazily** and swept at a fixed
relaxation — every ending asked for a solution of exactly its lower bound
first, two moves of slack only if all refuse. Enumerating endings eagerly cost
between 150ms and 37s depending on the state, so the laziness is not a
micro-optimisation.

### Measured

On this machine, Node 22:

| | |
|---|---|
| Table construction, once | ~12s (backward table ~6s, pruning ~2.5s, phase-1 ~1.4s) |
| Typed-array memory | 21.3 MB (18.0 MB of it the backward table) |
| Solve, median | 139 ms |
| Solve, 90th percentile | 888 ms |
| Solve, worst of 60 | 2.3 s |
| Solution length | mean 24.6, range 18–28 |

Official Square-1 scrambles run about 24 moves in this metric, so lengths are
comparable. Trading the backward radius from 8 to 7 moves startup to ~7.5s and
the median to ~205ms — kept at 8 because a scrambler makes many scrambles per
process.

### Compromises, stated plainly

- **The total is not optimal.** Each phase is optimal in itself, and the phase
  boundary is compressed, but the split itself gives up optimality. Official
  scrambles do the same.
- **The sweep returns the first ending that fits, not the best.** Searching the
  rest of a sweep costs as much again per ending for a move or two of length.
- **A ~12s first-scramble cost.** Every table is lazy and memoised, so it is
  paid once per process, but it is real.
- **The heuristic is ~4 moves short of the truth** on a typical state, which is
  what the meet-in-the-middle table and the ending sweep exist to absorb. A
  stronger heuristic would need a joint corner/edge table an order of magnitude
  larger, which this package's size budget does not have room for.

---

## 13. 4b3d and generation, as built (steps 5 and 6)

### The exact distance check

Regulation 4b3d wants *"a random state from all states that require at least 11
moves to solve (equal probability for each state)"*. Rejection sampling gives
the parenthetical for free — the conditional distribution of a uniform draw is
uniform on the condition — but **only if the test is exact**. Rejecting on an
approximation would throw away qualifying states whose approximation read low,
and the survivors would no longer be uniform.

Proving "at least 11" by brute force is hopeless (`143^5` for ten moves), so:

1. **A lower bound that usually settles it.** Any solution must also solve the
   shape, the permutation parity and the middle piece, so the exact distance in
   that 77,220-node graph can never exceed the truth. It settles **46-65%** of
   draws outright, at the cost of a table lookup.
2. **A bounded search when it does not**, pruned by the same bound and with a
   visited set. The visited set is load-bearing, not an optimisation: without
   it the bound-7 case took **4.4 seconds**; with it, 93ms.

Measured cost of the check, by what the bound reads:

| bound | 8 | 9 | 10 | ≥ 11 |
|---|---|---|---|---|
| mean | 93 ms | 625 ms | 54 ms | 0 ms |

The middle piece earned its place in the bound by moving the mean per draw from
~510ms to ~50ms.

### Generation

Draw uniformly over twistable positions → redraw until the exact check passes →
solve → invert → render. Both clauses of 4b3d are covered without a patch-up:
the minimum distance by exact rejection, and *"must allow a `/` without a prior
(X, Y)"* by construction, since only twistable shapes are ever drawn.

**No length padding**, unlike the smaller puzzles here. That rule exists so a
visibly short sequence cannot advertise an easy scramble on a printed sheet;
Square-1 solutions come out at 18-28 moves, far above any floor worth setting,
and their length is dominated by the phase split rather than by how scrambled
the puzzle is.

### Validation

`scramble.test.ts` carries an **independent validator** — the notation rules
rewritten from the format description, sharing no code with the package's own
parser — and applies generated scrambles to a solved puzzle to check that they
never jam, always leave the puzzle unsolved, always leave it twistable, and
always leave it at least eleven moves from solved.

---

## Sources

- [Jaap's Square-1 page](https://www.jaapsch.net/puzzles/square1.htm) — piece
  inventory, slice condition, shape counts, position counts, two-phase solver
  description
- [WCA Regulations](https://www.worldcubeassociation.org/regulations/) — 4b3,
  4b3d, 4d3
- [wca-regulations#364](https://github.com/thewca/wca-regulations/issues/364) —
  the undefined Square-1 move metric
- [Square-1 God's number in FTM](https://www.speedsolving.com/threads/square-one-can-be-solved-in-31-moves-in-face-turn-metric.67363/)
  — metrics, 31 FTM, 13 twist, twistable position count
- [Square-1 notation (Speedsolving wiki)](https://www.speedsolving.com/wiki/index.php/Square-1_notation)
- [Square-1 (Wikipedia)](https://en.wikipedia.org/wiki/Square-1_(puzzle)) —
  piece geometry, value range
- [Square-1 tutorial: the scramble](http://afortmadeofbooks.blogspot.com/2025/05/square-1-tutorial-part-1-scramble.html)
  — verbatim official-format scramble
- [Square-1 scramble generator docs](https://ruwix.com/puzzle-scramble-generators/square-1-scrambler/)
  — token examples
