# Rubik's Clock — design document

Written *after* the implementation, to record what `src/puzzles/clock/` actually
does. The Clock is the outlier of this package: no cube geometry, no search, no
pruning table, no state-space BFS. It is linear algebra.

Target: `generateScramble('clock')`, shipped since v0.6. Public notation
validation (`validateScramble('clock', …)`) shipped since v0.12 — §2 and §6.

---

## 1. Overview

### WCA event

**`clock` — Clock.** Regulation **4b3** with **no exception**: random state, at
least **2** moves to solve, equal probability for each state. No 4b3a–4b3f
clause names the Clock.

### Goal of the implementation

Exploit the one structural fact that makes this puzzle unlike every other one
here: **every move is an addition in `Z12` on a fixed set of dials.** Nothing is
permuted, so the group is abelian, and "solving" is a linear system rather than
a search.

The payoff is that the official fourteen-token scramble template turns out to be
a **unimodular basis** for the puzzle's fourteen independent dials. Generating a
uniformly random state is then fourteen uniform draws with no constraint to
satisfy, and producing the scramble for a state is a single matrix multiply —
no solver, no inversion of a solution, no rejection of unreachable states.

### References used

- WCA Regulations 4b3, and the WCA scramble program's output format for the
  fourteen-token template.
- Jaap Scherphuis' Clock page — the mechanism (which clocks a pin gears
  together), the `12^14` state count, and the published God's number of 12,
  used as context and cross-check.
- No third-party code was read.

### Files

| | |
|---|---|
| `notation.ts` | tokens, pin sets, amount spelling, and the scramble parser |
| `mechanics.ts` | the dial grid, the gearing rule, and `drivenSlots` |
| `state.ts` | the eighteen dials, the pins, and the fourteen-vector view |
| `template.ts` | the official template, its effect matrix, and its inverse |
| `random-state.ts` | the uniform draw and the capped distance function |
| `solve.ts` | scramble tokens, the closing pin declaration, registration |
| `../../utils/mod-matrix.ts` | inversion over `Z12` by CRT |

---

## 2. Notation

### Supported notation

Nothing in `src/notation/move.ts` applies — there are no faces, no layers and no
turn amounts in the cube sense. A Clock token names a **pin configuration** and
how far to turn a wheel.

| Token kind | Example | Meaning |
|---|---|---|
| dial | `UR4+` | raise only the upper-right pin, turn that wheel 4 hours clockwise |
| dial | `ALL2-` | raise all four pins, turn 2 hours counterclockwise |
| flip | `y2` | turn the whole puzzle over; everything after is performed from the back |
| pin declaration | `DL UL` | a bare letter group at the very end — which pins are left up. **Accepted, never emitted** since 0.14; see §5 |

Nine pin-set names exist: the four single corners `UR DR DL UL`, the four edge
pairs `U R D L`, and `ALL`. Note the pairs are the **edges**, never the
diagonals — so six of the sixteen physically reachable pin configurations have
no name in the notation at all. That matters in §5.

`+` is clockwise, `-` counterclockwise, and the amount is in hours.

### Parsing rules

`parseClockScramble` walks whitespace-separated words:

- `y2` → a flip token.
- `/^([A-Z]+)(\d+[+-])?$/` where the letters name a known pin set. **With** an
  amount it is a dial move; **without** one it is a closing pin declaration.
  That single distinction is what keeps `DL` and `DL5-` unambiguous.
- Consecutive bare groups are folded into the one declaration they represent.
- A bare group that is not a *single corner* throws: only corners can close a
  scramble.

`parseClockAmount` accepts `/^(\d+)([+-])$/` and rejects an hour count above 6,
because 7 through 11 are spelled with the opposite sign.

### Rendering rules

`clockAmountToString` maps `Z12` onto exactly twelve spellings: `0+` through
`6+` clockwise, `1-` through `5-` counterclockwise. **`6-` never appears** — a
half turn is already `6+` — which is what makes the spelling a bijection rather
than merely a surjection.

An empty pin declaration renders as nothing and is filtered out rather than
leaving a trailing space. This is more than cosmetic — see §5 on why the
declaration is no longer emitted at all.

### Examples

A real generated scramble from the shipped build:

