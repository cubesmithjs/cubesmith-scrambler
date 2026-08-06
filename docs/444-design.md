# 4x4x4 — design document

Written before any implementation, to the same standard as `square1-design.md`:
every claim is sourced, computed, or explicitly flagged as an open question to
be settled by computation rather than assumption.

Target: `generateScramble('444')` and `generateScramble('444bf')`,
WCA-conforming, original implementation.

---

## 1. What the regulations require

Regulation **4b3** (quoted from the current regulations):

> An official scramble sequence must produce a random state from all states
> that require at least 2 moves to solve (equal probability for each state).
> The following additions/exceptions apply:

The exceptions are 4b3a (blindfolded: random orientation), 4b3b (2x2x2 ≥ 4),
4b3c (Skewb ≥ 7), 4b3d (Square-1 ≥ 11), 4b3e (**5x5x5, 6x6x6, 7x7x7 and
Megaminx**: random *moves*), 4b3f (Pyraminx ≥ 6).

**4x4x4 appears in none of them.** So the default applies in full:

| | |
|---|---|
| Method | **random state** — random moves is not permitted |
| Minimum | at least **2 moves** to solve |
| `444bf` | the same, **plus 4b3a** random orientation |

This is the hardest requirement in the package. Every other unimplemented
option — random moves, "enough moves that it is surely scrambled", a reduction
scramble — is non-compliant.

---

## 2. The puzzle

**Pieces.** 8 corners; 24 wings (edge pieces, all mutually distinguishable, and
with no orientation freedom — a wing's orientation is fixed by which slot holds
it, which is why 4x4x4 has no "edge flip"); 24 centres in six indistinguishable
groups of four.

**No fixed centres.** An even cube has no piece that defines a face, so the
puzzle's orientation is not part of its state. Twenty-four facelet
configurations describe the same physical position.

**Moves.** WCA 4x4x4 notation is the depth-1 and depth-2 layer moves:
`U D L R F B` and `Uw Dw Lw Rw Fw Bw`, each in three amounts — **36 moves**.
Depth 3 never appears, because `3Rw` on a 4x4x4 is a whole-cube rotation
composed with `Lw'`, and scrambles are written in a fixed frame. The package's
`maxDepthForSize(4) = 2` already encodes exactly this.

The inner slice is not its own token: `r = Rw R'`.

---

## 3. State count — the hard checkpoint

The published figure:

```
7,401,196,841,564,901,869,874,093,974,498,574,336,000,000,000  ≈ 7.4 x 10^45
```

and it decomposes as

```
   8!        corner permutation
 x 3^7       corner orientation (the seventh is determined: the sum is 0 mod 3)
 x 24!       wing permutation — every permutation is reachable
 x 24!/4!^6  centre arrangement, four indistinguishable per colour
 / 24        the whole-cube rotations, which are not part of the position
```

`40320 x 2187 x 6.2e23 x 3.25e15 / 24 = 7.4 x 10^45`, reproducing the published
number.

Two things in that decomposition are **claims to verify, not inputs**:

- **No parity constraint links wings to corners.** A single inner slice turn is
  a 4-cycle on wings (odd) and a 4-cycle on centres — and the centre cycle is
  invisible, because the four centres of a face are identical. That is exactly
  the "parity" case 4x4x4 solvers know: an odd wing permutation with even
  corners is a legal position. So the product above has no correction factor.
- **Every centre arrangement is reachable**, the centre permutation being
  observable only up to the `4!^6` relabellings.

Both will be checked the way Square-1's 3,678 was: by an enumeration that does
not share code with the generator. §10.

---

## 4. Representation

Two candidates, and the recommendation is to use **both**.

**Facelet model (already in the package).** `src/puzzles/nxn/` models an NxN
cube as facelets carrying a position and an outward normal, with moves derived
from exact integer rotations. It already generates and applies 4x4x4 moves
correctly — `maxDepthForSize(4)` is right, and the model is what the 5x5x5,
6x6x6 and 7x7x7 scramblers are built on.

