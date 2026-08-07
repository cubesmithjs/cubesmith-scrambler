# 2x2x2 — design document

Written *after* the implementation, unlike `square1-design.md` and
`444-design.md`, to record what `src/puzzles/222/` actually does — every number
below is either read off the code or measured, not recalled. Where the
implementation has a limitation it is stated in §8 rather than smoothed over.

Target: `generateScramble('222')`, shipped since v0.2.

---

## 1. Overview

### WCA event

**`222` — 2x2x2 Cube.** Regulation **4b3** applies with exception **4b3b**:

> An official scramble sequence must produce a random state from all states
> that require at least 2 moves to solve (equal probability for each state).

> 4b3b — 2x2x2 Cube: at least **4** moves.

So this is a **random-state** event with a **four-move floor**, and the
parenthetical — *equal probability for each state* — is a requirement about the
distribution, not a description of it.

### Goal of the implementation

Draw a uniformly random Pocket Cube state, reject anything closer than four
moves to solved, and print the inverse of a solution. The whole reachable group
is small enough that no approximation is needed anywhere: the pruning table
holds the **exact** distance for every state, so the solver is optimal and the
4b3b filter is exact rather than a bound.

### References used

- WCA Regulations 4b3 / 4b3b — the method, and the four-move floor.
- Jaap Scherphuis' Pocket Cube page — the group order `3,674,160` and the
  distance distribution, used as an external cross-check on the model.
- WCA incident 28 — why a scramble is padded to a fixed printed length.
- No third-party *code* was read. The move tables are derived from this
  package's own `puzzles/333/geometry.ts`; see the repository's independence
  note.

### Files

| | |
|---|---|
| `state.ts` | the piece-level state and the 9 move tables |
| `coordinates.ts` | state → `(permutation, orientation)` integer pair |
| `tables.ts` | per-move coordinate transitions |
| `pruning.ts` | the exact distance table, by BFS from solved |
| `search.ts` | IDA\*, and the fixed-length variant |
| `random-state.ts` | the uniform draw |
| `solve.ts` | 4b3b filter, padding, inversion, registration |

---

## 2. Notation

### Supported notation

The shared face-turn notation in `src/notation/move.ts`: a face letter with an
optional suffix.

| Token | Meaning |
|---|---|
| `U` | quarter turn of that face, clockwise viewed from outside it |
| `U2` | half turn |
| `U'` | quarter turn counterclockwise |

**Only `U`, `R` and `F` are ever produced or accepted** by the puzzle. That is
the WCA/TNoodle convention, and it is not an arbitrary restriction: a 2x2x2 has
no fixed centres, so it has no absolute frame — a `D` turn is some whole-cube
rotation composed with a `U` turn, and writing both would be spelling the same
move twice.

The restriction has a useful consequence rather than a cost. The corner
opposite the U/R/F junction — DBL, index 6 — is on no U, R or F layer, so it
never moves and never twists. That is exactly the standard "hold one corner
still as the reference frame" convention, and here it falls out of the move set
instead of being special-cased anywhere.

### Parsing rules

`parseMove` (`src/notation/move.ts:29`) accepts `/^([UDFBLR])(2|')?$/`, mapping
a bare letter to amount 1, `2` to 2, `'` to 3. It is the *shared* parser, so it
admits all six faces; a token outside U/R/F parses and then throws at
application time (`state.ts:84`), which the test suite pins
(`state.test.ts`, "rejects a move outside U/R/F"). See §8.

### Rendering rules

`moveToString` is the exact inverse of the parser for the amounts it produces,
and `movesToString` joins with a single space. Amount 1 renders bare, 2 as `2`,
3 as `'` — never `3` and never `U1`.

### Examples

```
R2 U2 R' F2 R2 U2 R F2 U2 F2 U'
```

A real generated scramble (seed-free, from the shipped build). Every emitted
scramble is **exactly 11 tokens**, from `{U, R, F} × {'', 2, '}`, with no two
consecutive tokens on the same face.

---

## 3. State model

### Internal representation

```ts
interface Cube222State {
  cornerPermutation: readonly number[]; // 8 entries
  cornerOrientation: readonly number[]; // 8 entries, each 0..2
}
```

Both arrays are indexed **by slot**, the convention every puzzle in this package
uses: `cornerPermutation[i]` is *which piece is currently sitting at slot `i`*,
and `cornerOrientation[i]` is that piece's twist there. All eight corners are
stored even though one of them never moves, because the state is then
structurally identical to a 3x3x3's corner half and can reuse its derivation
directly.

### Coordinate system

