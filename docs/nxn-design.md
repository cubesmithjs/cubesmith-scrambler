# 5x5x5, 6x6x6, 7x7x7 — design document

Written *after* the implementation, to record what `src/puzzles/nxn/` actually
does. One module serves the whole NxNxN family; three events use it today, and a
fourth (`444`) will when it exists.

Targets: `generateScramble('555' | '666' | '777')`, shipped since v0.8, plus the
orientation machinery `333bf` and `555bf` are built on.

---

## 1. Overview

### WCA events

**`555`, `666`, `777`.** Regulation **4b3** with exception **4b3e**:

> 5x5x5 Cube, 6x6x6 Cube, 7x7x7 Cube, and Megaminx: sufficiently many random
> moves (instead of random state), at least 2 moves to solve.

Both halves are requirements: random moves *and* a two-move floor. This module
also provides:

| Event | Where it lives | Note |
|---|---|---|
| `555bf` | `puzzles/variants.ts` | `555` plus a random orientation (4b3a); declared `random-moves` |
| `333bf` | `puzzles/variants.ts` | a **`333`** scramble plus this module's orientation suffix |
| `444` | not registered | random-**state**, deliberately excluded from `RANDOM_MOVE_CUBES`; see `docs/444-design.md` |

### Goal of the implementation

Two jobs, and they are separable:

1. **Produce a conforming random-moves scramble** — which is not "pick moves at
   random", because a naive sequence contains visible cancellations. The one real
   rule is stated and enforced in §4.
2. **Model the cube well enough to verify one.** These events have no solver, so
   the model exists to *check* the output: apply, invert, count displacement, and
   test the two-move floor. Since there is nothing to coordinatise, the model is
   at the **facelet** level rather than pieces-with-orientation — simpler, and a
   *stronger* check on the derived moves, because it tracks every sticker
   individually rather than a piece plus a twist.

### References used

- WCA Regulations 4b3, 4b3a, 4b3e.
- The conventional scramble lengths WCA's own scrambler uses (60 / 80 / 100).
- TNoodle issue #148 — the `{id, Rw, Rw2, Rw'} × {id, Dw, Dw2, Dw'}`
  orientation construction, the three-slice-wide requirement for 5BLD, and
  filtering on the *result*.
- No third-party code was read.

### Files

| | |
|---|---|
| `notation.ts` | wide-move notation, layer depth, axis and layer-set identity |
| `geometry.ts` | the facelet lattice and the derived move permutations |
| `state.ts` | the cube as facelet slots, and three distinct solvedness predicates |
| `random-moves.ts` | the redundancy rule and the sequence generator |
| `minimum.ts` | the 4b3 two-move floor, checked on a rendered scramble |
| `orientation.ts` | the 24 orientation suffixes for the blindfolded events |
| `solve.ts` | the three events' lengths and registration |

---

## 2. Notation

### Supported notation

Wide-move notation — the layer-depth extension of `src/notation/move.ts`, which
is exactly what that module said it was there for.

| Token | Meaning |
|---|---|
| `R` | depth 1 — the outer layer alone |
| `Rw` | depth 2 — the outer two layers as a block |
| `3Rw` | depth 3 |
| `4Rw` | depth 4 — modelled for orientation on a 7x7x7, but no registered event emits it (there is no `777bf`) |

with the usual `2` and `'` suffixes for amount.

A cube of size `n` has scramble blocks up to `floor(n / 2)`: past halfway a block
turn is the opposite face's block turn composed with a rotation of the whole
puzzle, so deeper prefixes would be redundant *notation*, not new moves. That is
`R`/`Rw` for 5x5x5, and `R`/`Rw`/`3Rw` for 6x6x6 and 7x7x7.

| Size | Max scramble depth | Move count |
|---|---|---|
| 5 | 2 | 36 |
| 6 | 3 | 54 |
| 7 | 3 | 54 |

There are no slice tokens (`r`, `M`), no rotations (`x`, `y`, `z`) and no
`2Rw` in the output.

### Parsing rules

`parseWideMove` accepts `/^(\d+)?([UDFBLR])(w)?(2|')?$/` with two extra
constraints:

- a layer count without a `w` is rejected — `3R` is not wide-move notation;
- a `w` at depth < 2 is rejected.