*Role:* the **independent oracle**. Every coordinate, every move table and every
solution is checked against it. Nothing in the solver may share code with it.

**Piece model (new).** Corners as permutation + orientation, wings as a
24-permutation, centres as a 24-vector of colours. This is what the solver's
coordinates project from, because a facelet array cannot be indexed.

*Role:* the solver's own state, with an explicit, tested bijection to the
facelet model.

The two-model discipline is what caught three separate errors in Square-1 —
the slice map, the parity invariant and the goal/bound ordering — and is
cheap.

---

## 5. Uniform random state

If §3's decomposition holds, the draw is a straight product with no rejection:

1. corner permutation — uniform over `8!`
2. corner orientation — seven free, the eighth forced so the sum is `0 mod 3`
3. wing permutation — uniform over `24!`
4. centre arrangement — uniform over the multiset permutations of `4^6`
5. the frame — fixed by convention

Drawing in a fixed frame produces each *physical* position exactly 24 times, so
the marginal over positions stays uniform. For `444bf` that is a feature: the
frame draw **is** 4b3a's random orientation, and comes free rather than as a
suffix (§11).

**The 2-move minimum** is then applied by rejection, exactly as elsewhere in
this package: `core/scramble-shape.ts`'s `drawStateAtLeastMovesFromSolved`
keeps the survivors uniform because the conditional distribution of a uniform
draw is uniform on the condition. For 4x4x4 the test is cheap — a state fewer
than 2 moves from solved is solved or one of the 36 single-move states, so it
is a lookup, not a search.

---

## 6. Solver architecture

### The shape of the problem

7.4 x 10^45 is far beyond any table. The only viable structure is a **subgroup
chain**: a descending sequence of move subgroups, each phase searched with its
own coordinates and its own pruning tables, exactly as `333` is two-phase and
Square-1 is two-phase — but with more phases, because the drop per phase is
smaller.

The chain proposed here is a reduction chain: get the centres onto the right
faces, get the wings into the right orbits, pair the wings, and finish as a
3x3x3. That is the shape every practical 4x4x4 random-state scrambler uses,
including the "three-phase" solver TNoodle adopted, and it is also the shape of
the published sub-optimal multi-phase path-planning work on Rubik's Revenge
(§13). The *idea* is standard; the implementation here will be derived from
this document's model, not translated from anyone's code.

### Phase 1 — centres onto their own axis pair

**Invariant established:** every centre facelet is on one of the two faces of
its own colour's axis (U/D colours on the U and D faces, F/B on F and B, L/R on
L and R).

**Move set:** all 36.

**Coordinates.** The first sketch here was wrong and the implementation
corrected it, so both are recorded. "Which 8 of the 24 slots hold U/D colours"
(`C(24,8) = 735,471`) is fine; "which 8 of the *remaining* 16 hold F/B"
(`C(16,8) = 12,870`) is **not a usable abstraction** — it is defined relative to
the first, so it has no transition function of its own, and the pair would be a
single 9.5-billion-entry coordinate rather than two small ones.

What works is three coordinates of the same form, one per axis pair:

| coordinate | size |
|---|---|
| which 8 slots hold U/D colours | `C(24,8) = 735,471` |
| which 8 slots hold F/B colours | `C(24,8) = 735,471` |
| which 8 slots hold L/R colours | `C(24,8) = 735,471` |

Three exact breadth-first tables, 2.2 MB together, used as `max(...)` — each a
homomorphic projection, so none can exceed the truth. The third is logically
redundant (the L/R mask is what the other two leave over) but its *distance* is
an independent bound, and including it is what took a solve from half a second
to 67ms.

**Measured:** radius 8, tables built in 1.3s, solutions averaging 9.1 moves
against a bound averaging 6.5, ~67ms per solve, optimal.

### ~~Phase 2 — wings into their orbits~~ — **does not exist**

This phase was planned on the understanding that the 24 wings split into two
orbits of twelve once inner-slice quarter turns are withdrawn, so that a phase
was needed to put each wing into its own orbit while they were still available.