Corner slots are the eight cube corners at `x,y,z ∈ {-1,1}`, ordered
`URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB` (`puzzles/333/geometry.ts:26`).
Orientation `0` means the corner's Y-facelet — the one that is U- or D-coloured
when solved — points along the Y axis; `1` and `2` walk it around the corner's
other two axes in a cyclic order that flips with the corner's chirality
(`x·y·z`). That chirality flip is the classic subtlety in corner-orientation
models: without it, two corners on opposite space diagonals number their twists
inconsistently and the group invariant silently breaks.

The search does not work on that structure directly. Two integer coordinates
are used instead:

| Coordinate | Size | Encoding |
|---|---|---|
| `cornerPerm` | `7! = 5,040` | rank of the seven movable corners' arrangement against an exhaustively generated lexicographic list |
| `cornerOrientation` | `3^6 = 729` | base-3 over the first six movable slots; the seventh is determined |

Both are ranked against a **generated** list rather than a recalled ranking
formula, so encode and decode are inverses by construction. `coordinates.test.ts`
round-trips all 5,040 and all 729 values regardless.

### Invariants

1. **Corner 6 (DBL) never moves and never twists.** Asserted directly over many
   random U/R/F sequences.
2. **Total twist of the movable corners is `≡ 0 (mod 3)`.** A single corner
   cannot be twisted in isolation. `decodeCornerOrientation222Coord` enforces it
   by construction — the seventh movable corner carries whatever makes the sum
   divisible by 3.
3. **`cornerPermutation` is always a permutation** of `0..7` with `6` fixed.

There is **no permutation-parity constraint**, unlike the 3x3x3. With one corner
held still the remaining seven can be permuted arbitrarily, which is why every
one of the `5,040 × 729` encodable pairs turns out to be reachable (§6).

### Solved state

```ts
cornerPermutation: [0,1,2,3,4,5,6,7]
cornerOrientation: [0,0,0,0,0,0,0,0]
```

`isSolved222` compares against exactly that. Because one corner is pinned, this
is genuinely "solved", not "solved up to a rotation" — there is no rotational
ambiguity left to quotient out.

---

## 4. Move model

### Primitive moves

Nine: `{U, R, F} × {1, 2, 3}`. Each is a table of `cornerDestination[i]` (where
the piece at slot `i` goes) and `cornerTwist[i]` (the twist delta it picks up on
the way).

The quarter turns are **derived, not transcribed**. `deriveBaseMoveTable` in
`puzzles/333/geometry.ts` applies a real 90° rotation matrix to the corner
position vectors and to an orientation reference vector, and reads the
destination and twist off the result. The 2x2x2 module takes only the corner
half of that output — a 2x2x2 *is* the corners of a 3x3x3 — so the geometry is
never re-derived a second time and cannot drift between the two puzzles.

A rotation is applied only to pieces actually on the turning layer
(`isOnLayer`); applying it unconditionally would "rotate" pieces the move never
touches.

### Composition

`composeSelf` builds amounts 2 and 3 by applying the quarter-turn table to
itself, rather than deriving three tables per face. `tables.test.ts` checks that
`amount=2` equals two applications of `amount=1` and `amount=3` equals three,
which would catch a composition error even though there is only one place for
one to occur.

Sequences compose left to right (`applyMoves222` is a `reduce`).

### Move legality

**Every move is legal in every state.** A 2x2x2 has no blocked turns — the
contrast with Square-1, where slice legality is the central modelling problem,
is total. The only restriction anywhere is a *search* heuristic: the DFS skips a
move on the same face as the previous one (`search.ts:62`), because two
consecutive turns of one face always collapse into a single turn of some amount.
That is an optimisation, not a correctness requirement, and it is also what
gives the printed scramble its "no face twice in a row" property.

### Inverses

`inverseMove` maps amount `a → 4 - a`, so `U ↔ U'` and `U2` is self-inverse.
`inverseMoves` reverses the sequence and inverts each move. `state.test.ts`
checks that a random sequence followed by its inverse returns to solved — which
is the property the whole scramble-by-inversion approach rests on.

Every move has order 4, asserted per move.

---

## 5. Scramble generation algorithm

### High-level algorithm

```
1. draw a uniformly random reachable state
2. if its exact distance to solved is < 4, discard it and draw again   (4b3b)
3. shuffle the move try-order
4. find a solution of exactly max(distance, 11) moves
5. print the inverse of that solution
```

Steps 2 and 4 come from `core/scramble-shape.ts`, which is shared with the
Pyraminx, Skewb, Clock and Square-1 for exactly the same reasons.

### Random-state vs random-move