```
UR3+ DR5+ DL3+ UL6+ U2- R2+ D2- L4- ALL1- y2 U0+ R3+ D4- L2- ALL4+
```

Nine dial tokens, `y2`, five more dial tokens. Always exactly that shape and
**always exactly fifteen tokens** — the only variation is the amounts.

Before 0.14 the scrambler appended the closing pin declaration, which made the
emitted string 15 to 19 tokens depending on how many pins the draw left raised
(`… ALL4+ DL UL`). TNoodle-WCA-1.2.3 emits neither, so the string differed from
the official one *in kind*: a consumer parsing both had two grammars to handle.
The parser still accepts the old form, so a scramble already stored in a
consumer's database goes on validating and drawing exactly as it did.

### Reason codes

`parseClockScramble` did not need a wrapper — it already parsed whole strings.
What it needed was **positions**: it iterated `text.split(/\s+/)`, which throws
them away, so it could say a token was wrong and never point at it. Since v0.12
it walks `notation/tokenize-words.ts` instead and throws a
`ScrambleSyntaxError`. The successful path is unchanged.

| Code | Example | Carries |
|---|---|---|
| `clock-not-a-token` | `5+`, `UR3`, `z2` | `token` |
| `clock-not-a-pin-set` | `XY1+` | `token`, `pins` |
| `clock-hour-out-of-range` | `UR9+`, `UR7+` | `token`, `pins`, `hours` |
| `clock-pin-not-a-corner` | `ALL1+ U`, `… ALL` | `token`, `pins` |

The first two used to share one `||` and one message, and they are different
mistakes: `5+` is not shaped like a Clock token at all, while `XY1+` is — and
names a pin set that does not exist. The hour code comes from
`parseClockAmount`, whose *other* throw is unreachable from here: the `\d+[+-]`
the token regex already matched satisfies its shape check, so the range is
always the complaint.

`clock-pin-not-a-corner` is the interesting one, and the one that most needed a
position. It is a **positional** rule: `U` and `ALL` are perfectly legal pin
sets to *turn* and illegal ones to *end with*, so the same word gets a
different verdict depending on where it sits. `y2` is legal mid-scramble and is
matched before any of this.

🔴 No message strings ship for these codes, in any language.

---

## 3. State model

### Internal representation

```ts
interface ClockState {
  front:  readonly number[];                    // 9 dials, each 0..11
  back:   readonly number[];                    // 9 dials, each 0..11
  pinsUp: Readonly<Record<ClockCorner, boolean>>;
}
```

`front` and `back` are each indexed by that side's **own** slot numbering, row
major:

```
0 UL   1 U   2 UR
3 L    4 C   5 R
6 DL   7 D   8 DR
```

So `back[0]` is the upper-left dial *as seen from the back*, which is physically
the same clock as `front[2]`. `MIRROR_SLOT` carries that left-right mirroring.

`pinsUp` is in the front frame. It is modelled — a scramble's closing
declaration sets it — but it is **not part of solvedness**: a Clock is judged on
its dials, and the pins can be anywhere.

### Coordinate system

Corner clocks pass right through the puzzle and show on both sides at once, so
their two readings are locked and mirrored:

```
back[MIRROR_SLOT[slot]] === −front[slot]   (mod 12),  for each corner slot
```

That leaves `9 + 9 − 4 = 14` independent dials, and therefore

```
12^14 = 1,283,918,464,548,864
```

states — the published figure. `toClockVector` presents exactly those fourteen:
the nine front slots followed by the five non-corner back slots. The four back
corner readings are omitted because they are not free, and `fromClockVector`
*reconstructs* them rather than requiring them as input.

### The mechanism, stated once

A pin that is up on one side is down on the other, and a pin's state decides
whether **that corner's clock is geared to its three neighbouring clocks on the
front or on the back**. Turning a wheel therefore drives every clock in the
connected group its corner belongs to, on the side it is currently geared to.

All four corner quadrants overlap at the centre clock, so on a given side the
geared corners are always a single group: turning any one of them turns that
corner, every other geared corner, and every clock adjacent to any of them. That
is the whole rule. `drivenSlots` computes it from grid adjacency — derived, so
the "corner plus its three neighbours" quadrant cannot be mistyped — and every
notation token is a special case of it.