`2Rw` **is** accepted as an alias for `Rw`, even though it is never produced, so
that a scramble copied from another tool round-trips.

### Rendering rules

`wideMoveToString` writes the count only from depth 3 up, so depth 2 renders as
`Rw` and never `2Rw` — the spelling official scrambles use. Amounts render bare,
`2`, or `'`.

### Examples

A real generated 5x5x5 scramble from the shipped build, first ten tokens:

```
Uw' L2 B D2 Uw Lw2 B Rw2 D Bw' …
```

and the tail of a `555bf` scramble, where the last one or two tokens are the
orientation suffix at depth 3:

```
… L Bw' R' Lw F' 3Uw2 3Fw
```

Lengths are exact: **60 / 80 / 100** tokens, plus 0–2 for a blindfolded suffix.

---

## 3. State model

### Internal representation

```ts
interface CubeNxNState {
  size: number;
  occupant: readonly number[]; // 6·size² entries
}
```

`occupant[i]` is *which facelet started at slot `i`* and is sitting there now.
That is all. There are no pieces, no orientation counters and no permutation
parities, because nothing here needs to reason about them — and tracking every
sticker individually is a stronger check on a derived move than tracking a piece
plus a twist.

| Size | Facelets |
|---|---|
| 5 | 150 |
| 6 | 216 |
| 7 | 294 |

The per-size model — facelets plus one permutation per move — is built lazily and
cached, so nothing pays for a size it does not use.

### Coordinate system

An exact integer lattice, **doubled** so cubie centres land on odd coordinates: a
cube of size `n` spans `[-n, n]`, each cubie is 2 units across, and cubie centres
run over the odd values `−(n−1) … (n−1)`. A facelet is a cubie centre **plus its
outward unit normal**, so it always has one coordinate at exactly `±n`.

Carrying the normal alongside the position is what makes the layer test correct,
and it is the module's one genuinely subtle point: **which layer a facelet
belongs to is a property of its cubie, not of the facelet's own position.** A
sticker on the R face sits at `x = n` on every cube, so testing its position
directly would put every R-face sticker in the outermost layer of every axis.
`inBlock` therefore subtracts the normal back off before comparing.

The 90° rotations come from `utils/vec3.ts` — the same ones
`puzzles/333/geometry.ts` derives its move tables from — so there is one place in
the package for the sign convention to be right or wrong.

### Invariants

Checked as properties of the derived permutations:

1. Every facelet sits **exactly one unit outside its cubie**, on the surface.
2. A depth-`d` quarter turn moves exactly the facelets its block owns, and that
   count is **always a multiple of 4** — as disjoint 4-cycles require.
3. A quarter turn's parity matches its 4-cycle count; a half turn is always even.
4. Every move permutation is a bijection.
5. There is a facelet dead-centre on each face **exactly when the cube is odd** —
   which is the fact that makes orientation observable at all (§5).

### Three notions of solved, and why all three exist

This is the module's most important distinction, and conflating two of them was a
real bug found by the blindfolded review.

| Predicate | Question | Used for |
|---|---|---|
| `isSolvedNxN` | does every slot show **its own face's** colour? | ordinary solvedness |
| `isUniformlyColouredNxN` | does every face show **one** colour, whichever? | the 4b3 floor |
| `isIdentityNxN` | is every facelet back in **its own slot**? | round-trip tests |

`isSolvedNxN` is orientation-*dependent*: a solved cube that has merely been
rotated fails it. That is the right question for a round trip and the **wrong**
one for "is this scramble too close to solved" — because blindfolded scrambles
rotate the puzzle *deliberately*. Using it for the floor would have made the
check silently useless for exactly the events it was added for: `Uw` on a 3x3x3
leaves a cube one move from solved, and the orientation-dependent predicate calls
that far enough. The trap was caught by the first run of the new tests, which
asserted `Uw` fails the floor and got the opposite
(`docs/blindfolded-review.md` §4.3).

### Solved state

`solvedCubeNxN(size)` is the identity occupancy. It satisfies all three
predicates.

---

## 4. Move model

### Primitive moves

`6 faces × depths × 3 amounts`, derived as facelet permutations: for each facelet
in the turning block, rotate both its position and its normal by 90° `amount`
times and look up the slot that lands on. A facelet carried off the cube throws
rather than silently going missing.