**Random-state.** 4b3e's random-moves exception names only 5x5x5, 6x6x6, 7x7x7
and Megaminx; 2x2x2 is not in it, so random moves would be non-conforming here.
`ScrambleResult.quality` reports `'random-state'`.

### Uniformity argument

Three claims, each of which has to hold:

1. **The draw is uniform over the encodable space.** `randomInt` draws
   `cornerPerm` from `[0, 5040)` and `cornerOrientation` from `[0, 729)`
   independently, using rejection sampling to avoid the modulo bias a plain
   `nextUint32() % n` would introduce.
2. **The encodable space equals the reachable space.** This is not assumed. The
   pruning BFS starts at solved, follows only real moves, and reaches **all
   3,674,160** entries with none left unvisited — so no combination needs
   filtering and no parity fix-up is required. (Contrast `puzzles/333`, where the
   analogous draw *does* need a parity correction.)
3. **The 4b3b filter preserves uniformity.** Rejection sampling conditions a
   uniform distribution, and the conditional distribution of a uniform draw is
   uniform on the condition. "Patch a too-easy state until it is far enough away"
   would not be — it would pile probability onto the patched states' neighbours.

Padding to 11 moves changes only *how* the state is reached, never *which*
state: `solve222InExactly` is asked for a solution of a given exact length, and
the state reached is the drawn one either way.