**Measured on the model, they do not split at all.** The wings are a single orbit
of 24 under every move set tried — all 36 moves, the 24 that preserve phase 1,
and even the 18 outer turns alone (`orbits.ts`, `orbits.test.ts`). The intuition
that misled: `U2` sends the wing nearer F on the UR edge to the wing nearer B on
UL, so even outer turns mix what looks like two handednesses. A 4x4x4 wing is
unflippable *in place*, which is a different statement from being confined to
half the slots.

So there is no orbit invariant to establish and the chain is **three phases, not
four**. What *is* preserved, and what the last phase relies on, is **pairing**:
both wings of an edge lie in the same two layers, so an outer turn moves them
together — asserted in `orbits.test.ts`.

### Phase 2 — reduction

**Invariant established:** wings are paired and centres are solved, so the
puzzle is a 3x3x3 in disguise and only `<U, D, L, R, F, B>` is needed.

**Move set:** the 24 moves that keep every centre on its own axis pair — the
eighteen outer turns and the six wide **half** turns. A wide *quarter* turn is
exactly what would undo phase 1, and `orbits.test.ts` checks both halves of that
claim: those 24 preserve the invariant, and a wide quarter turn breaks it.

This is the phase with real risk, and the document says so plainly: the
coordinate that matters is the wing *pairing*, and a full wing permutation
coordinate is `24!`, far past tabulation. The plan is a **partial-permutation
pattern database** — the exact positions of a chosen subset of wings — with
several disjoint subsets combined by `max(...)`:

The sizing here was revised once the language it would be built in was taken
into account. Six wings is `24 x 23 x 22 x 21 x 20 x 19 = 96,909,120`, and while
97 MB of table is affordable, the breadth-first search that fills it is not: the
queue alone is ~390 MB, and a frontier scan over 97M entries x 24 moves is ~2.3
billion transitions per level. That is minutes to hours in JavaScript.

Four wings — the two wings of two edges — is
`24 x 23 x 22 x 21 = 255,024`, which builds in a moment, and six such tables
cover all twelve edges for 1.5 MB in total. Each takes as its goal *those two
edges paired* (a multi-source breadth-first search, since pairing does not
require being home), which is admissible: any real reduction pairs them too.

| coordinate | size |
|---|---|
| centres solved within their axis pairs | `(C(8,4))^3 = 343,000` |
| positions of the 4 wings of 2 edges, x6 disjoint groups | `6 x 255,024` |

**Measured, and the answer is no.** All seven tables were built and their
strength taken against real phase-1 states:

| | |
|---|---|
| wing-pair group table | 255,024 entries, **radius 6**, builds in 1.5s |
| centre table | 343,000 entries, radius ~12, builds in under a second |
| `max` of all seven, after phase 1 | **7 to 9** |

Each component is shallow because each is small, so their maximum cannot rise
much above nine — while the reduction has to solve the centres *and* pair all
twelve edges, none of which is paired when phase 1 finishes. The true distance is
far beyond nine, the move set branches about twenty per move, and iterative
deepening across a gap that wide does not terminate in useful time. No
meet-in-the-middle tail closes a gap of that size either: it buys a fixed number
of moves, not a factor.

So the joint search is ruled out on measurement rather than on suspicion, and the
reduction must be **staged**: pair edges in small groups using sequences that
preserve what earlier groups achieved, in the shape of the human reduction but
with each stage's sequences found by exact search rather than memorised. Solutions
will be long — plausibly 60 to 150 moves — which the project's stated priorities
accept, and length can be attacked afterwards.

What the seven tables are still worth: the centre table is the exact finisher for
the last stage, and the wing-pair tables are exactly the per-stage guidance a
staged pairing needs.

### Phase 3 — solve the 3x3x3

The existing `puzzles/333` two-phase solver, unchanged. The reduced 4x4x4 maps
onto a 3x3x3 state by construction, and its solution lifts back to outer-layer
moves one-for-one.