`modelForSize` builds permutations for the scramble move set **plus** the deeper
blocks `orientation.ts` needs. Those are outside the depth cap on purpose: past
halfway a block turn is redundant *as a state transformation up to orientation*,
which is precisely why it is the tool for changing orientation.

### Composition

`applyWideMoves` folds left to right. Amounts compose: a half turn is two
quarters and a prime is three, asserted on every size. Every move has order 4.

### Move legality — and the one rule that makes "random moves" mean something

Every move is legal in every state. The real constraint is on *sequences*.

"Random moves" cannot mean uniformly random moves, or the sequence would contain
visible cancellations: `R R'` collapses to nothing, `R R` to `R2`. Moves on the
same axis commute, which makes the correct rule slightly stronger than "don't
repeat the previous move":

> **Within any run of consecutive moves on the same axis, no two moves may turn
> the same set of layers.**

Because same-axis moves can be freely reordered, two moves of the same layer set
anywhere inside such a run could be brought together and merged — so `R Rw R'` is
just as redundant as `R R'`, and a scrambler that only checked the previous move
would emit it. This is the rule stated elsewhere as "not twice in the same
rotating set, and not three times in the same rotating group".

Note what is *not* excluded: `R L R'` is fine, because `R` and `L` turn disjoint
layer sets and no reordering merges them. `isRedundantMove` walks backwards until
the axis changes, which is exactly the extent of the reorderable run.

`moveAxis` pairs opposite faces; `moveLayerSet` is `face + depth`, ignoring the
amount.

### Inverses

`inverseWideMove` maps amount `a → 4 − a`, preserving face and depth; a half turn
is self-inverse. Since these events have no solver, `inverseWideMoves` **is** the
end-to-end check: scramble, invert, and the cube must return to the identity.

---

## 5. Scramble generation algorithm

### High-level algorithm

```
repeat (at most 100 times):
  draw `length` moves, rejecting any that would be redundant
  render
  if the rendered scramble leaves the cube ≥ 2 moves from solved, return it
```

with `length` = 60 / 80 / 100 for 5x5x5 / 6x6x6 / 7x7x7. The three events share
one registration loop over `RANDOM_MOVE_CUBES`, so they cannot drift apart.

### Random-state vs random-move

**Random moves**, per 4b3e, which names all three cubes explicitly. A
random-state scramble would be the non-conforming one here.
`ScrambleResult.quality` reports `'random-moves'` rather than claiming the
stronger method.

`RANDOM_MOVE_CUBES` deliberately **excludes 444**, and a test asserts that: the
4x4x4 appears in no exception clause, so it is a random-state event and
registering it here would be a conformance error, not a convenience.

### Uniformity argument

No state distribution is claimed, because 4b3e does not ask for one. What is
claimed is exactly what the code does: **at each step the next move is drawn
uniformly from the legal moves.**

The mechanism matters. `randomMoveSequence` draws uniformly from *all* moves and
**rejects** redundant candidates, rather than filtering the candidate list and
drawing from the survivors. Both give a uniform draw over the legal moves at each
step — rejection sampling conditions a uniform distribution — but rejection keeps
the code's uniformity claim visible in one line rather than distributed across a
filter. The rejection rate is low: at most a handful of the moves available on
any axis are excluded.

`randomInt` itself rejects into a truncated range to avoid the modulo bias a
plain `nextUint32() % n` would introduce.

"Sufficiently many" is 4b3e's phrase, without a number. The lengths here are the
conventional ones, and the property that makes them sufficient is **tested rather
than assumed**: each length leaves almost every facelet on the wrong face, and no
face is ever left solved.

### The two-move floor

4b3e keeps 4b3's floor: *"at least 2 moves to solve"*. `minimum.ts` enforces it
with two deliberate choices:

1. **It checks the rendered scramble, not the drawn sequence.** The string is
   parsed and applied to a solved cube. So the check shares nothing with whatever
   generator produced it — and it works unchanged on a blindfolded scramble,
   which is *not* simply the drawn state (below).
2. **Two moves is the one threshold that needs no solver.** A state closer than
   that is either solved or one move from it, so the test is one solvedness check
   plus one per move — `isAtLeastTwoMovesFromSolved` in `core/scramble-shape.ts`,
   the same helper the 333bf path uses.

