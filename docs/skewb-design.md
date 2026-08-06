# Skewb — design document

Written *after* the implementation, to record what `src/puzzles/skewb/` actually
does. Every count is computed by the code and cross-checked against a figure
published independently of it.

Target: `generateScramble('skewb')`, shipped since v0.5.

---

## 1. Overview

### WCA event

**`skewb` — Skewb.** Regulation **4b3** with exception **4b3c**:

> 4b3c — Skewb: at least **7** moves.

Random state, uniform over the states that qualify, with a seven-move floor.

### Goal of the implementation

A *corner*-turning, deep-cut puzzle: every turn rotates half the puzzle by 120°
about a body diagonal. The geometry reuses the Pyraminx's exact-integer 120°
rotation (`utils/vec3.ts`) applied to whole cube corners and face centres, so
there is one place in the package for that rotation to be right or wrong.

The distinctive decision here is the **coordinate system, which is discovered
rather than designed**. Every other puzzle in this package ranks a closed-form
coordinate and lets a BFS reveal which values are real. That works when the
encodable space is a small multiple of the reachable one. On a Skewb it is not:
the corner permutation alone has `8! = 40,320` encodable values of which just
**36** occur, so a closed-form product would be a 227 MB table that is 99.999%
holes. Instead each projection is closed by BFS from solved and re-indexed
densely — and the sizes it lands on are then checked against published figures.

### References used

- WCA Regulations 4b3, 4b3c; **Fixed Corner Notation** as the regulations
  describe it, including the official holding position.
- Jaap Scherphuis' Skewb page — the position count `3,149,280` and God's number
  11, used as cross-checks.
- No third-party code was read.

### Files

| | |
|---|---|
| `notation.ts` | Fixed Corner Notation as its own move type |
| `geometry.ts` | the deep cut, the four turn axes, and the turn tables |
| `state.ts` | piece-level state, and the 8 composed turn tables |
| `coordinates.ts` | the two BFS-discovered, densely re-indexed projections |
| `pruning.ts` | one exact distance table over their product |
| `search.ts` | IDA\*, and the fixed-length variant |
| `random-state.ts` | the uniform draw — no constraint to repair |
| `solve.ts` | 4b3c filter, padding, inversion, registration |

---

## 2. Notation

### Supported notation

WCA **Fixed Corner Notation**. The scrambler holds one corner still —
officially the white-on-top, green-on-front-left one — and turns the four
corners whose moving half excludes it:

| Token | Meaning |
|---|---|
| `U` | 120° clockwise, seen from outside the **top-back** corner |
| `R` | the same about the **bottom-right** corner |
| `L` | the **bottom-left** corner |
| `B` | the **bottom-back** corner |
| `U'` … | counterclockwise |

Eight tokens. **There is no half turn** — the turn has order 3, so `U2` is not
notation and is rejected.

The four letters happen to be the same four the Pyraminx uses, and both puzzles
turn about a vertex by ±120°, but the two move types are deliberately **not**
shared. A Pyraminx letter names one of the puzzle's four vertices; a Skewb letter
names one of eight cube corners, chosen relative to a *held* corner the notation
never mentions. Collapsing them would imply a correspondence between `U` on one
puzzle and `U` on the other that does not exist.

### Parsing rules

`parseSkewbMove` accepts `/^([URLB])(')?$/`. A bare letter is amount 1, a prime
is amount 2. `U2` and any letter outside `URLB` throw — the test suite pins the
cube-style half turn being rejected specifically.

### Rendering rules

`skewbMoveToString` prints amount 2 as a prime; `skewbMovesToString` joins with
single spaces. Every emitted scramble is **exactly 11 tokens** with no two
consecutive turns about the same corner.

### Examples

A real generated scramble from the shipped build:

```
U B U L' U R' B U' B' R B
```

---

## 3. State model

### Internal representation

```ts
interface SkewbState {
  cornerPermutation: readonly number[]; // 8 entries
  cornerOrientation: readonly number[]; // 8 entries, 0..2
  centerPermutation: readonly number[]; // 6 entries
}
```

Eight corners with a twist in `Z3`, and six centres with **no** orientation — a
Skewb centre is a single square of one colour, so there is nothing to track.

Arrays are indexed by slot. **Slot 0 is the held corner**, and nothing in the
module special-cases it: it simply never appears on the moving side of any turn.
That is what makes the notation's four letters a valid reference frame for a
puzzle which, like the 2x2x2, has no fixed centres to define one.

### Coordinate system

The cut geometry first. A Skewb's four cuts are the planes through the centre
perpendicular to the four body diagonals, so a turn about corner `c` moves
exactly the pieces `p` with `p · c > 0`:

| `p · c` | pieces | moved? |
|---|---|---|
| 3 | the axis corner itself | yes — it twists in place |
| 1 | its three neighbouring corners, and three centres | yes |
| −1, −3 | the antipodal four corners and three centres | no |

Four corners and three centres move; the axis corner staying put while twisting
falls out of the same rotation rather than needing a special case. No coordinate
ever leaves the integer lattice, so piece lookup is exact equality.

Orientation is defined by a cycle *derived from the rotation itself*: index 0 is
the corner's y-axis sticker (the same reference the 3x3x3 corner model uses), and
1 and 2 follow it under the right-hand-rule 120° rotation about that corner's own
diagonal. Deriving the cycle rather than writing an axis order per corner is what
makes it automatically consistent with each corner's chirality — the 3x3x3
resolves the same subtlety by flipping a hand-written order on `x·y·z`; doing it
this way, there is no order to get backwards.

The search then uses **two projections, both discovered by BFS and re-indexed
densely**:

| Projection | Values | Why this split |
|---|---|---|
| corners — permutation **and** twist jointly | **8,748** | they must be joint |
| centres — permutation only | **360** | a centre has no orientation |

The corner projection has to be joint. Separately, corner permutation spans 36
values and twist `3^7 = 2,187`, i.e. `78,732` combinations — of which only an
eighth-and-a-bit are real, because a Skewb's twists are partly determined by its
permutation (each turn twists the corner it pivots about, so the net twist of a
corner orbit is pinned to how many times the *other* orbit has been cycled).
Ranking them jointly absorbs that coupling instead of leaving it as unreachable
padding.

`8,748 × 360 = 3,149,280` — exactly the published number of Skewb positions.

Dense index 0 is the BFS start in both projections, i.e. solved, so
`isSolvedSkewbCoordinate` is `corners === 0 && centers === 0`.

### Invariants

Conclusions, not premises — every one is asserted as a property of the derived
move tables:

1. **Fixed Corner Notation really does fix a corner**: slot 0 is never disturbed,
   not even twisted.
2. **Centre permutation is always even** — every turn 3-cycles three centres.
3. **Corner permutation is always even**, for the same reason.
4. **The corners split into two orbits that never mix**: four and three, plus the
   held corner. This is what makes 36, not `7!`, the reachable permutation count.
5. **Total corner twist is deliberately *not* conserved.** One turn changes it by
   two mod three, so the twist sum takes all three values across random states —
   unlike a 3x3x3, where the sum is pinned to zero. The test asserts the
   *absence* of the invariant, which is the easy thing to get wrong by analogy.

The two projections' independence is not assumed either: the pruning BFS reaching
**all** `8,748 × 360` entries is what proves no constraint links them.

### Solved state

Identity permutations, zero twists. `isSolvedSkewb` compares against exactly
that; with one corner held, there is no rotational ambiguity to quotient out.

---

## 4. Move model

### Primitive moves

Eight: four corners × two amounts.

`deriveTurnTableSkewb` builds the clockwise turn about a corner by rotating
every piece with `p · axis ≥ 0` through `rotate120(axis, p, -1)`, and reading the
corner twist off where the reference sticker lands in the destination's own
cycle. Centres get destinations only; they have no orientation.

### The holding position, derived rather than asserted

Which cube corner each letter turns is the one thing here that a plausible guess
could get wrong. `geometry.test.ts` reconstructs the official WCA holding
position — white face up, green face front-left, viewer looking along `(1,0,1)`
so three faces are visible — and checks that the held corner is `(1,1,1)` and
that each letter lands on the corner the regulations describe: `U` top-back, `R`
bottom-right, `L` bottom-left, `B` bottom-back (and the only one hidden from the
viewer). It further checks that the four axes are four *different* body
diagonals, none of them the held corner or adjacent to it.

That last property is what makes the four letters a complete generating set:
every Skewb turn is about *some* diagonal, and turning the other half of a
diagonal differs only by a rotation of the whole puzzle. It is the exact analogue
of restricting the 2x2x2 to U/R/F.

### Composition

`composeSelf` builds the counterclockwise turn by applying the clockwise one
twice — order 3. The coordinate transitions in `coordinates.ts` are built by
pushing each projection value through the already-tested `applySkewbMove`, so
nothing re-derives the mechanics a second time.

### Move legality

Every move is legal in every state. The search skips a move about the same
corner as the previous one, since two such turns always collapse into one.

### Inverses

`inverseSkewbMove` maps amount `a → 3 − a`, keeping the corner. Every turn has
order 3; a sequence followed by its inverse returns to solved.

---

## 5. Scramble generation algorithm

