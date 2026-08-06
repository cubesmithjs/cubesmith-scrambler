# 3x3x3 — design document

Written *after* the implementation, to record what `src/puzzles/333/` actually
does. Numbers are read off the code or measured, never recalled. One
conformance gap found while writing this is recorded in §8 rather than quietly
fixed.

Covers `333` and its three variant registrations: `333fm`, `333oh` and `333bf`.

---

## 1. Overview

### WCA event

**`333` — 3x3x3 Cube**, plus:

| Event | Relationship |
|---|---|
| `333fm` | Fewest Moves — **plain alias**. Same puzzle, same scramble; only the human constraint differs. |
| `333oh` | One-Handed — **plain alias**, same reasoning. |
| `333bf` | 3x3x3 Blindfolded — **not** an alias. Regulation 4b3a additionally requires a random puzzle orientation. |

Regulation **4b3** applies with no exception: random state, at least **2** moves
to solve, equal probability for each state. None of 4b3a–4b3f alters the method
for `333` itself; 4b3a adds a requirement for `333bf`.

### Goal of the implementation

Draw a uniformly random, physically reachable cube state and print the inverse
of a near-optimal solution. "Near-optimal" is the honest word: the state space
is `4.3 × 10^19`, so a single exact distance table is impossible and the solver
uses Kociemba's two-phase decomposition — each phase optimal in itself, the
split giving up global optimality. Official scramblers make the same trade.

### References used

- WCA Regulations 4b3, 4b3a.
- Herbert Kociemba's published two-phase **method** — the group-theoretic
  decomposition `G = ⟨U,D,L,R,F,B⟩ → G1 = ⟨U,D,L2,R2,F2,B2⟩ → solved`, and the
  IDA\*-with-pruning-tables technique. No project's source expression of it was
  read; see the repository's independence note.
- Rokicki, Kociemba, Davidson and Dethridge, *The Diameter of the Rubik's Cube
  Group Is Twenty* — context for how far from optimal a two-phase solution is.
- Standard published invariants of the cube group, used as cross-checks.

### Files

| | |
|---|---|
| `geometry.ts` | rotation matrices → the six base move tables |
| `move-tables.ts` | all 18 moves, composed from the six |
| `state.ts` | the cubie-level state |
| `coordinates.ts` | phase-1 coordinates and the `G1` test |
| `phase2-coordinates.ts` | phase-2 coordinates |
| `phase1-tables.ts` / `phase2-tables.ts` | per-move coordinate transitions |
| `phase1-pruning.ts` / `phase2-pruning.ts` | BFS-built admissible heuristics |
| `phase1-search.ts` / `phase2-search.ts` | the two IDA\* searches |
| `random-state.ts` | the uniform, parity-correct draw |
| `solve.ts` | `solve333`, `generate333Scramble`, registration |
| `../variants.ts` | `333fm` / `333oh` / `333bf` registration |

---

## 2. Notation

### Supported notation

Standard WCA face-turn notation, from the shared `src/notation/move.ts`: six
faces `U D F B L R`, three amounts.

| Token | Meaning |
|---|---|
| `R` | quarter turn clockwise, viewed from outside that face |
| `R2` | half turn |
| `R'` | quarter turn counterclockwise |

All eighteen are used. There are no wide moves, no slice moves and no rotations
in a `333` scramble — which is precisely why `333bf` needs something extra (§5).

### Parsing rules

`parseMove` accepts `/^([UDFBLR])(2|')?$/`. A bare letter is amount 1, `2` is
amount 2, `'` is amount 3. Anything else throws with the offending token in the
message. `state.test.ts` round-trips a written algorithm through
`parseMove → applyMoves → movesToString`.

### Rendering rules

`moveToString` renders amount 1 bare, 2 as `2`, 3 as `'`; `movesToString` joins
with single spaces. `3` and `R1` are never emitted.