It uses `isUniformlyColouredNxN`, for the reason set out in §3.

The probability of ever redrawing is vanishing — a 60-move random sequence
landing within one move of solved is not something that will be seen — but the
regulation states a requirement rather than a likelihood. After 100 failures it
throws rather than looping forever, and a test covers that path.

### Random orientation, for the blindfolded events

Regulation **4b3a**:

> For blindfolded events, the scramble sequence must orient the puzzle randomly
> (equal probability for each orientation).

An ordinary scramble never moves a centre — a 3x3x3 scramble is all single-layer
turns, and a 5x5x5 scramble uses only depth-1 and depth-2 moves, neither of which
touches the middle layer. Without a suffix the cube always ends white-up
green-front, and for a blindfolded solve the starting orientation is part of what
must be memorised.

**The depth matters.** `orientationDepth(size) = ceil(size / 2)` is the
shallowest block that reaches the middle layer: `Rw` on a 3x3x3, `3Rw` on a
5x5x5. On a 5x5x5 a two-layer wide move leaves the middle layer — and therefore
the orientation — untouched, which is why competition 5BLD scrambles are observed
ending in exactly `3Fw`, `3Rw`.

**The suffixes are searched for, not written down.** The obvious `Rw^a Fw^b`
construction cannot work: those contribute rotations about two different axes,
and `x^a z^b` over `a, b ∈ 0..3` reaches only **16** of the 24 orientations — so
it could not give the equal probability the regulation asks for.
`orientationSuffixes` runs a breadth-first search from the empty suffix, keeps one
shortest representative per orientation, and **asserts it found exactly 24**
rather than assuming a vocabulary covers them.

Measured, for both size 3 and size 5: one suffix of length 0, nine of length 1,
fourteen of length 2 — the same 0/1/2 profile TNoodle's `6 × 4` construction
gives. The identity contributes no tokens, so one blindfolded scramble in 24 comes
back with no suffix at all, which is correct rather than a missing suffix.

**The floor is checked after the suffix.** A wide move is a whole-puzzle rotation
*composed with* a turn, so appending one moves the state by a move as well as
reorienting it: a state exactly two moves from solved can come back one move from
solved. Filtering the draw and then appending would leave the sequence actually
handed to a competitor unchecked, which is the wrong end of the process. TNoodle
does the same thing, for the same reason.

`generate555BlindfoldedScramble` reads its size and length from the same
`RANDOM_MOVE_CUBES` entry `555` registers from, so the two cannot drift apart.

Only odd sizes are supported, and that is not an omission: an even cube has no
fixed centres, so its orientation is not part of its state at all.
`orientationSuffixes` throws for an even size rather than returning something
meaningless.

### WCA compliance

| Requirement | `555` / `666` / `777` | `555bf` | `333bf` |
|---|---|---|---|
| 4b3e random moves, sufficiently many | ✅ displacement tested | ✅ same generator | n/a (random state) |
| 4b3e / 4b3 at least 2 moves to solve | ✅ `withMinimumDistance` | ✅ **after** the suffix | ✅ after the suffix |
| 4b3a random orientation, uniform over 24 | n/a | ✅ depth 3 | ✅ depth 2 |
| `quality` reports the real method | ✅ `random-moves` | ✅ `random-moves` | `random-state` |

---

## 6. Validation

### Existing tests

Six test files, `src/puzzles/nxn/*.test.ts`.