One subtlety worth naming: the *move order* is shuffled
(`randomPermutation(random, 9)`) before searching. With an exact heuristic the
search never backtracks at the root, so a fixed try-order would make the
solution's first move — and therefore the scramble's *last* move after
inversion — visibly biased. That is a real reported defect class in scramble
generators (thewca/tnoodle#69, "Pyraminx scrambles all start with U L"), not a
hypothetical one. It is cosmetic: the state distribution is uniform either way.

### WCA compliance

| Requirement | Where |
|---|---|
| 4b3 random state, equal probability | `random-state.ts` + full BFS coverage |
| 4b3b at least 4 moves | `drawStateAtLeastMovesFromSolved(…, 4)`, exact distance |
| Sequence long enough not to leak difficulty | `solveAtLeastLength(…, 11, …)` |
| 4b3a random orientation | not applicable — `222bf` is not a WCA event |

---

## 6. Validation

### Existing tests

Seven test files, `src/puzzles/222/*.test.ts`. The load-bearing ones:

| Test | What it rules out |
|---|---|
| every move has order 4 | a wrong rotation direction or a mis-derived destination |
| corner 6 stays put across random sequences | a move set that is secretly not U/R/F |
| `amount=2`/`amount=3` equal repeated `amount=1` | a composition error |
| sequence followed by its inverse returns to solved | any non-invertible move table |
| coordinate round-trip over **all** 5,040 and **all** 729 values | an encode/decode mismatch |
| coordinate walk matches the same walk on a full state | a transition table that has drifted from `applyMove222` |
| **every one of 3,674,160 entries visited** | a wrong group order, i.e. a wrong model |
| BFS layering: every non-zero entry has a neighbour one closer | a corrupted or runaway BFS |
| heuristic never exceeds `N` after `N` random moves | an inadmissible distance table |
| solution length always equals the table distance | a non-optimal search |
| scramble is exactly 11 moves, state ≥ 4 from solved | the two `scramble-shape` rules |

### Independent verification

The strongest check is arithmetic the code cannot fake. Building the pruning
table from scratch and reading off its distance histogram gives:

| distance | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| states | 1 | 9 | 54 | 321 | 1,847 | 9,992 | 50,136 | 227,536 | 870,072 | 1,887,748 | 623,800 | 2,644 |

Total **3,674,160** — the published Pocket Cube group order — with a maximum of
**11**, the published God's number for the 2x2x2 in the half-turn metric. Both
the total *and* the full per-depth distribution match figures published
independently of this code. A model with a sign error or a mis-derived twist
would reproduce neither.

### Edge cases

- **Solved input.** `solve222` returns `[]`; `solve222InExactly(state, 0)`
  returns `[]` only when the state is solved and `null` otherwise.
- **Unreachable state.** Cannot occur through the public API, since the draw is
  by coordinate. A hand-built invalid permutation throws from
  `cornerPerm222Coord` rather than silently indexing garbage.
- **The 4b3b rejection genuinely fires.** 385 of the 3,674,160 states are within
  three moves of solved, so roughly **1 draw in 9,543** is discarded. Rare, but
  not so rare that a broken filter would go unnoticed by the tests, which assert
  the property on every sampled scramble.
- **Padding never needs to step past 11.** `solveAtLeastLength` will try
  11, 12, … up to 19; measured over 300 fresh scrambles and the whole test
  suite, a solution of exactly 11 always exists and length 12 is never reached.

---

## 7. Complexity

### Time complexity

| Step | Cost |
|---|---|
| Move tables | `9 × (5,040 + 729)` coordinate applications, one full-state apply each |
| Pruning BFS | `3,674,160 × 9 ≈ 33M` edge relaxations, each an array lookup |
| Draw | `O(1)` — two `randomInt` calls plus a decode |
| Distance check | `O(1)` — one table lookup |
| Search | IDA\* with an **exact** heuristic, so the first iteration succeeds; the padding slack (up to 7 moves above optimal) is what the DFS actually spends its time on |

The exact heuristic is what collapses the search: `g + h > bound` prunes any
branch that cannot still arrive on time, so the DFS only explores detours that
genuinely reach solved in the remaining budget.

### Memory usage

| | |
|---|---|
| Pruning table | `Uint8Array(3,674,160)` = **3.67 MB** |
| Move tables | `9 × 5,040` + `9 × 729` entries as JS `number[][]` ≈ **0.4 MB** |
| Permutation list | 5,040 arrays of 7 + an index `Map` ≈ **1 MB** |
| Total, steady state | **~5 MB**, built once per process and memoised |

### Expected scramble generation time

Measured on the development machine (Windows 11, Node 22.14):

| | |
|---|---|
| Cold — first `generateScramble('222')` in a fresh process | **4.4 s** (all table construction) |
| Steady state, `npm run bench` | **0.0154 ms** (≈ 65,000 scrambles/second) |
| Steady state, through the public async API | 0.065 ms mean, 0.094 ms p90 |

The cold cost is entirely table construction and is paid once per process. It
dominates any realistic single-scramble use and is the package's main
outstanding optimisation (§8).

---

## 8. Known limitations

### Current bugs

None known. No test is skipped and no invariant is asserted rather than
computed.

### Rough edges, stated plainly

1. **The cold start is 4.4 seconds.** Tables are built lazily in memory on first
   use rather than precomputed and shipped as a serialized asset. For a process
   that generates many scrambles this is irrelevant; for one that generates a
   single 2x2x2 scramble it is the entire cost. Shipping a serialized table is
   the natural fix and is not done.
2. **`parseMove` is more permissive than the puzzle.** `parseMove('D')`
   succeeds and `applyMove222` then throws. The error is clear and tested, but
   the failure arrives one step later than it could. This is a consequence of
   sharing one parser across the cube family and is deliberate, not accidental.
3. **The permutation coordinate is a `Map` lookup on a joined string.** Ranking
   7! permutations by table is correct by construction and fast enough at this
   size, but it is roughly a megabyte and a string allocation per encode where a
   Lehmer-code formula would be neither. Chosen for correctness-by-construction
   over speed, consistently with the rest of the package.

### Planned improvements

- Precompute and ship the pruning table, removing the cold start.
- Consider a closed-form permutation rank once there is a test that would catch
  a mistake in it — the current design deliberately avoids a hand-recalled
  formula.

---

## 9. References

### WCA regulations

- [WCA Regulations](https://www.worldcubeassociation.org/regulations/) — 4b3
  (random state, equal probability), 4b3b (2x2x2 at least 4 moves), 4b3e (the
  random-moves exception 2x2x2 is *not* in).
- [WCA incident 28](https://www.worldcubeassociation.org/incidents/28) — a
  scrambler bug that let sequences come out short, treated as an incident
  because "the truncation did not preserve the random scramble distribution".
  The reason scrambles are padded to a fixed printed length.

### Published figures used as cross-checks

- [Jaap Scherphuis — Pocket Cube](https://www.jaapsch.net/puzzles/cube2.htm) —
  the group order `3,674,160`, God's number 11 in the half-turn metric, and the
  per-depth distance distribution reproduced in §6.
- [Pocket Cube (Wikipedia)](https://en.wikipedia.org/wiki/Pocket_Cube) — the
  same group order, derived as `7! × 3^6`.

### Algorithms

- Richard E. Korf, *Depth-First Iterative-Deepening: An Optimal Admissible Tree
  Search* (1985) — IDA\*, the search used here. With an exact heuristic it
  degenerates to a single guided DFS, which is what happens on this puzzle.
- [thewca/tnoodle#69](https://github.com/thewca/tnoodle/issues/69) — the
  move-order bias this implementation shuffles to avoid.

### Related documents in this repository

- `docs/square1-design.md` — the design-document standard this one follows.
- `docs/444-design.md` — the 4x4x4, which needs a full reduction pipeline and a
  hand-off to another solver, where this puzzle needs neither.
- `docs/333-design.md` — the same puzzle family at a scale where one exact table
  is no longer possible.
