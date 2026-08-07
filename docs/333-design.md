# 3x3x3 — design document

Written *after* the implementation, to record what `src/puzzles/333/` actually
does. Numbers are read off the code or measured, never recalled. One
conformance gap found while writing this is recorded in §8 rather than quietly
fixed.

Covers `333`, its three variant registrations (`333oh`, `333bf` and `333mbf`),
and `333fm` — which used to be a variant registration and is now a puzzle of
its own (§5a). Multi-blind is §5b.

---

## 1. Overview

### WCA event

**`333` — 3x3x3 Cube**, plus:

| Event | Relationship |
|---|---|
| `333oh` | One-Handed — **plain alias**. Same puzzle, same scramble; only the human constraint differs. |
| `333fm` | Fewest Moves — **not** an alias. Every official FMC scramble is padded `R' U' F` … `R' U' F`. See §5a. |
| `333bf` | 3x3x3 Blindfolded — **not** an alias. Regulation 4b3a additionally requires a random puzzle orientation. |
| `333mbf` | Multi-Blind — the same scramble as `333bf`, drawn `count` times. See §5b. |

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
| `search-restrictions.ts` | the end-axis restriction both searches accept |
| `fewest-moves.ts` | `333fm` — the `R' U' F` padding and its registration |
| `../variants.ts` | `333oh` / `333bf` / `333mbf` registration |

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

`333oh` calls `generate333Scramble` directly — same puzzle, same scramble, and
a scramble knows nothing about how a human is allowed to solve it.

`333fm` does not; see §5a.

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

| Requirement | `333` / `333oh` | `333fm` | `333bf` |
|---|---|---|---|
| 4b3 random state, equal probability | ✅ `random-state.ts` | ✅ same draw, unrestricted (§5a) | ✅ same draw |
| 4b3 at least 2 moves to solve | ✅ `generate333ScrambleWithFloor` | ✅ `withMinimumDistance`, checked on the padded sequence | ✅ `withMinimumDistance`, checked after the suffix |
| 4b3a random orientation, uniform over 24 | n/a | n/a | ✅ `orientationSuffixes` |
| Official FMC padding | n/a | ✅ `R' U' F` both ends, seams axis-restricted | n/a |

---

## 5a. `333fm` — the Fewest Moves padding

`333fm` was registered as a plain alias for `333` until this section was
written. That was wrong, and unlike the rest of §8 it was wrong *visibly*: an
FMC competitor knows their scramble starts `R' U' F`.

### What the official program does

TNoodle gives Fewest Moves a puzzle class of its own,
`ThreeByThreeCubeFewestMovesPuzzle`, registered as `THREE_FM` separately from
the `THREE` that serves `333` and `333oh`. It wraps every scramble:

```
R' U' F   <a 3x3x3 scramble>   R' U' F
```

Two reasons, both from the wca-admin discussion its source quotes:

1. A two-phase solver's output contains a visible orientation step, and with
   EO-first methods a competitor could read part of their own solution off the
   scramble. `R' U' F` is a quarter turn on all three axes, so it guarantees at
   least one badly-oriented edge in every orientation — "solving EO optimally
   can't be derived from the scramble".
2. An easy state gives a short solution, and a visibly short sequence
   advertises an easy scramble before anyone touches the puzzle. Six extra
   moves make the printed length ordinary regardless. This is the same leak §2
   of `core/scramble-shape.ts` describes for scramble length.

### Why it is not string concatenation

The padding only works if it survives into the printed sequence. An inner
scramble starting with `F` would print `… U' F F …`, which merges to `F2`, and
both reasons above would be partly undone.

TNoodle prevents this by restricting the **axis** the *solution* may begin and
end on, passing the restriction into min2phase's search
(`SearchWCA.solution(…, firstAxisRestriction, lastAxisRestriction)`; its
`str2axis` maps a face to `index / 3 % 3`, so a restriction on `F` bars `B`
too). It then assembles the three pieces with `MergingMode.NO_MERGING`, which
its own source documents as "blindly append moves".