### High-level algorithm

```
1. draw a uniformly random reachable state
2. if its exact distance is < 7, discard and draw again              (4b3c)
3. shuffle the move try-order
4. solve in exactly max(distance, 11) moves
5. print the inverse
```

Nothing needs appending afterwards: unlike the Pyraminx, a Skewb has no
trivially independent pieces, so the whole puzzle is inside the search.

### Random-state vs random-move

**Random-state.** 4b3e does not name the Skewb.

### Uniformity argument

This is the cleanest uniformity argument in the package, because **the
coordinate space *is* the reachable space**. Both projections were built by BFS
from solved and re-indexed densely, so drawing a uniform index in
`[0, 3,149,280)` and decoding it is already uniform over real Skewb positions.
There is no parity to repair and no constraint to satisfy by construction —
the usual "draw, then fix the parity" dance does not appear.

`randomSkewbState` still carries a rejection loop against `UNVISITED`. It is a
**guard, not a mechanism**: the pruning BFS reaches all 3,149,280 entries, so it
never actually rejects. It is kept so the function stays *correct* — still
uniform over the reachable set — rather than silently wrong, if the two
projections ever stopped being independent.

The 4b3c filter then conditions that uniform distribution, which keeps it
uniform on the condition. Padding to eleven changes the route, not the
destination. The move-order shuffle is the same cosmetic anti-bias fix used on
the Pyraminx, and for the same reason: with an exact heuristic the root never
backtracks, so a fixed try-order would bias the scramble's last move.

### WCA compliance

| Requirement | Where |
|---|---|
| 4b3 random state, equal probability | `random-state.ts` over a BFS-built reachable set |
| 4b3c at least 7 moves | `drawStateAtLeastMovesFromSolved(…, 7)`, exact distance |
| Sequence long enough not to leak difficulty | `solveAtLeastLength(…, 11, …)` |
| Fixed Corner Notation | `notation.ts`, holding position verified in `geometry.test.ts` |

WCA incident 28 — the scrambler bug that let sequences come out short — was
about **Skewb** specifically, which is why the 11-move padding matters more here
than anywhere else in the package.

---

## 6. Validation

### Existing tests

Seven test files, `src/puzzles/skewb/*.test.ts`.

| Test | What it rules out |
|---|---|
| the held corner is `(1,1,1)` under the official holding position | a wrong frame |
| `U`/`R`/`L`/`B` land on the corners the regulations name | a mislabelled move set |
| the four axes are four different body diagonals, none held or adjacent | a non-generating set |
| a turn moves exactly 4 corners and 3 centres | a wrong deep-cut test |
| the axis corner stays put while twisting; the other three 3-cycle | a wrong rotation |
| **corners span 8,748 states, centres 360, product 3,149,280** | a wrong group order, i.e. a wrong model |
| corner permutation and twist really do have to be ranked jointly | the cheaper split that would have been wrong |
| coordinate tables agree with full-state application, 3,000 states × 8 moves | a drifted transition table |
| **the pruning BFS leaves no entry unvisited** | the two projections not being independent |
| **every distance from 0 to 11 occurs** | a truncated or runaway BFS |
| slot 0 is never disturbed | a move set that is not FCN |
| both permutations always even; corners in two non-mixing orbits | the structural facts behind 8,748 |
| total twist is **not** conserved | the invariant that would be wrong by analogy with the 3x3x3 |
| every one- and two-turn element's order divides 3,149,280 | a move table outside the group |
| solution length always equals the table distance | a non-optimal search |
| scramble is exactly 11 moves; state ≥ 7 from solved | the two `scramble-shape` rules |

### Independent verification

Building the pruning table from scratch and reading off its histogram:

| distance | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| states | 1 | 8 | 48 | 288 | 1,728 | 10,248 | 59,304 | 315,198 | 1,225,483 | 1,455,856 | 81,028 | 90 |

Total **3,149,280** with **no unvisited entry**, and a maximum of **11** — the
published Skewb position count and God's number, together with the full
per-depth distribution, all matching figures published independently of this
code.

Full coverage is a real assertion here rather than a tautology. The coordinate
space was *built* from the reachable set, so the sizes 8,748 and 360 were
discovered separately; only their product being completely reached rules out a
constraint linking the two.

### Edge cases

- **Already solved.** `solveSkewb` returns `[]`; `solveSkewbInExactly(state, 0)`
  returns `[]` only when solved.
- **Unreachable state.** `skewbSolveDistance` throws rather than returning the
  `UNVISITED` sentinel as a distance. Since the coordinate space is the reachable
  space, this can only be reached by hand-constructing a state.