The search prunes consecutive moves on the same face, so no rendered scramble
ever contains `R R'` or `R R2` — not because the renderer forbids it, but
because no such sequence is ever produced.

### Examples

A real generated scramble from the shipped build:

```
U F2 D B2 F2 R2 B2 R2 D R2 D2 B2 U2 B' R' U' F' U R D F R' D
```

Its shape is characteristic of a two-phase solve read backwards: the tail is
phase 1's quarter turns and the head is phase 2's half-turn-heavy `⟨U,D,L2,R2,F2,B2⟩`
segment. A `333bf` scramble is the same thing with a wide-move suffix:

```
… U2 F2 U' Uw Fw2
```

---

## 3. State model

### Internal representation

```ts
interface CubeState {
  cornerPermutation: readonly number[]; //  8 entries
  cornerOrientation: readonly number[]; //  8 entries, 0..2
  edgePermutation:   readonly number[]; // 12 entries
  edgeOrientation:   readonly number[]; // 12 entries, 0..1
}
```

Cubie-level, not facelet-level, because the coordinate reduction the two-phase
search needs is a statement about pieces and their orientations. Every array is
indexed **by slot**: `edgePermutation[i]` is which piece currently sits at slot
`i`.

### Coordinate system

Corners at `x,y,z ∈ {-1,1}`, edges at the twelve vectors with exactly one zero
coordinate. Both lists are explicit in `geometry.ts` and every move table is
derived from them by rotation.

**Corner orientation** — `0` means the corner's Y-facelet points along Y; `1`
and `2` walk it around the other two axes in a cyclic order that flips with the
corner's chirality `x·y·z`. Getting that flip wrong is the classic way to build
a model in which the total-twist invariant fails for no visible reason.

**Edge orientation** — flips exactly on `F` and `B` turns, for every edge they
move, and never on `U`/`D`/`L`/`R`. This is the standard classification and is
encoded directly rather than derived from a per-edge reference vector: an edge
has only two orientation states and the classification is unambiguous. The
group-invariant tests then check it.

The search works on six derived integer coordinates:

| Phase | Coordinate | Size |
|---|---|---|
| 1 | `twist` — corner orientation, base 3 over 7 slots | 2,187 |
| 1 | `flip` — edge orientation, base 2 over 11 slots | 2,048 |
| 1 | `udSlice` — which 4 of 12 edge slots hold an E-slice piece | 495 |
| 2 | `cornerPerm` | 40,320 |
| 2 | `edge8Perm` — the 8 non-slice edges | 40,320 |
| 2 | `udSliceOrder` — the 4 slice edges *within* the slice | 24 |

Orientation coordinates are positional-number encodings, safe to compute from a
formula. The combinatorial ones index into an exhaustively generated canonical
list, so encode and decode are inverses by construction rather than by whether a
ranking formula was remembered correctly. `SOLVED_UD_SLICE_COORD` is *computed*
from the solved state rather than hardcoded to 0 — `[8,9,10,11]` is the **last**
4-subset in lexicographic order, not the first, and assuming otherwise would be
an off-by-494 error that still typechecks.

### Invariants

Three, and every reachable state satisfies all three:

1. **Corner and edge permutation parity match.** A face turn is a 4-cycle on
   corners and a 4-cycle on edges — both odd — so the two parities move
   together.
2. **Total corner twist `≡ 0 (mod 3)`.** One corner cannot be twisted alone.
3. **Total edge flip is even.** One edge cannot be flipped alone.

Together these cut the naive `8!·3^8·12!·2^12` by a factor of 12, giving the
published group order

```
43,252,003,274,489,856,000 = 8! · 3^7 · 12! · 2^11 / 2
```

All three are asserted over random sequences from solved (`state.test.ts`) —
that is, they are *properties of the derived move tables*, not assumptions the
model was built on.

### Solved state