| Test | What it rules out |
|---|---|
| `6n²` facelets, all distinct; `n²` per face | a wrong lattice |
| every facelet exactly one unit outside its cubie | a wrong normal |
| a dead-centre facelet exists exactly when `n` is odd | the premise behind orientation |
| every move has order 4, on every size | a wrong rotation |
| a half turn is two quarters, a prime is three | a composition error |
| a depth-`d` quarter turn moves exactly its block's facelets, always a multiple of 4 | a wrong layer test — the module's subtlest point |
| parity matches 4-cycle count; half turns even | a mis-derived permutation |
| **sequence followed by its inverse returns to the identity** | any non-invertible move, on every size |
| `maxDepthForSize` is `floor(n/2)`; `3R` rejected; `2Rw` accepted but never written | notation drift |
| the same layer set anywhere in a same-axis run is redundant; a different one is not | the weaker "previous move only" rule |
| a different axis ends the run | an over-strict rule |
| generated sequences contain **no** redundant move anywhere | the rule not actually being applied |
| every move used across a long sample, spread roughly evenly | a biased draw |
| `555`/`666`/`777` are the conventional lengths, and **444 is not among them** | registering a random-state event as random-moves |
| each length leaves almost every facelet wrong; no face ever solved | "sufficiently many" |
| scramble re-parses and re-prints identically | a rendering/parsing mismatch |
| the floor rejects solved and every one-move state, **and nothing else nearby** | an over- or under-strict floor |
| the floor **sees through a wide move** | the orientation-dependent-predicate trap |
| the floor gives up loudly rather than looping forever | an infinite retry |
| **exactly 24 orientations, all distinct**, for size 3 and size 5 | an incomplete vocabulary |
| more than the 16 that `Rw^a Fw^b` reaches | the construction that looks right and is not |
| suffixes are at most two moves | drift from what official scrambles look like |
| orientation depth is deeper than any scramble depth | a suffix that cannot reorient |
| an even cube is refused | a meaningless answer |
| every orientation drawn with equal probability | 4b3a's parenthetical |
| blindfolded scrambles clear the floor **after** the suffix | checking at the wrong point |

### Independent verification

- **Scramble-then-invert** replaces scramble-then-solve on every size, since
  there is no solver. It exercises generation, rendering, parsing and the derived
  permutations in one pass.
- **The 24 orientations are counted, not assumed** — and the count is a hard
  assertion inside `orientationSuffixes` itself, not only in a test, so a
  regression throws at runtime rather than quietly producing a biased draw.
- **The floor check shares no code with the generator**: it goes through
  `parseWideMove` and a fresh solved cube.
- **The displacement property is measured** rather than argued from the move
  count.

### Edge cases

- **Even sizes for orientation** — throws with an explanatory message.
- **A size below 2, or non-integer** — `maxDepthForSize` throws; `buildFacelets`
  calls it precisely to validate.
- **A depth beyond the modelled set** — `applyWideMove` throws rather than
  treating an unknown key as a no-op.
- **The identity orientation** — contributes no suffix; one blindfolded scramble
  in 24, and tested as a real outcome rather than an edge case to suppress.
- **100 consecutive floor failures** — throws with the size in the message.
- **The floor rejection** effectively never fires; the test constructs the
  near-solved states directly rather than waiting for one.

---

## 7. Complexity

### Time complexity

| Step | Cost |
|---|---|
| Facelet model, per size | `6n²` facelets built once |
| Move permutations, per size | `(moves + orientation moves) × 6n²` rotations, each with a hash lookup |
| Scramble draw | `length` draws plus rejections; `isRedundantMove` walks back only to the end of the current same-axis run — a few steps |
| Floor check | one parse and `length` permutation applications, plus one per move of the move set |
| Orientation BFS | breadth-first over wide moves until 24 orientations are seen — depth 2 suffices |

The floor check is the dominant per-scramble cost, and deliberately so: it is
`O(length × n²)` where the draw is `O(length)`.

### Memory usage

| Size | Facelets | Permutations | Approx. |
|---|---|---|---|
| 5 | 150 | 36 + 18 orientation | **~30 KB** |
| 6 | 216 | 54 (no orientation — even) | **~45 KB** |
| 7 | 294 | 54 + 18 orientation | **~90 KB** |

Everything is per-size and lazily cached. There is no pruning table anywhere in
this module, so the footprint is three orders of magnitude below the
solver-bearing puzzles.

### Expected scramble generation time

Measured on the development machine (Windows 11, Node 22.14):

| Event | Cold (first call, fresh process) | Steady state (`npm run bench`) | Public async API, mean |
|---|---|---|---|
| `555` | 18 ms | **0.055 ms** (≈ 18,000/s) | 0.240 ms |
| `666` | 20 ms | **0.087 ms** (≈ 11,500/s) | 0.325 ms |
| `777` | 29 ms | **0.122 ms** (≈ 8,200/s) | 0.403 ms |
| `555bf` | 22 ms | — | 0.307 ms |