- **The 4b3c rejection genuinely fires.** 71,625 of the 3,149,280 states are
  within six moves of solved, so about **2.3% of draws** are discarded — the
  highest rejection rate of any puzzle in the package, and therefore the
  best-exercised floor.
- **Padding never needs to step past 11.** The maximum distance *is* 11, and a
  solution of exactly 11 is always found; `solveAtLeastLength` never reaches 12.

---

## 7. Complexity

### Time complexity

| Step | Cost |
|---|---|
| Turn tables | 8 tables over 8 corners + 6 centres — negligible |
| Projection BFS | closes 8,748 + 360 values, each expanded over 8 moves |
| Transition tables | `8 × (8,748 + 360)` entries |
| Pruning BFS | `3,149,280 × 8 ≈ 25M` edge relaxations |
| Draw | `O(1)` |
| Distance check | `O(1)` |
| Search | IDA\* with an **exact** heuristic; first iteration succeeds |

### Memory usage

| | |
|---|---|
| Pruning table | `Uint8Array(3,149,280)` = **3.15 MB** |
| Corner projection values (8,748 × 16 numbers) + key map | ≈ **2 MB** |
| Centre projection values + map | ≈ **100 KB** |
| Transition tables | `8 × 9,108` entries ≈ **600 KB** |
| Total, steady state | **~6 MB**, built once per process |

Unlike the Pyraminx, essentially none of the pruning table is waste — every
entry is a real state. That is the payoff for discovering the coordinates
instead of writing them down.

### Expected scramble generation time

Measured on the development machine (Windows 11, Node 22.14):

| | |
|---|---|
| Cold — first `generateScramble('skewb')` in a fresh process | **614 ms** |
| Steady state, `npm run bench` | **0.0132 ms** (≈ 76,000 scrambles/second) |
| Steady state, public async API | 0.065 ms mean, 0.079 ms p90 |

The fastest steady-state scrambler in the package.

---

## 8. Known limitations

### Current bugs

None known. Every published figure the model could be checked against is
reproduced, and no test is skipped.

### Rough edges, stated plainly

1. **The projection values are stored as objects with a string key map.** The
   corner projection keeps 8,748 `{permutation, orientation}` pairs plus a
   `Map` from a joined string to an index, which is roughly 2 MB and a string
   allocation per `cornerCoordSkewb` call. Correct by construction and fast
   enough — a scramble does a handful of encodes — but it is the module's least
   efficient part, and it is on the hot path in a way the pruning table is not.
2. **A ~614 ms cold start**, dominated by the pruning BFS. Same lazy-table
   situation as everywhere else in the package.
3. **Only one holding position is supported.** The frame is baked into
   `CORNER_POSITIONS_SKEWB[0]` and `TURN_AXIS`. That is what the regulations
   specify, so it is not a gap — but a caller wanting a differently-held Skewb
   would have to re-derive, not configure.

### Planned improvements

- Ship the serialized pruning table.
- Replace the string-keyed projection index with a packed integer key, removing
  most of the module's memory and its only per-call allocation.

---

## 9. References

### WCA regulations

- [WCA Regulations](https://www.worldcubeassociation.org/regulations/) — 4b3
  (random state, equal probability), 4b3c (Skewb at least 7 moves), and Fixed
  Corner Notation with its holding position.
- [WCA incident 28](https://www.worldcubeassociation.org/incidents/28) — the
  Skewb scrambler bug where "the truncation did not preserve the random scramble
  distribution". The direct reason for the 11-move padding.

### Published figures used as cross-checks

- [Jaap Scherphuis — Skewb](https://www.jaapsch.net/puzzles/skewb.htm) — the
  position count `3,149,280`, God's number 11, and the per-depth distance
  distribution reproduced in §6.
- [Skewb (Wikipedia)](https://en.wikipedia.org/wiki/Skewb) — the same position
  count and the deep-cut corner-turning mechanism.

### Algorithms and mathematics

- Olinde Rodrigues' rotation formula, specialised to 120° about a cube body
  diagonal in `utils/vec3.ts` — shared with the Pyraminx, and what keeps this
  model exact over the integers.
- Richard E. Korf, *Depth-First Iterative-Deepening: An Optimal Admissible Tree
  Search* (1985) — IDA\*.
- [thewca/tnoodle#69](https://github.com/thewca/tnoodle/issues/69) — the
  move-order bias the shuffled try-order prevents.

### Related documents in this repository

- `docs/pyraminx-design.md` — the same 120° machinery, with the opposite
  decision about coordinate density and the reasoning for both.
- `docs/222-design.md` — the other puzzle here with no fixed centres, and the
  same "nominate one piece as the frame" resolution.