**The one thing that cannot be inherited: parity.** A reduced 4x4x4 can present
a 3x3x3 state that no 3x3x3 can reach — an odd edge permutation ("OLL/PLL
parity"). The 333 solver will reject it. The fix is standard and must be built
in from the start rather than discovered later: detect the case at the end of
phase 3 and apply a parity-fixing sequence, or — cleaner, and the approach this
design prefers — **carry the wing permutation parity as part of phase 2's
coordinate**, so the search is steered into the half that reduces to a solvable
3x3x3. That makes parity a property the phases maintain rather than an
exception patched afterwards.

---

## 7. Pruning tables and heuristics — summary

| phase | tables | entries | bytes |
|---|---|---|---|
| 1 | centre split (U/D), centre split (F/B) | 735,471 + 12,870 | ~0.75 MB |
| 2 | wing orbit split, centre-in-pair arrangement | 2,704,156 + 343,000 | ~3 MB |
| 3 | two partial wing permutation PDBs | 2 x 96,909,120 | ~194 MB |
| 4 | inherited from `333` | — | existing |

**Admissibility** is the same argument throughout, and is the only argument
this package accepts: a coordinate is admissible when the moves act on it using
*only* it — a homomorphic projection — so replaying any real solution solves the
projection in the same number of moves, and the projection's shortest distance
therefore cannot exceed the real one. `max` of several such bounds is a bound.
Sums are **not** used: they are not admissible unless the patterns are disjoint
in a sense 4x4x4 wing/centre tables do not satisfy.

---

## 8. Complexity estimates

Honest ranges, to be replaced by measurements:

| | estimate | basis |
|---|---|---|
| Phase 1 depth | 5-8 moves | 748k-state space, branching ~36 |
| Phase 2 depth | 8-12 moves | 2.7M x 343k, restricted target |
| Phase 3 depth | 12-18 moves | the expensive phase; PDB-guided |
| Phase 4 depth | ~20 moves | the existing 333 solver's own figure |
| **Total scramble length** | **45-60 moves** | official 4x4x4 scrambles are ~40 |
| Table construction | 1-3 minutes, once | dominated by the 97M-entry PDBs |
| Memory | ~200 MB | §7 |
| Per scramble | 0.3-2 s | within the agreed budget |

Square-1 is the cautionary tale here: its first working solver took 100 s per
scramble and reached 140 ms only after four rounds of measurement. The same
should be expected here, and the milestones (§12) are arranged so that the
measurement happens early rather than at the end.

---

## 9. Open questions, to be settled by computation

Listed explicitly so they cannot be quietly assumed, exactly as Square-1's §8
listed the slice question that turned out to have a counter-intuitive answer:

1. ~~**The wing orbit structure under `G1`.**~~ **Answered, against
   expectation:** a single orbit of 24, under every move set tried. There is no
   orbit invariant, and the chain lost a phase because of it.
2. ~~**The centre orbit structure.**~~ **Answered, and it settles the phase
   order.** Ask instead whether a move keeps the two wing slots of an edge slot
   *together*, and the answer falls out: all 18 outer turns do, all 18 wide turns
   split them. Since the contents of a slot pair travel together under an outer
   turn, **pairing is invariant under outer turns** — they cannot pair anything.
   A wide quarter turn would undo phase 1, so the reduction may use only the
   24-move set, and within it a wide half turn breaks solved centres as readily as
   it breaks pairing. There is therefore no order in which one goal is finished
   and then held: **centres-solved and wings-paired must be reached together, in
   one search.** The cheaper two-step reduction is ruled out.
3. **Whether phase 2 needs the wing parity in its coordinate** (§6, phase 4) or
   whether parity can be left to a fix-up. The design prefers the former; the
   decision will be made on measured phase-3 failure rates.
4. **How many wing PDBs are needed**, and of what subset size.
5. **Whether the phases as defined actually nest** — that each phase's target
   subgroup contains the next. This is checkable by enumeration on small
   coordinates and must be checked before any search is written.

---

## 10. Validation strategy

The same ladder that caught every Square-1 error:

**Checkpoint A — the model.** Every one of the 36 moves, applied to the piece
model, must agree with the facelet model of `nxn/`. Move order, inverses,
commutation of opposite faces, and the fact that a wide move is an outer move
composed with an inner slice — all checked against the oracle, not against a
second copy of the same formulas.

**Checkpoint B — the state count.** The coordinate sizes must multiply to
exactly `7,401,196,841,564,901,869,874,093,974,498,574,336,000,000,000`, and
the reachability claims of §3 must be demonstrated: an odd wing permutation with
even corners must be reachable, and the corner orientation sum must be provably
invariant mod 3. **Work stops here if these do not match**, as it would have for
Square-1's 3,678.

**Checkpoint C — the phases nest.** Each phase's goal set must be closed under
the next phase's move set. Enumerable on the small coordinates.

**Checkpoint D — the tables.** Every pruning table is a real breadth-first
table: no unreachable entries, exactly one zero, every entry with a neighbour
one closer, and never exceeding the length of a sequence known to produce the
state.

**Checkpoint E — end to end.** Draw a uniform state, solve it, apply the
solution: solved. Invert the solution, apply it to a solved cube: **the exact
state drawn**, not merely a scrambled one.

**Checkpoint F — the scramble.** An independent validator with the notation
rules rewritten from the format description, sharing no code with the package's
parser; plus uniformity statistics over many draws and a benchmark.

---

## 11. `444bf`

Once `444` exists, `444bf` is `444` plus Regulation 4b3a. But note the
difference from `333bf` and `555bf`: an even cube has **no fixed centres**, so
its orientation is not observable, and the random frame is already part of the
uniform draw (§5). Whether an explicit orientation suffix is still wanted for
consistency with official scrambles is a question for the blindfolded review,
not for this document.

---

## 12. Milestones

Each ends in a commit and a report, and each has a gate:

1. ✅ **Piece model + bijection to the facelet oracle.** Gate: checkpoint A.
2. ✅ **Coordinates and the state count.** Gate: checkpoint B.
3. ✅ **Phase 1** — tables, search, tests. Radius 8, 2.2 MB, optimal, ~67ms.
4. ✅ **The orbit derivations of §9** — which removed a planned phase rather
   than filling it in.
5. ⬜ **Phase 2, the reduction** — centres solved and wings paired, within the
   24-move set. The expensive one: the wing-pairing coordinate is the `12!`-sized
   problem the partial pattern databases above are for. Gate: measured depth and
   node counts before any tuning.
6. ⬜ **Phase 3 + parity.** Gate: checkpoint E — a drawn state solved, and the
   inverted solution reproducing exactly that state.
7. ⬜ **Generation, `444bf`, benchmarks, documentation.** Gate: checkpoint F.

---

## 13. References

- [WCA Regulations](https://www.worldcubeassociation.org/regulations/) — 4b3 and
  its exceptions; 4x4x4 appears in none of them, so random state is required
- [Sub-Optimal Multi-Phase Path Planning: A Method for Solving Rubik's Revenge](https://arxiv.org/pdf/1601.05744)
  — published multi-phase treatment of exactly this puzzle
- [Which 4x4 scrambler (TNoodle issue #58)](https://github.com/thewca/tnoodle/issues/58)
  — the move to a random-state 4x4x4 scrambler and its three-phase reduction
- [How do 4x4 scrambles work?](https://www.speedsolving.com/threads/how-do-4x4-scrambles-work.95690/)
  — description of the reduction phases and of trying several solutions per
  phase to keep length down
- [Multi-stage random scrambling (4x4x4, etc.)](https://www.speedsolving.com/threads/multi-stage-random-scrambling-4x4x4-etc.3481/)
  — the general "random state, solve it, invert" argument for large puzzles
- This package's own `docs/square1-design.md` — the process this document
  follows, and the record of what happens when a step is assumed rather than
  computed