Essentially no cold start: the "tables" here are a few dozen permutations over a
few hundred facelets. Time scales with `n²` as expected, since the floor check
applies every move to a full facelet cube.

---

## 8. Known limitations

### Current bugs

None known in this module. (The related gap is in `puzzles/megaminx/`, the fourth
4b3e event, which has no equivalent floor check — see `docs/megaminx-design.md`
§8. And `333`/`333fm`/`333oh` do not route through `withMinimumDistance` either
— see `docs/333-design.md` §8. This module's own three events do.)

### Rough edges, stated plainly

1. **Same-face seam at a blindfolded suffix.** About one blindfolded scramble in
   six ends with the scramble's last move and the suffix's first move on the same
   face: `… Lw 3Lw'` on a 5x5x5, `… U Uw` on a 3x3x3. It is legal notation, it
   does not affect the state distribution, and TNoodle can produce the same
   thing. It reads oddly, and the package already has the machinery to avoid it
   (Square-1's move compression solves the analogous phase-boundary seam). Left
   alone **deliberately**: fixing it means either rejecting colliding suffixes —
   which would break the uniform draw over orientations unless done carefully —
   or merging at the seam, which changes every blindfolded scramble a given seed
   produces. Worth doing before 1.0, and on purpose rather than in passing
   (`docs/blindfolded-review.md` §4.4).
2. **The token vocabulary differs from TNoodle's.** This produces `Uw`/`Fw`/`Lw`
   suffixes where TNoodle uses `Rw`/`Fw`/`Dw`. Both are legal WCA notation, both
   give suffixes of at most two moves, and the resulting distribution over
   orientations is identical — nothing in the regulation privileges one
   vocabulary. Noted because a reader comparing outputs side by side will see it.
3. **The scramble lengths are conventional, not derived.** 4b3e says
   "sufficiently many" without a number. 60/80/100 are what WCA's scrambler uses;
   the tests verify the *property* (near-total displacement) rather than the
   number, but the number itself is inherited rather than justified from first
   principles.
4. **`444` is unimplemented**, so `444bf` is absent too — registering it against
   another puzzle's scrambler would be worse than throwing
   `UnimplementedEventError`. Note for when `444` lands: an even cube has no
   fixed centres, so its orientation is not observable and 4b3a is satisfied
   without any suffix; whether to emit one anyway is a presentation decision
   rather than a compliance one (`docs/444-design.md` §11).
5. **`333mbf` is out of scope by design**, not oversight: it is one inspection
   over *many* cubes, which does not fit a one-scramble-per-call API.

### Planned improvements

- Decide the same-face seam before 1.0.
- Extend `RANDOM_MOVE_CUBES`' sibling machinery to `444` once its random-state
  solver exists — the facelet model and notation already support size 4.

---

## 9. References

### WCA regulations

- [WCA Regulations](https://www.worldcubeassociation.org/regulations/) — 4b3,
  **4b3a** (random orientation for blindfolded events), **4b3e** (random moves
  for 5x5x5, 6x6x6, 7x7x7 and Megaminx, at least 2 moves to solve).

### Published sources

- [Rotations/wide turns for non-inspection events (TNoodle issue #148)](https://github.com/thewca/tnoodle/issues/148)
  — the `{id, Rw, Rw2, Rw'} × {id, Dw, Dw2, Dw'}` construction, the
  three-slice-wide requirement for 5BLD, and "scramble filtering done on the
  result".
- [Scrambling Program Update: TNoodle 0.8.0](https://www.worldcubeassociation.org/posts/scrambling-program-update-tnoodle-0-8-0)
  — "Random orientation for blindfolded events, as specified in Regulation
  4b3a".
- Competition 5BLD scrambles observed ending in `3Fw`, `3Rw` — the evidence that
  the orientation suffix must be three slices wide on a 5x5x5.

### Related documents in this repository

- `docs/blindfolded-review.md` — the full 4b3a conformance review, including the
  orientation-dependent-predicate trap (§4.3) and the deferred seam (§4.4).
- `docs/333-design.md` — the base scramble `333bf` extends.
- `docs/megaminx-design.md` — the fourth 4b3e event.
- `docs/444-design.md` — the random-state event this module is deliberately not
  used for.
