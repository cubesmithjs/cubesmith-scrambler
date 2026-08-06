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

### The staged reduction — **plan of record**

Measured inputs, all exact and all cheap:

| | |
|---|---|
| pairing **one** edge, from anywhere | radius **4** (552-entry table) |
| pairing **two** edges of a group | radius 6 (255,024-entry table) |
| finishing the centres | radius ~12 (343,000-entry table, exact) |

Pairing one more edge is therefore always cheap *in isolation*. The whole
difficulty is **preservation**: a stage must pair a new edge without unpairing the
ones already done, and the moves that can pair anything are exactly the moves that
can unpair.

Two ways to handle that were considered. A **bounded search per stage** gives the
shortest solutions but leaves an unknown at the end of it: the only admissible
bound available is radius 4 against a branching factor of 24, so it may not
terminate usefully and would need a stronger bound invented first.

The plan of record is instead **generator-based pairing**, chosen because it can be
shown to work before it is built:

1. Precompute, once, by exhaustive search over the 24-move set, a library of short
   sequences whose net effect is **centre-neutral** — every centre returned to
   where it was — and which move only a few wings.
2. Pair the wings by searching over *those sequences* as the moves, rather than
   over raw turns. Preservation is then structural rather than something the
   search has to be talked into.
3. Land the centres with the exact table, at the point where the remaining centre
   distance can be absorbed.

The cost is length: each generator is several moves and a dozen or more are
needed, so scrambles will run long — plausibly 100 to 200 moves against the ~40 of
official ones. That is an accepted, documented compromise for the first
implementation, on the project's stated priority of correctness before
optimisation, and it is attacked afterwards from a working baseline rather than
instead of one.

**This route is only admissible if the library is provably sufficient**, which is
why generator completeness is a checkpoint of its own (§10, checkpoint G) rather
than something the tests notice later — and, as §11 shows, it is a requirement of
*uniformity* and not merely of reliability.

#### First results, and the length the library actually needs

The exhaustive search is built (`generators.ts`) and its shallow half measured:

| | |
|---|---|
| centre-neutral sequences of ≤ 4 moves | **46,308**, one per distinct wing effect |
| transitive on the 24 wing slots | yes |
| smallest support | **6**, cycle type `[3+3]`, at four moves |
| all generators even permutations | yes, so the group lies inside `A24` |
| generators that **split a slot pair** | **none** |

The last line is the one that matters. Every short centre-neutral sequence maps
slot pairs to slot pairs, so the support-6 members are 3-cycles of *whole edges*:
they rearrange edges that are already paired and cannot pair anything. Applied to
a solved cube they leave it reduced, however much they move.

That is a fact about **length**, not about the approach. The sequences that pair
while restoring the centres are the conjugated ones — slice out, work, slice back
— and those run eight to eleven moves. A depth-4 tree search cannot see them, and
a depth-10 one cannot be walked: `24^10` is out of reach and the centre-distance
prune only bites near the end of a sequence.

A meet in the middle on the centre coordinate would reach them. It turned out not
to be needed, because conjugation reaches them directly: take the setup `A` from
the wide moves, the core `X` from the outer turns, and `A X A'` has the shape of
the pairing algorithms a human uses — slice out, work with outer turns, slice back
— while the wide setup is what makes it split slot pairs, precisely what the
shallow library could not do.

#### The claim that looked structural, and was wrong

The construction was first justified like this:

> An outer turn does not change the centre arrangement **at all**. It permutes four
> identical centres within one face, which is invisible. So `A X A'` has centre
> effect `A . identity . A'` — the identity — and centre neutrality is *structural*,
> not something a search has to discover.

**That is false, and it is worth recording why rather than quietly fixing it.** The
four centres of a face are identical only when the centres are *solved*. After the
setup `A` they are not: `A` is a wide move, it carries centres of one colour into a
face holding another, and an outer turn in the core then permutes centres that
differ. The core does change the arrangement, and the closing `A'` does not have to
undo it.