Identity permutations, zero orientations. `isSolved` compares against exactly
that. Because a `333` scramble contains only single-layer turns, a centre never
moves and the frame is never ambiguous — which is exactly the fact that makes
4b3a non-trivial for `333bf` (§5).

---

## 4. Move model

### Primitive moves

Eighteen: six faces × three amounts.

The six quarter turns are derived by applying a 90° rotation matrix
(`utils/vec3.ts`'s `rotateQuarter`, shared with `puzzles/nxn/`) to piece
positions and to orientation reference vectors, gated on the piece actually
being on the turning layer. The module comment records that this was
cross-checked against physical "clock face" reasoning during development and
that *the two disagreed on a first pass* — which is the whole argument for
deriving rather than transcribing.

### Composition

`composeSelf` builds amounts 2 and 3 from the quarter turn by repeated
application. `applyMoves` folds a sequence left to right.

The phase tables are built one level further out: decode a coordinate into a
concrete `CubeState`, run it through the already-tested `applyMove`, re-encode.
Nothing re-derives the mechanics a second time, so there is no second place for
them to be wrong — and `phase1-tables.test.ts` still cross-checks a long random
coordinate-space walk against the same walk on a full state.

### Move legality

All eighteen moves are legal in every state. Two restrictions apply during
search and are not properties of the puzzle:

- **Phase 2 is restricted to the ten `G1`-preserving moves**: any amount of `U`
  or `D`, plus only the half turns of `L R F B`. A quarter turn of `F`, `B`, `L`
  or `R` twists corners or flips edges and so leaves `G1`. `coordinates.test.ts`
  verifies this empirically rather than taking it on trust.
- **No two consecutive moves on the same face**, in both searches — an
  optimisation, since such a pair always collapses.

### Inverses

`inverseMove` maps amount `a → 4 - a`; `inverseMoves` reverses and inverts. Both
move sets are closed under inversion, which is what makes the BFS-from-solved
pruning tables valid: the transition graph is symmetric, so a `d`-move path
outward from solved is exactly a shortest `d`-move path back.

---

## 5. Scramble generation algorithm

### High-level algorithm

```
1. draw a uniformly random reachable state
2. phase 1: IDA* to the nearest state in G1        (optimal)
3. phase 2: IDA* from there to solved              (optimal, given the entry)
4. print the inverse of the concatenated solution
```

### The two phases

|  | Phase 1 | Phase 2 |
|---|---|---|
| Goal | reach `G1` — all pieces oriented, slice edges in the slice | solved |
| Move set | all 18 | the 10 `G1`-preserving moves |
| Coordinates | `twist × flip × udSlice` | `cornerPerm × edge8Perm × udSliceOrder` |
| Heuristic | `max(dist(twist,udSlice), dist(flip,udSlice))` | `max(dist(cornerPerm,order), dist(edge8Perm,order))` |
| Table sizes | 1,082,565 + 1,013,760 bytes | 967,680 + 967,680 bytes |
| Table maxima | 9 and 9 | 14 and 12 |

Each pruning table is an exact BFS distance over a *projection* of the state —
a coordinate pair with the third coordinate forgotten. A projection is
homomorphic (every move acts on the projection using only the projection), so
any real solution also solves the projection in the same number of moves, and
the projection's shortest distance can never exceed the truth. The maximum of
two lower bounds is a lower bound. That is the admissibility argument, and
`phase1-pruning.test.ts` checks the consequence directly: after `N` random
moves the heuristic never exceeds `N`.

The full three-coordinate phase-1 space (~2.2 billion) is never built.

### Random-state vs random-move

**Random-state.** 4b3e does not name the 3x3x3.

### Uniformity argument

`randomState` draws:

- both permutations uniformly by Fisher–Yates, then flips the **edge**
  permutation's parity with a single swap when it does not match the corner
  permutation's. That swap is a bijection from the wrong-parity half onto the
  right-parity half, so the result is uniform *over the states that satisfy the
  constraint* — not merely inside it. Redrawing until the parities matched would
  also be uniform; patching by anything that is not a bijection would not be.
- the first 7 corner twists uniformly from `{0,1,2}`, the 8th forced to make the
  sum `≡ 0 (mod 3)`.
- the first 11 edge flips uniformly from `{0,1}`, the 12th forced to make the
  sum even.

Each forced entry is a function of the free ones, so each is a bijection from
the free space onto the legal space: uniform in, uniform out. The state
distribution is therefore uniform over all `4.3 × 10^19` reachable states.

The solver's *choices* do not affect this. Which solution is found changes only
the printed sequence, never the state it reaches.

### The variants

`333fm` and `333oh` call `generate333Scramble` directly — same puzzle, same
scramble, and a scramble knows nothing about how a human is allowed to solve it.

`333bf` is different. Regulation 4b3a:

> For blindfolded events, the scramble sequence must orient the puzzle randomly
> (equal probability for each orientation).

A `333` scramble is all single-layer turns, so it never moves a centre and
always leaves the cube white-up green-front. For a blindfolded solve the
starting orientation is part of what must be memorised. So `333bf` appends a
wide-move suffix drawn uniformly from **24** shortest representatives, one per
cube orientation, found by breadth-first search rather than by assuming a
vocabulary — the obvious `Rw^a Fw^b` construction reaches only 16 of the 24 and
could not give equal probability. Measured suffix lengths: one of length 0, nine
of length 1, fourteen of length 2.

The 4b3 floor for `333bf` is checked **after** the suffix, on the rendered
string, because a wide move is a whole-puzzle rotation composed with a turn and
therefore moves the state as well as reorienting it. The full argument, and the
review that produced it, is in `docs/blindfolded-review.md`; the machinery lives
in `puzzles/nxn/orientation.ts` and is documented in `docs/nxn-design.md`.

### WCA compliance

| Requirement | `333` / `333fm` / `333oh` | `333bf` |
|---|---|---|
| 4b3 random state, equal probability | ✅ `random-state.ts` | ✅ same draw |
| 4b3 at least 2 moves to solve | ⚠️ **not enforced** — see §8 | ✅ `withMinimumDistance`, checked after the suffix |
| 4b3a random orientation, uniform over 24 | n/a | ✅ `orientationSuffixes` |

---

## 6. Validation

### Existing tests

Eleven test files, `src/puzzles/333/*.test.ts`.

| Test | What it rules out |
|---|---|
| every face move has order 4 | a wrong rotation matrix or destination |
| `amount=2`/`3` equal repeated `amount=1` | a composition error |
| known finite-order facts about the cube group | a plausible-but-wrong move table |
| the three conservation invariants across random sequences | a broken orientation model |
| sequence followed by its inverse returns to solved | a non-invertible table |
| `udSliceCoord` agrees with a brute-force count | a wrong combinatorial rank |
| `udSliceCoord` round-trips all 495 values; both permutation coordinates all 40,320 | an encode/decode mismatch |
| `U`/`D` any amount and all half turns stay in `G1`; quarter turns of `F B L R` leave it | a wrong phase-2 move set |
| every `(twist, udSlice)` and `(flip, udSlice)` pair reachable | a table with holes the search would trust |
| BFS layering consistent in all four tables | a corrupted BFS |
| **heuristic never exceeds the true distance** after `N` random moves | an inadmissible heuristic — the one error that would silently produce wrong-length solutions |
| every real `G1` state has a visited phase-2 distance | a phase boundary the second phase cannot start from |
| coordinate-space walks match full-state walks | transition tables drifting from `applyMove` |
| phase 1 reaches `G1`, phase 2 reaches solved | end to end |

### Independent verification

- **Group invariants.** The three conservation laws are checked as *outputs* of
  the derived move tables over random sequences, not asserted as inputs. A model
  with a mis-signed twist reproduces at most two of the three.
- **Table maxima.** Built from scratch: phase-1 projections top out at **9**
  moves, phase-2 at **14** (corners) and **12** (edges). These are properties of
  the projections, computed here rather than quoted.
- **Round trip.** Every generated scramble is applied to a solved cube and
  re-solved; the whole chain — draw, solve, invert, render, parse, apply — has
  to close.

### Edge cases

- **Already solved / already in `G1`.** Both searches return `[]` immediately.
- **Unreachable input.** `phase1Search` throws rather than looping forever if no
  path to `G1` exists.
- **Very easy states.** Handled, but not filtered — see §8.
- **Solution length.** Measured over 60 fresh scrambles: **20 to 26 moves**,
  mean 23.2. No padding is applied and none is needed; a two-phase solution is
  never short enough to leak that a state was easy. (God's number is 20, so a
  two-phase solution runs roughly 3–6 moves long — the documented cost of the
  split.)

---

## 7. Complexity

### Time complexity

| Step | Cost |
|---|---|
| Move tables | 18 tables over 8+12 pieces — negligible |
| Phase-1 transition tables | `18 × (2,187 + 2,048 + 495)` full-state applications |
| Phase-2 transition tables | `10 × (40,320 + 40,320 + 24)` full-state applications |
| Phase-1 pruning BFS | `2 × ~1M` entries × 18 moves |
| Phase-2 pruning BFS | `2 × 967,680` entries × 10 moves |
| Draw | `O(1)` |
| Search | IDA\*, exponential in the gap between the heuristic and the truth |

The search is where the variance lives. The heuristic is a genuine lower bound
but not a tight one, so the number of nodes expanded varies by two orders of
magnitude between states — which is exactly what the measured spread below
shows.

### Memory usage

| | |
|---|---|
| Phase-1 pruning tables | 1,082,565 + 1,013,760 B ≈ **2.1 MB** |
| Phase-2 pruning tables | 2 × 967,680 B ≈ **1.9 MB** |
| Phase-2 transition tables | `10 × (40,320 + 40,320 + 24)` entries as JS `number[][]` ≈ **6.5 MB** |
| The 8-permutation list (40,320 arrays of 8) + its string-keyed index map | ≈ **20 MB** |
| Total, steady state | **~30 MB**, built once per process |

The permutation *list* dominates, not the pruning tables — the price of ranking
by generated table rather than by formula. (One list serves both permutation
coordinates: corner permutation and the 8 non-slice edges are ranked against the
same `PERMUTATIONS_8`.)

### Expected scramble generation time

Measured on the development machine (Windows 11, Node 22.14):

| | |
|---|---|
| Cold — first `generateScramble('333')` in a fresh process | **7.6 s** |
| Steady state, `npm run bench` | **89.6 ms** mean |
| Steady state, public async API, 60 draws | median **68 ms**, mean 158 ms, p90 280 ms, worst 2.2 s |
| `333bf` | cold 9.2 s, median 113 ms |

The long tail is real and is a property of IDA\* with a loose heuristic, not of
a particular state being "hard" in any intuitive sense.

---

## 8. Known limitations

### Current bugs

**The 4b3 two-move floor is not enforced for `333`, `333fm` or `333oh`.**

`docs/blindfolded-review.md` §4.1 records this floor being added and states it
was "applied to `333`, `555`, `666`, `777` and both blindfolded events". For the
NxN events and for `333bf` that is accurate. For plain `333` it is not:
`register333Scrambler` (`puzzles/333/solve.ts:37`) registers
`generate333Scramble` directly, with no `withMinimumDistance` wrapper, and
`variants.ts` registers `333fm` and `333oh` the same way. Only the blindfolded
path goes through the check.

- **Impact:** a scramble could in principle be produced from a state 0 or 1
  moves from solved. There are 19 such states out of `4.3 × 10^19`, so the
  probability is about `4 × 10^-19` per scramble — it will not be observed.
- **Why it still matters:** it is the same argument the review itself makes —
  the regulation states a requirement, not a likelihood, and "too unlikely to
  happen" is not "cannot happen". The review's own §5 summary table claims this
  as fixed for `333`.
- **Fix:** wrap the three registrations in `withMinimumDistance(3, …)` exactly
  as `generate333BlindfoldedScramble` does. `cubeScrambleIsFarEnough` already
  parses a rendered scramble and applies it to a facelet cube, so it works
  unchanged on a `333` scramble string. Seeded output would not change — the
  first draw passes with probability `1 − 4 × 10^-19` — so this is additive, not
  a behaviour change. Not applied here, because this document's remit is to
  describe the implementation; it is flagged for a decision.

### Rough edges, stated plainly

1. **The solve is not optimal.** Each phase is optimal in itself, but the split
   gives up global optimality: measured solutions run 20–26 moves against a
   diameter of 20. Official scramblers accept the same trade, and for a
   *scramble* the length only has to be long enough not to leak difficulty.
2. **No phase-boundary sweep.** The phase-1 solution is taken as found rather
   than trying several `G1` entries and keeping the best total — which is the
   standard way two-phase solvers close most of the gap above, and which
   `puzzles/square1/` does do. Adding it would cost time per scramble and buy
   length that no requirement asks for.
3. **A ~7.6 s cold start**, for the same reason as every other table-driven
   puzzle here: tables are built lazily in memory rather than shipped
   serialized.
4. **~30 MB steady-state memory**, most of it the two 40,320-entry permutation
   lists and their index maps. A Lehmer-code rank would remove nearly all of it,
   at the cost of a hand-written formula the package deliberately avoids.
5. **Same-face seam at a `333bf` suffix.** About one blindfolded scramble in six
   ends with the scramble's last move and the suffix's first move on the same
   face (`… U Uw`). Legal, distribution-neutral, cosmetic; deliberately deferred
   in `docs/blindfolded-review.md` §4.4.

### Planned improvements

- Enforce the 4b3 floor on `333`/`333fm`/`333oh` (above).
- Ship serialized pruning tables.
- Consider a phase-boundary sweep if solution length ever becomes a goal.

---

## 9. References

### WCA regulations

- [WCA Regulations](https://www.worldcubeassociation.org/regulations/) — 4b3
  (random state, at least 2 moves, equal probability), 4b3a (random orientation
  for blindfolded events), 4b3e (the random-moves exception the 3x3x3 is not
  in).

### Algorithms

- Herbert Kociemba, [*The Two-Phase Algorithm*](http://kociemba.org/cube.htm) —
  the `G → G1 → solved` decomposition, the coordinate reduction, and the
  pruning-table technique. The **method** is used; no implementation was read.
- Richard E. Korf, *Depth-First Iterative-Deepening: An Optimal Admissible Tree
  Search*, Artificial Intelligence 27(1), 1985 — IDA\*.
- Morwen B. Thistlethwaite's four-stage algorithm — the ancestor of the
  two-phase decomposition, and the origin of the `⟨U,D,L2,R2,F2,B2⟩` subgroup
  used here as `G1`.

### Published figures used as cross-checks

- Tomas Rokicki, Herbert Kociemba, Morley Davidson, John Dethridge, *The
  Diameter of the Rubik's Cube Group Is Twenty*, SIAM J. Discrete Math. 27(2),
  2013 — [cube20.org](https://cube20.org/). Context for §6's solution lengths.
- The group order `43,252,003,274,489,856,000` and the three conservation
  invariants — standard, and reproduced here from the derived move tables rather
  than assumed.

### Related documents in this repository

- `docs/blindfolded-review.md` — 4b3a conformance, and the review that added the
  two-move floor (including the claim §8 corrects).
- `docs/nxn-design.md` — the orientation-suffix machinery `333bf` uses.
- `docs/222-design.md` — the same puzzle family where one exact table still fits.
- `docs/444-design.md` — where this decomposition is not enough.