### Invariants

1. **Corner readings stay locked to their mirror**, after any number of turns
   from either side (`cornerReadingsConsistent`).
2. **The group is abelian.** Any two turns give the same state in either order,
   so a turn of `n` hours equals `n` turns of one hour.
3. **A front turn never moves a non-corner back dial**, and vice versa. This is
   precisely why a scramble must contain a `y2` at all — without flipping, five
   of the fourteen coordinates are unreachable.
4. **Pin positions are not part of solvedness.**

### Solved state

All eighteen dials at twelve o'clock — `front` and `back` all zero. Pins may be
in any position. The mirrored-corner invariant is satisfied trivially.

---

## 4. Move model

### Primitive moves

`applyClockTurn(state, corners, amount, flipped)`:

```
for each slot in drivenSlots(corners):  near[slot] += amount
for each corner in corners:             far[mirror(corner)] −= amount
flipped decides which array is "near"
```

The driven-slot rule and the corner linkage are written **once** and applied
symmetrically, because the puzzle genuinely is symmetric — there is no
privileged side. `flipped` changes only which array is near.

Note it takes a **corner set**, not a notation name. All fifteen non-empty pin
configurations are physically reachable while the notation names only nine, and
the 4b3 check in §5 has to consider every one of them. `applyClockDial` is the
thin wrapper that addresses this by one of the nine names.

### Composition