The error was not caught by the test that should have caught it, because that test
asserted centre-neutrality over the *first 250* members — which, sorted by support,
are the smallest, and on those the claim happens to hold. What exposed it was the
pairing loop, four generators in, reporting the centres unsolved.

So centre-neutrality is now **verified, not argued**: every candidate is run
through the exact centre coordinate (`isCentreNeutral` in `generators.ts`) and kept
only if it returns the solved arrangement to itself.

#### The conjugate library, measured

| | |
|---|---|
| pair-splitting conjugates generated, core ≤ 4 outer turns | 407,832 |
| of those, **actually centre-neutral** | **1,872**, in 5.1s |
| discarded by the verification | 99.5% |
| smallest | support **6**, cycle type `3+3`, at **six moves** |
| supports present | `6:504  8:144  10:576  16:648` |
| transitive on the 24 wings | yes |

The 99.5% is the measure of how wrong the structural claim was. A library a
quarter — in fact very nearly all — of whose members corrupt the centres would have
produced scrambles that pass every wing-level assertion and are simply not
reduced.

#### Checkpoint G — **passed**, on the verified library

The group the 1,872 verified generators generate in their action on the 24 wings is
**exactly `A24`**, proved in four steps, each either a classical theorem or a
computation small enough to live in `completeness.test.ts`:

1. **Inside `A24`.** Every generator is an even permutation of the wings — a
   conjugate `A X A'` has the parity of `X`, and each outer turn acts on the wings
   as two 4-cycles, which is even. Checked over all 1,872.
2. **Primitive**, via the stronger property that the group is **2-transitive**: the
   orbit of an ordered pair of wing slots is all `24 x 23 = 552` ordered pairs.
3. **Contains a bare 3-cycle**, exhibited as a **commutator** `[a, b]` of a
   support-6 generator with a library member.

   The route changed here when the library shrank, and the reason is structural.
   Every generator has a *doubled* cycle type — `3+3`, `4+4`, `5+5`, `2+2+3+3`,
   never a lone cycle — because the core is outer-only, outer turns preserve the two
   12-wing orbits and act on them as mirror images, so the core does the same thing
   twice and conjugation preserves cycle type. Measured consequence: **no product of
   two generators has support below 4**, so the old product-of-two exhibition is not
   merely unlucky on the smaller library, it is impossible on any library of this
   construction. A commutator has no such obstruction and yields a 3-cycle on the
   first scan.
4. **Jordan's theorem**: a primitive group of degree `n` containing a 3-cycle
   contains `A_n`. With step 1, the group is therefore exactly `A24`.

Completeness follows in two lines. `A24` reaches every arrangement of the same
parity as the one it starts from, and paired arrangements exist in **both**
parities — swapping the two wings inside one slot pair keeps an arrangement paired
while flipping its parity. So whatever parity a drawn state has, a paired
arrangement of that parity is reachable.

That is what makes the staged pairing **total**, and per §11 totality is a
*uniformity* requirement rather than a reliability nicety: a solver that failed on
some states would silently condition the distribution.

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

**Checkpoint G — generator completeness.** ✅ **Passed** — see §6. The group is
exactly `A24`, by evidence of the first kind below. *The generator library must be
shown sufficient to reach every valid edge-pairing configuration.* This is a gate,
not an assumption, and it is the one thing that makes the staged route admissible
at all.

Acceptable evidence, in order of preference:

1. **A proof with a computational input.** Compute the order of the group the
   library generates in its action on the 24 wings, by Schreier-Sims — a standard
   algorithm, entirely tractable on 24 points with a handful of generators. If that
   group contains the alternating group `A24`, completeness follows from a two-line
   argument: `A24` acting on any arrangement reaches every arrangement of the same
   parity, and the paired configurations include arrangements of **both** parities,
   so the orbit must meet them. Both halves are checkable — the group order by
   computation, the parity claim by exhibiting one paired arrangement of each
   parity.
2. **A published reference** establishing the same for an equivalent generator set,
   cited precisely rather than gestured at.