The two restrictions are **different axes**, derived from the padding rather
than fixed:

| Seam | Adjacent padding move | Barred axis for the inner scramble |
|---|---|---|
| prefix → scramble | the prefix's **last** move, `F` | `FB` on the scramble's **first** move |
| scramble → suffix | the suffix's **first** move, `R'` | `RL` on the scramble's **last** move |

Reading both as `F` is the easy mistake, and `fewest-moves.ts` derives them
from `FEWEST_MOVES_PREFIX`/`_SUFFIX` so they cannot drift apart from the
padding they protect.

Because the scramble is the *inverse* of the solution, the two restrictions
swap ends before reaching the solver: the scramble's first move is the inverse
of the solution's last, and vice versa. Inverting never changes a move's face,
so the axis carries over unchanged — only which end it applies to flips.

### Why the restriction lives inside the search

This is the part that matters for 4b3, and the tempting shortcut is wrong.

The restriction is a property of the **solution**, not of the state. Drawing a
state, solving it and redrawing when the solution's ends are unsuitable would
exclude that state *permanently* — the solver is deterministic, so a state
whose solution fails the test fails it every time. Roughly one state in nine
would become unreachable, and 4b3 asks for "equal probability for each state".

So `phase1Search` and `phase2Search` take an optional `EndAxisRestrictions`
instead. A goal node reached by a barred final move simply isn't treated as a
goal, and the search continues to a conforming (sometimes one move longer)
solution. The heuristic stays admissible — it lower-bounds the distance to the
goal, and a restricted route can only be longer — so IDA\* is still correct.
Every state still gets solved, so the draw is untouched. `fewest-moves.test.ts`
asserts exactly that: over many independent draws the restricted solve always
succeeds, always obeys both restrictions, and always reproduces its input
state.

Which phase owns which end: the first-move restriction belongs to phase 1 and
the last-move restriction to phase 2. When a phase comes back empty the other
supplies that end instead — phase 1 being empty is knowable before phase 2
runs, phase 2 being empty is not, so `solve333` checks the assembled solution
and re-solves once with phase 1 carrying the last-move restriction. Both cases
are far rarer than one draw in `10^5`; they are handled because 4b3 states a
requirement rather than a likelihood.

### The 4b3 floor is checked on the padded sequence

Not on the drawn state — the padding moves the state by six moves, so a draw
that qualified before padding is not what a competitor is handed. This is the
same end of the process `333bf` is checked at, for the same reason.

TNoodle checks at the same point: `Puzzle.generateWcaScramble` redraws while
`psag.state.solveIn(wcaMinScrambleDistance - 1) != null` with
`wcaMinScrambleDistance = 2`, and for `THREE_FM` the `psag` it tests is the one
the `AlgorithmBuilder` returns *after* prefix and suffix have been appended.

---

## 5b. `333mbf` — one attempt, many cubes

Multi-Blind was the last unimplemented event, and the reason given for that was
wrong in a specific and instructive way. `variants.ts`, the README and
`nxn-design.md` §8 all said:

> it is one inspection over *many* cubes, which does not fit a
> one-scramble-per-call API. Adding it would mean changing what
> `generateScramble` returns for every other event.

The first sentence is a fact about the event. The second was a guess about how
the problem would have to be solved, and it was the whole objection. Neither
reference implementation works that way:

- `cubing@0.63.3` maps `case "333bf": case "333mbf":` to the **same**
  `random333OrientedScramble()` and leaves the caller to loop.
- TNoodle has no multi-blind puzzle class at all. `Puzzle.generateScrambles(r,
  count)` is a bare loop over `generateWcaScramble`, and `333mbf` is served by
  the same `333ni` generator as `333bf`.

So multi-blind is not a different *scramble*, only a different *number* of
them.

### The shape

Two optional additions, and nothing else changed:

| | |
|---|---|
| `GenerateScrambleOptions.count?: number` | how many cubes; defaults to 1 |
| `ScrambleResult.scrambles?: readonly string[]` | present for a multi-scramble event; `scrambles[0] === moves` |

`event`, `moves` and `quality` are untouched, so a caller written before this
existed keeps working — and `generateScramble('333mbf')` with no `count`
returns exactly the `333bf` scramble the same seed gives.

Each cube is a full `generate333BlindfoldedScramble`: its own uniform draw, its
own orientation suffix, and its own 4b3 floor checked *after* that suffix. The
N draws share one `RandomSource`, which is what makes them independent; the
registry marks the event `multiScramble` rather than giving it a second
"generate N" function, because there is nothing extra to do.

### Three decisions worth stating

1. **`count` on any other event throws** (`InvalidScrambleCountError`) rather
   than being ignored. A caller who asks for ten and silently receives one has
   been misled, and the mistake is invisible from the result.
2. **The draws are not de-duplicated.** Each cube is an independent uniform
   draw, so a collision is a legitimate outcome; removing it would bias the
   distribution. There is a test saying so, to stop it being "fixed".
3. **`count` is capped at `MAX_SCRAMBLE_COUNT` (100).** A guard, not a
   regulation — the Regulations cap the *time* (H1a: 10 minutes per cube, up to
   60) and not the number. Every cube is a full random-state solve, about
   100 ms warm, in a package with no Worker to hide it in, so an unbounded
   `count` fed from user input would block a caller's main thread for minutes.

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

### Fixed since this document was written

**The 4b3 two-move floor is now enforced for `333`, `333fm` and `333oh`.** This
section used to file its absence under "Current bugs": `register333Scrambler`
registered `generate333Scramble` bare, and `variants.ts` did the same for the
other two, so only the blindfolded path went through the check —
while `README.md` claimed the floor applied everywhere and
`docs/blindfolded-review.md` §5 already listed it as fixed.

`generate333ScrambleWithFloor` (`puzzles/333/solve.ts`) now wraps the draw in
`withMinimumDistance(3, …)`, and both `333` and `333oh` register through it;
`333fm` got its own wrapper with §5a, applied to the *padded* sequence.

Two things worth keeping from the old entry. The impact was about
`4 × 10^-19` per scramble — 19 states within one move of solved out of
`4.3 × 10^19`, never to be observed — and that was never the argument: 4b3
states a requirement, not a likelihood. And the wrapper deliberately lives at
the registration sites rather than inside `generate333Scramble`, because
`333bf` calls that function too and its floor has to be checked *after* the
orientation suffix.

### Current bugs

**A same-face pair can be printed at the phase-1 / phase-2 boundary.**

Each search prunes consecutive same-face moves within itself, but neither knows
the other's moves, so phase 1's last move and phase 2's first move can turn the
same face. The scramble is the inverse of the solution, so it surfaces mid-string
— `… R2 L2 B2 B' L' …` in the seed `probe-5` scramble, where `B2 B'` merges to
`B`.

- **Impact:** cosmetic on the state, which is uniform either way, but it is
  exactly the leak `core/scramble-shape.ts` §2 warns about: the printed sequence
  is one move longer than the algorithm it represents, and a competitor merging
  it gets a shorter scramble than the sheet shows. Measured at 1 scramble in 20
  over a 20-seed sample.
- **Where it applies:** `333`, `333oh`, `333bf`, the inner scramble of `333fm`,
  and `444`'s 3x3x3 hand-off. Not the padding seams of `333fm`, which are
  protected by the axis restriction of §5a.
- **Fix:** seed `phase2Search`'s same-face pruning with phase 1's last move, so
  the rule spans the boundary. One condition, but it changes `333` output for
  every seed — a breaking change to seeded scrambles — so it wants its own
  release note rather than being folded into an unrelated change. Found while
  implementing §5a; not fixed there.

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

- Close the phase-boundary same-face pair (above), with a release note.
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