Addition in `Z12`, so composition is addition of effect vectors and the order is
irrelevant. This is the property everything else in the module is built on, and
`state.test.ts` verifies it directly ("any two turns give the same state in
either order") rather than assuming it from the mechanism.

Each turn has order 12.

### Move legality

**Every turn is legal in every state.** A Clock has no blocked moves; the pins
only decide *which* dials a turn drives, never whether it may be performed.

### Inverses

The inverse of turning `n` hours is turning `−n` hours with the same pins, which
`normalizeHours` handles. There is no `inverseMoves` in this module and no need
for one — because the group is abelian, the scramble for a state is computed
**forwards** rather than by inverting a solution (§5).

---

## 5. Scramble generation algorithm

### High-level algorithm

```
1. draw fourteen uniform hours and four uniform pin bits
2. if the state is 0 or 1 turns from solved, discard and draw again   (4b3)
3. multiply by the template's inverse to get the fourteen amounts
4. render the template with those amounts — fifteen tokens, and stop
```

There is **no search and no inversion of a solution** anywhere in the chain.

### The template as a basis

Nine dial tokens are performed on the near side, then `y2`, then five more on the
far side. The far side needs only five because the four corner clocks pass
through the puzzle and were already set by the first four tokens — which is
exactly why the template has fourteen amounts for fourteen independent dials.

`TEMPLATE_MATRIX` is built by **measuring**: each token is applied to a solved
puzzle at one hour and the resulting fourteen-vector is read off. Nothing is
written down, so the matrix can only be wrong if the mechanical model is.

Its integer determinant, computed by fraction-free (Bareiss) elimination so
there is no floating-point error to reason about, is exactly **1**. The template
is therefore **unimodular**: a basis over the integers, and so over `Z12` too.
Consequences:

- every one of the `12^14` states is reachable;
- by **exactly one** choice of the fourteen amounts;
- so the amounts that produce a state are recovered by one multiply against the
  transpose's inverse.

Inverting over `Z12` is the one piece of real machinery. `Z12` is not a field,
and Gauss–Jordan needs an invertible pivot — a column can be free of units while
the matrix is still invertible (in `[[2,3],[3,2]]` neither 2 nor 3 is a unit mod
12, yet the determinant −5 is). `utils/mod-matrix.ts` resolves this by the
Chinese Remainder Theorem: `Z12 ≅ Z4 × Z3`, each factor is a *local* ring where
a pivot is guaranteed to exist whenever the matrix is invertible at all, and the
two inverses recombine as `9a + 4b`.

### Random-state vs random-move

**Random-state**, and it is the one puzzle here where uniformity needs no
argument at all: fourteen independent uniform draws over a basis *is* a uniform
draw over all `12^14` states. No parity, no rejection for reachability, nothing
unreachable. Pins are drawn uniformly over all sixteen combinations.

### The 4b3 floor

The regulation asks for at least two moves to solve. A Clock's true solving
distance would need a search over `12^14` states, and the published God's number
of 12 is in a metric this package does not compute — so
`clockSolveDistanceCappedAtTwo` returns **0, 1, or "2 meaning two or more"**.

That is exactly what 4b3 needs, and it is all that can honestly be offered. The
cap is *exact where it matters* because "solvable in one turn" is a finite, small
set: fifteen pin configurations × two sides × eleven non-zero amounts. The set is
enumerated over corner **sets**, not the nine notation names, because a
scrambler's obligation is about what the puzzle can do rather than what the
notation can spell.

Fewer than 330 states out of `1.28 × 10^15` fail the check, so it effectively
never rejects — but it is a real check rather than an appeal to how unlikely that
is.

### The closing pin declaration, and why it is no longer emitted

The subtle piece, and as of **0.14 it is not part of the output**.

The subtlety first, because it still governs how an old scramble is *read*. A
scramble ends with the puzzle turned over, so the declaration is read in the
flipped frame — and a pin is one piece with two ends, so "up from the back" is
"down from the front". **Both** inversions have to be applied: the corners to
name are the *mirrors* of the ones that should end up **down** at the front.
`closingPinDeclaration` does exactly that and `solve.test.ts` checks all sixteen
targets land correctly.

Three reasons it went:

1. **TNoodle-WCA-1.2.3 does not emit one.** Its clock scramble is exactly fifteen
   tokens and ends on the second `ALLn±`, and its own `ClockState` is eighteen
   dial readings carrying no pin positions at all — a fact `draw/clock.ts` had
   already recorded while the scrambler went on printing them.
2. **It was a description, not an instruction.** The final pin position is
   implied by the scramble: the last token raises all four pins from the back,
   which is all four down at the front. Declaring it added tokens and no
   information a competitor did not already have.
3. 🔴 **One target of the sixteen could not be spelled.** "Leave all four pins
   up" is named by the *empty* declaration — no corner ends up down — and an
   empty declaration renders as the empty string and is filtered out. As a token
   array the intent survived; as **text**, the only form a competitor or a
   consumer's database ever sees, it did not. One draw in sixteen printed a
   scramble whose declared pin state was not the one drawn.

The pins are still **drawn** into the state, because `ClockState` models them and
a state with them pinned would be less faithful — and because leaving the draw
alone makes the change purely subtractive, so a seeded scramble keeps every one
of its fourteen dial amounts and simply loses its tail.

Emit narrow, accept wide: `parseClockScramble` goes on accepting the trailing
form, `applyClockTokens` goes on applying it, and `solve.test.ts` proves an
old-format scramble still parses, re-prints byte-identically, and reaches exactly
the state it always did.

### No padding

Unlike the 2x2x2, Pyraminx, Skewb and Square-1, no minimum sequence length is
applied. The template is a fixed fourteen amounts regardless of the state, so the
printed length carries **no** information about difficulty — the leak that
padding exists to prevent cannot occur here. Since the declaration went, the
printed length does not vary at all: every clock scramble is fifteen tokens.

### WCA compliance

| Requirement | Where |
|---|---|
| 4b3 random state, equal probability | fourteen uniform draws over a unimodular basis |
| 4b3 at least 2 moves to solve | `clockSolveDistanceCappedAtTwo`, exact at the cap |
| Official token template | `template.ts`, asserted token-for-token |
| TNoodle's fifteen-token output shape | `move-count.test.ts` and `solve.test.ts`, anchored at both ends |
| Old-format scrambles keep parsing | `solve.test.ts`, 500 legacy strings re-parsed and re-printed |

---

## 6. Validation

### Existing tests

Six test files, `src/puzzles/clock/*.test.ts`.

| Test | What it rules out |
|---|---|
| each corner has exactly three geared neighbours; `MIRROR_SLOT` is an involution | a wrong grid |
| `drivenSlots` is the union of the raised corners' quadrants; an edge pair drives six dials, not eight | an over- or under-driving turn |
| `drivenSlots` handles the six configurations the notation cannot name | the notation-shaped blind spot |
| twelve hours map onto exactly twelve spellings, and round-trip | an ambiguous or lossy amount rendering |
| the four named pairs are the edges, never the diagonals | a wrong pin-set table |
| a real official scramble parses into 14 dial tokens, a flip and a declaration, and round-trips to the identical string | a parser that does not accept real input |
| a bare group that is not a single corner is rejected | the `DL` / `DL5-` ambiguity |
| every turn has order 12 | a wrong `Z12` model |
| **turns commute** | the abelian claim the whole design rests on |
| corner readings stay locked to their mirror after any turns | a broken through-the-puzzle linkage |
| a front turn never moves a non-corner back dial | why the `y2` is needed at all |
| a turn from the back raises the mirrored corners, inverted | the two-ended-pin subtlety |
| **the template's determinant is ±1** | the basis claim — and therefore reachability and uniqueness |
| so the number of reachable states is exactly `12^14` | a wrong independent-dial count |
| `templateAmountsFor` recovers the exact amounts a scramble was built from | a wrong matrix inverse |
| every one of the fourteen basis states maps back to a single unit amount | a transposition error in the multiply |
| the scramble reproduces the drawn state's dials exactly | end to end |
| the emitted scramble is exactly fifteen tokens, anchored at both ends | the trailing-pin format regression |
| an old, pins-included scramble still parses, re-prints and applies | turning a cosmetic change into data loss |
| the drawing is identical with and without the trailing pins | that the format change did not reach the picture |
| the state reached needs at least 2 moves to solve | the 4b3 floor |

### Independent verification

- **The determinant is computed, not asserted.** `integerDeterminant` runs
  Bareiss elimination over the *measured* effect matrix and returns exactly `1`.
  From that alone, `12^14` reachability and uniqueness follow — so the published
  state count is *derived here*, not quoted.
- **The 14×14 matrix is measured**, by applying each token to a solved puzzle.
  There is no hand-written table anywhere in the module for a transcription error
  to live in.
- **`mod-matrix.ts` is separately tested**, including the `[[2,3],[3,2]]` case
  that motivates the CRT approach.

### Edge cases

- **Already solved.** `solveClock` returns a template with all-zero amounts —
  a genuine no-op sequence, not an empty one, because the template is fixed.
- **Out-of-range input.** `fromClockVector` normalises; `templateTokens`
  normalises; `parseClockAmount` rejects an hour above 6 rather than silently
  wrapping.
- **Wrong vector length.** `fromClockVector` and `templateTokens` both throw with
  the expected and actual counts.
- **All pins down.** The closing declaration is empty and renders as nothing;
  the scramble ends at `ALL…`. Tested.
- **The 4b3 rejection.** Fires for fewer than 330 states in `1.28 × 10^15` — it
  will never be observed in practice, but the one-turn set is enumerated exactly
  and tested against all fifteen configurations on both sides.

### Public validation, since v0.12

`validateScramble('clock', text)` dispatches on the event and returns
`{ valid: true, notation: 'clock' }` or `{ valid: false, error }` without
throwing. Tests cover a generated scramble (asserting the mid-scramble `y2` and
the trailing pin block are both present — the tail is where a hand-rolled
validator gets Clock wrong), empty input, all four reason codes with offsets
and spans, and a failure in the middle of a fourteen-token scramble.

**What it does not check.** Only that the string is Clock notation. Not that it
is the fourteen-token official template of §5, not Regulation 4b3's floor, and
nothing about the resulting state. `ALL1+ ALL1+` is valid notation.

---

## 7. Complexity

### Time complexity

| Step | Cost |
|---|---|
| `TEMPLATE_MATRIX` | 14 token applications on a solved puzzle — module load |
| `TEMPLATE_DETERMINANT` | Bareiss on a 14×14 integer matrix — `O(n^3)` = ~2,700 operations |
| Template inverse | two Gauss–Jordan passes (mod 4, mod 3) + recombination, memoised |
| Draw | 18 `randomInt` calls |
| Distance check | one hash-set lookup, against a set of ~330 keys built once |
| Scramble | one 14×14 matrix-vector multiply = 196 multiply-adds |

**No search anywhere.** Scramble generation is `O(1)` with a small constant, and
that constant is one matrix multiply.

### Memory usage

| | |
|---|---|
| Template matrix + inverse | two 14×14 integer arrays ≈ **3 KB** |
| One-turn state set | ~330 string keys ≈ **50 KB**, built lazily on first 4b3 check |
| Total | **well under 100 KB** |

By four orders of magnitude the smallest footprint in the package. There is no
pruning table because there is nothing to prune.

### Expected scramble generation time

Measured on the development machine (Windows 11, Node 22.14):

| | |
|---|---|
| Cold — first `generateScramble('clock')` in a fresh process | **6.7 ms** |
| Steady state, `npm run bench` | **0.0108 ms** (≈ 93,000 scrambles/second) |
| Steady state, public async API | 0.097 ms mean, 0.119 ms p90 |

Effectively **no cold start** — the lowest of any implemented event. Note where
the work lands: `TEMPLATE_MATRIX` and `TEMPLATE_DETERMINANT` are module-level
constants, so they are computed when the package is *imported*, not on first use.
The 6.7 ms above is the two genuinely lazy pieces — the `Z12` matrix inverse and
the ~330-key one-turn set the 4b3 check needs.

---

## 8. Known limitations

### Current bugs

None known.

### Rough edges, stated plainly

1. **The solving distance is capped at 2, and cannot be more.** The module
   cannot answer "how many turns is this state from solved" for any state that
   is two or more away. That is sufficient for 4b3 and is documented at the
   function, but it does mean the Clock is the one puzzle here whose scrambles
   carry no measured difficulty at all. Computing the true distance would need a
   shortest-vector-style search over `Z12^14` in the puzzle's own move metric —
   a substantially different piece of work, and one the regulation does not ask
   for.
2. **The published God's number of 12 is in a metric this package does not
   compute**, so it cannot be reproduced here the way the Pyraminx's and
   Skewb's 11 are. It is quoted as context, not used as a check.
3. **The one-turn set is keyed by joined strings.** ~330 entries built once, so
   the cost is negligible, but it is the same string-keyed pattern flagged as a
   rough edge on the Skewb.
4. **Only the official template is supported.** A caller wanting a different
   token order would need a different basis — the code would work (any
   unimodular set would), but nothing exposes that.
5. **The drawn pin bits reach nothing.** `randomClockState` still draws four
   uniform pin bits, and since 0.14 stopped emitting the closing declaration
   nothing renders them. They are kept because `ClockState` models the pins and
   because keeping the draw is what makes the format change purely subtractive
   — but a reader should know the scramble's pin state is now fixed by the
   template (all four down at the front) rather than by the draw.

### Planned improvements

- Nothing outstanding. This module is complete, fast, and its central claim
  (unimodularity) is proved by computation rather than assumed.

---

## 9. References

### WCA regulations

- [WCA Regulations](https://www.worldcubeassociation.org/regulations/) — 4b3
  (random state, at least 2 moves, equal probability). No exception clause names
  the Clock.

### Published figures used as cross-checks

- [Jaap Scherphuis — Rubik's Clock](https://www.jaapsch.net/puzzles/clock.htm) —
  the gearing mechanism, the `12^14 = 1,283,918,464,548,864` state count, and
  the published God's number of 12.
- [Rubik's Clock (Wikipedia)](https://en.wikipedia.org/wiki/Rubik%27s_Clock) —
  the same state count and the fourteen-independent-dial argument.

### Mathematics

- The **Chinese Remainder Theorem**, `Z12 ≅ Z4 × Z3` — what makes inversion over
  a non-field possible in `utils/mod-matrix.ts`, and why a pivot search that
  only accepts units is guaranteed to succeed in each factor.
- Erwin H. Bareiss, *Sylvester's Identity and Multistep Integer-Preserving
  Gaussian Elimination*, Mathematics of Computation 22 (1968) — the fraction-free
  determinant used to establish unimodularity exactly.
- **Unimodular matrices** as bases of `Z^n`: determinant ±1 ⟺ the inverse is also
  integral ⟺ the rows are a basis of the full integer lattice, and therefore of
  `Z12^14`.

### Related documents in this repository

- `docs/square1-design.md` — the design-document standard this one follows.
- `docs/megaminx-design.md` — the other puzzle here with no solver, for the
  opposite reason (a regulation choosing random moves, rather than a group
  structure making a solver unnecessary).