3. **Exhaustive verification** over a state space small enough to enumerate. Note
   that this cannot be the full wing space (`24!`), so an exhaustive check has to be
   over an abstraction, and the abstraction has to be a *homomorphic projection*
   for the result to transfer — the same standard every pruning table in this
   package is held to.

If the group turns out **smaller** than `A24`, the finding is reported and the
library extended with further generators until it is not — and the check re-run
rather than argued around.

**Checkpoint H — uniformity.** §11 states the argument; the checkpoint is that each
of its links is either tested or proved, and that the one empirical link — solver
totality — is measured over a large sample rather than inferred from a handful of
solves.

---

## 11. Why the output is a uniform random state

Producing *legal* scrambles is not the claim Regulation 4b3 makes. The claim is "a
random state from all states that require at least 2 moves to solve, **equal
probability for each state**". This section is the argument that the pipeline
delivers that, link by link, so checkpoint H has something specific to verify.

### The pipeline

```
  draw S uniformly  ->  reject if S is fewer than 2 moves from solved  ->
  solve: find sigma with sigma(S) = solved  ->  print sigma inverted
```

### Where the randomness enters, and where it does not

**The state is sampled once, at the start, and nothing downstream touches it.**
`randomCube444State` draws each factor independently — `8!` corner permutations,
`3^7` orientations with the eighth forced, `24!` wing permutations, a shuffled
multiset of centre colours — in a fixed frame. Checkpoint B is what licenses
treating that as uniform over positions: the factor sizes multiply to exactly the
published `7.4 x 10^45`, and the two claims that make the product a product (no
parity constraint linking wings to corners; the twist sum invariant mod 3) are
tested rather than assumed.

Drawing in a fixed frame produces each *physical* position exactly 24 times, one
per whole-cube rotation, so the marginal over positions is uniform. For `444bf`
that is not a compromise but the mechanism: an even cube has no fixed centre, so
its orientation is not observable, and the frame draw **is** Regulation 4b3a's
random orientation. No orientation suffix is needed, unlike `333bf` and `555bf`
where the puzzle does have observable centres. Whether to emit one anyway, for
consistency with what competitors are used to seeing, is a presentation question
and not a compliance one.

### The reduction and the pairing do not change the distribution

This is the link most likely to be doubted, so it is worth being exact about what
the solver is.

The reduction, the staged pairing, the generator library, the phase order — all of
it runs **after** `S` is fixed, and its only output is a move sequence `sigma` with
`sigma(S) = solved`. It is a *witness*, not a sampler. Two consequences:

- **The solver's quality is irrelevant to uniformity.** Optimal or wasteful, 40
  moves or 200, staged or single-search — none of it can shift the distribution of
  `S`, because `S` was drawn before the solver was called and is not modified by
  it.
- **Even a randomised solver is safe.** If a stage picks among equally good
  generators at random, that changes *which* valid sequence is printed, never
  *which state* it encodes.

What the staging *does* affect is the **length** distribution, and that is worth
stating rather than hiding: length will be dominated by the number of stages, not
by how scrambled the drawn state was. That is the opposite of the leak the length
floor elsewhere in this package guards against (`core/scramble-shape.ts`) — a
Square-1 or Skewb scramble printed at its optimal length advertises an easy state,
whereas a staged 4x4x4 scramble is long almost regardless of `S`.

### No two source states share a scramble

The map from `S` to the printed scramble is **injective**, and the reason is
immediate: applying the printed scramble to a solved cube yields exactly `S`, since
`sigma(S) = solved` and therefore the inverse of `sigma` carries solved back to
`S`. The state is recoverable from the scramble, so two distinct states cannot
produce the same one. There is no collision through which probability mass could
pile up.

That is also exactly what checkpoint E tests, and why it is phrased as "reproduces
the *exact* state drawn" rather than "produces a scrambled cube".

### Why rejection, solving and inversion each preserve uniformity

- **Rejection.** The conditional distribution of a uniform draw is uniform on the
  condition, so redrawing until `S` is at least 2 moves from solved leaves the
  survivors uniform over the qualifying states — *provided the test is exact*. Ours
  is: fewer than 2 moves from solved means solved or one move from solved, so it is
  one solvedness check plus one per move, with no estimation anywhere. Rejecting on
  an *approximate* test would discard qualifying states whose estimate read low and
  bias what remained, which is the trap Square-1's 4b3d check was built to avoid.
- **Solving.** A deterministic function of `S` that does not modify `S`; see above.
- **Inversion.** A bijection on move sequences, and the identity "inverse of sigma
  applied to solved gives `S`" is what makes the printed sequence encode the drawn
  state rather than merely resemble one.

### The one link that is not free: solver totality

Every argument above assumes the solver **succeeds on every drawn state**. If it
fails on some subset — a staged pairing that gets stuck, a generator library too
small to finish some arrangement — and generation responds by drawing again, then
the output is uniform *conditional on solvability*, which is uniform over the whole
space only if solvability is universal. **A partial solver silently conditions the
distribution**, and does so in a way no amount of statistical testing on the output
is likely to reveal, because the excluded set is defined by an obscure property
rather than a visible one.

That is why checkpoint G is not a reliability nicety. **Generator completeness is a
uniformity requirement**, and it is the reason the staged route must prove its
library sufficient before the generator ships rather than after.

Two consequences for the implementation:

1. Generation must **never** silently redraw on solver failure. A failure is a
   thrown error — a bug signal — not a retry, so any gap in completeness surfaces
   loudly instead of quietly biasing the distribution.
2. Totality is also measured empirically over a large sample, as the second half of
   checkpoint H, because a proof about the group and a working implementation of it
   are different claims.

---

## 12. Milestones

Each ends in a commit and a report, and each has a gate:

1. ✅ **Piece model + bijection to the facelet oracle.** Gate: checkpoint A.
2. ✅ **Coordinates and the state count.** Gate: checkpoint B.
3. ✅ **Phase 1** — tables, search, tests. Radius 8, 2.2 MB, optimal, ~67ms.
4. ✅ **The orbit derivations of §9** — which removed a planned phase rather
   than filling it in.
5. ✅ **Phase 2, the reduction — generator-based staged pairing** (§6, plan of
   record). Centres onto their axis pairs, centres solved exactly (343,000-entry
   table), wings paired over the verified centre-neutral library plus the
   support-4 gadgets that the last-two-edges case needs. Checkpoint G re-proved on
   the verified library. Measured: 25 of 25 random states reduced, 64 moves mean.
6. ✅ **Phase 3, the 3x3x3 hand-off and parity.** The conversion is a homomorphism
   over all thirty-six outer turns, with the edge-flip reference bits derived from
   the 3x3x3 module rather than tabulated. Parity is fixed by a **derived** gadget
   — a centre-neutral sequence that is odd on the wings — applied with a fresh
   pairing, and a different gadget each pass, because one gadget provably cycles.
   The targeted gadget for the permutation mismatch was shown **not to exist** in
   the pair-preserving family, where dedge and corner parity are locked together.
7. ✅ **Generation, `444bf`, checkpoint E.** `444` and `444bf` are registered and
   reachable through `generateScramble`. `444bf` is the only blindfolded event with
   **no** orientation suffix, because an even cube has no observable orientation and
   the frame draw already is 4b3a's randomisation (§11) — `nxn/orientation.ts`
   enforces that by throwing. Checkpoint E holds: the solution's inverse applied to
   solved reproduces the drawn state exactly, which is the injectivity §11 needs.
   Measured: 137 moves mean, 205 worst, ~1.8s per scramble warm.

   Still open, and not blocking correctness: **checkpoint H's empirical half** —
   totality measured over a large sample rather than the dozens run so far — plus
   length and speed, both of which are consequences of the staged route and were
   accepted as such.
   **checkpoint H** — every link of §11 tested or proved, including solver totality
   measured over a large sample. Only then does the README say done.

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
