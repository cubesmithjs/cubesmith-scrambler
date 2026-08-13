# Changelog

This file starts at **0.10.0**. Versions `0.1.0` through `0.9.1` shipped without
one and no entries have been reconstructed for them — an invented history would
be less useful than an honest gap. What each earlier version added is recorded
in the `docs/*-design.md` header lines ("shipped since v0.4", and so on).

The package is pre-1.0, so by convention a **minor** bump may carry breaking
changes and a patch bump may not.

---

## 0.14.0

Two events emit a different string than they did in `0.13.0`: **`clock` now matches
TNoodle's token format exactly**, and **`444`/`444bf` scrambles are roughly 40%
shorter**.

`0.14.0` rather than `0.13.1` because both are behaviour a consumer can see. Pre-1.0,
a visible behaviour change belongs in a minor.

🔴 **The random distribution is unchanged, and this is the sentence to read before any
other.** No scramble this package produced before `0.14.0` was invalid. `444` drew a
uniformly random state, solved it and printed the inverse then, and does exactly that
now — the solver got better at finding a short *solution* to the same drawn state. The
χ² check over the sticker distribution reads **4.89** against df 5 (96 free stickers,
0 fixed, n=120) after these changes, where it read 5.32 before them; the untouched
`333` control reads 3.79, 4.66 and 5.22 across the same runs, which is the noise floor.
**The old scrambles were long, not wrong.**

### `clock` — exactly fifteen tokens

TNoodle-WCA-1.2.3 emits fifteen tokens and ends on the second `ALLn±`. This package
appended bare pin names describing the final pins-up state — an older convention —
which made its output 15 to 19 tokens and, more to the point, made the string differ
from the official one *in kind* rather than in length.

```
before  UR1- DR5- DL5- UL2+ U5+ R6+ D6+ L0+ ALL1+ y2 U6+ R5- D1- L4+ ALL5+ DL UL
after   UR1- DR5- DL5- UL2+ U5+ R6+ D6+ L0+ ALL1+ y2 U6+ R5- D1- L4+ ALL5+
```

🔴 **Emit narrow, accept wide.** `validateScramble('clock', …)` and the `./draw` layer
still accept a scramble carrying the trailing pins — a scramble already stored in a
consumer's database was written that way, and rejecting it later would turn a cosmetic
change into data loss. 500 legacy strings are re-parsed, re-printed byte-identically
and checked to reach exactly the state they always did.

A defect in the removed format is worth recording, because it is a third reason it had
to go: "leave all four pins up" is named by the *empty* declaration, which renders as
the empty string and is filtered out. As a token array the intent survived; as **text**
— the only form a competitor or a database ever sees — it did not. One draw in sixteen
printed a scramble whose declared pin state was not the one drawn.

### `444` / `444bf` — 137 moves to 74

| | before | after |
|---|---|---|
| `444` | 94–205, mean 137.5 | **56–114, mean 73.8, median 69** |
| TNoodle-WCA-1.2.3, for reference | 42–46 | 42–46 |

A scramble a delegate could not practically apply is now one they can. It is still
longer than the official program's, and `docs/444-design.md` §8 states that gap as an
**accepted, measured ceiling** rather than an open task, with the reasoning.

Five changes did it, each measured on a fixed set of states:

1. **Cancellation across the phase joins.** Each phase returned a sub-solution
   canonical on its own and nothing looked across a join, leaving 30 redundant moves in
   four scrambles. 154 → 137.
2. **Choosing the reduction route.** Which parity case a reduction lands in is a
   property of the *route*, not the state — 6 states in 10 have a route needing no
   parity work while their first route does not. 137 → 127.
3. **Parity gadgets shortest-first**, and a **doubled pass** for the landing that
   provably cannot finish in one. 127 → 119.
4. **Searching the pairing for total word length** instead of edges-paired-per-step.
   The old greedy averaged 7.2 moves a generator where the library's shortest is 5, with
   a 29-to-63 spread on identical inputs. 119 → 86, and at **a sixth** of the time it
   replaced.
5. **Choosing OLL parity away instead of repairing it.** Only the 12 wide quarter turns
   are odd on the 24 wings, so wing parity is frozen the moment phase 1 ends — and on a
   reduced cube that *is* OLL parity. It is now chosen at phase 1 rather than fixed
   afterwards by a gadget and a whole fresh pairing. 86 → 74, and **faster**: 23 states
   in 30 need no parity pass at all.

**Timing.** A warm `444` solve measures about **1 s** (813 ms and 964 ms on two runs of
30 states). It is faster than `0.13.0`, not slower, which is worth saying because a
solver that searches more usually is not: a parity pass costs a whole fresh pairing, and
most solves no longer have one. `prepareEvent('444')` also now builds the compiled
pairing library, which was previously left to whichever scramble happened to be first.

### Everything else is unchanged

No public API was added, removed or altered. `generateScramble`, `generateScrambles`,
`prepareEvent`, `validateScramble`, the notation layer and the `./draw` entry all keep
their signatures and their types. The other fifteen events emit exactly what they did
in `0.13.0`.

### Added

- **A per-event move-count gate** (`src/core/move-count.test.ts`). No test anywhere in
  the package bounded the length of the string it finally emits, which is why a
  156-move `444` reached a printed scramble sheet. All seventeen events now carry a band
  sourced from a real TNoodle-WCA-1.2.3 document, and an event that deviates is pinned
  as a **recorded defect naming the decision that owns it** rather than having its band
  widened until the suite passes.

### Changed

- `clock` emits fifteen tokens and no trailing pin declaration. The parser is unchanged
  and still accepts the old form.
- `444` and `444bf` emit substantially shorter scrambles. Seeded output for both events
  differs from `0.13.0`; the distribution does not.

### Fixed

- `prepareEvent('444')` no longer leaves the compiled pairing library to be built by the
  first scramble.

## 0.13.0

Two capabilities a **competition scramble set** needs and `0.12.0` did not have: a
**batch draw** and **2D scramble drawing for all seventeen events**. Plus a
`prepareEvent` helper, and one cosmetic correction to Square-1's emit format.

`0.13.0` rather than `0.12.1` because there are two new public surfaces and a
**second entry point**. Not `1.0.0` — the package stays pre-1.0.

**The batch API closes a measured bug rather than saving a loop.**
`generateScramble` builds its `RandomSource` from the seed on *every* call, so the
only batch idiom available before this — a caller-side loop — returned the **same
scramble N times** whenever a seed was passed. `generateScrambles` creates one source
for the whole batch, which is what makes a seeded batch both reproducible and made of
different scrambles. The trap is asserted next to the fix in
`core/generate-scrambles.test.ts` so the two cannot drift apart.

**Nothing breaks.** Every change to the main entry is additive. `generateScramble`,
its options and its result type are untouched; its existing tests pass unmodified.
The one behaviour change anywhere is Square-1's comma spacing, which affects what the
package **emits** and deliberately not what it **accepts** — see *Changed*.

**Bundle size**, both entries measured with `zlib.gzipSync`:

| | `0.12.0` | `0.13.0` | Delta |
|---|---|---|---|
| Main entry, raw | 219,870 B | 226,735 B | +6,865 B (+3.12%) |
| Main entry, gzip | 48,319 B | 49,559 B | +1,240 B (+2.57%) |
| `./draw` entry, raw | — | 97,059 B | new |
| `./draw` entry, gzip | — | 23,592 B | new |

🔴 **The main entry grew, and here is why** — because the whole point of `./draw` was
that it must not. The growth is `generateScrambles`, `prepareEvent`, `MAX_BATCH_COUNT`,
the per-puzzle `prepare` functions and the shared `scramble-draw.ts` helper. **None of
it is drawing code**: `src/draw/bundle.test.ts` reads the built `dist/index.js` and
asserts that seven drawing-only symbols — including a Megaminx colour value that
appears nowhere else in the package — are absent, so the split is verified on the
artefact rather than trusted.

A `.d.ts` note for the main entry, held to the same standard `0.12.0` set: additions
only. The `export { … }` list gains `generateScrambles`, `prepareEvent` and
`MAX_BATCH_COUNT`, plus the `GenerateScramblesOptions` type. No declaration is removed
or modified.

### Added

- **`generateScrambles(event, count, options)`** — *N* scrambles for one event from
  **one** random source. Returns them in draw order, and `result[i]` being the *i*-th
  draw is part of the contract, because a consumer mapping a batch onto (group,
  attempt) slots relies on it. Duplicates are **not** removed: each draw is its own
  uniform draw, so a repeat is a legitimate outcome and filtering would bias the
  distribution.
- **`options.onProgress(done, total)`** — **awaited**, and that is the package's entire
  answer to a long batch blocking a thread. Called after each scramble, never before
  the first, exactly `count` times; a throw from it propagates and stops further draws,
  which is the cancel path (so no `AbortSignal`, and no DOM type in the package's
  types). 🔴 The README states the distinction that matters: an `await` on the promise
  `generateScramble` returns is **not** a yield point — that continuation is a
  microtask, and a microtask cannot interleave with rendering, which is why a naive
  per-item `await` loop leaves a progress bar frozen at zero.
- **`options.cubesPerAttempt`** — for `333mbf` only. `count` is how many attempts,
  `cubesPerAttempt` is how many cubes in one attempt, and neither borrows the other's
  meaning. It maps onto the existing per-call `count`, so `MAX_SCRAMBLE_COUNT` keeps
  governing cubes-per-attempt exactly as before. Passing it for any other event throws
  `InvalidScrambleCountError`.
- **`MAX_BATCH_COUNT` (500)** — a runaway guard, not a regulation, and deliberately a
  *different* number from `MAX_SCRAMBLE_COUNT`: one bounds a batch and the other bounds
  cubes per multi-blind attempt, and reusing one would cap `555` (about 1 ms a
  scramble) at the same 100 as `444bf`.
- **`prepareEvent(event)`** — builds a puzzle's lookup and pruning tables on purpose,
  rather than charging them to the first scramble a user is waiting for. Resolves
  immediately for an event with nothing to precompute (`clock` is linear algebra over
  `Z12`; `minx` is random-moves), which is not an error. 🔴 It is **not** implemented as
  "generate a scramble and throw it away": a discarded draw consumes entropy and would
  shift every later scramble under a seed, turning a performance helper into a
  correctness hazard. A test asserts a seeded batch is byte-identical with and without
  a preceding `prepareEvent`.
- **A second entry point, `@cubesmith/scrambler/draw`** — 2D scramble drawing for all
  **seventeen** events, as data (`ScrambleImage` / `ImageShape`) plus a thin
  `scrambleImageToSvg` serializer, with `drawScramble`, `defaultColorScheme`,
  `isDrawableEvent` and `drawableEvents`. Geometry, layout constants and colour values
  read from `thewca/tnoodle-lib` source. Pure computation: no DOM, no canvas, no WebGL.
  Three new error types — `UnimplementedDrawingError` (no picture, deliberately not
  `UnimplementedEventError`, which means no *scrambler*), `UnsupportedScrambleError`
  (valid cube notation a scramble never contains: a slice move, a layer range, a
  commutator) and `InvalidColorError`. A malformed scramble throws the package's
  existing `AlgorithmSyntaxError` / `ScrambleSyntaxError` **unwrapped**, so a consumer
  already handling those keeps its handling. Full design, and what is *not* claimed, in
  `docs/drawing-design.md`.

### Changed

- **Square-1 emits `(-3,-4)`, not `(-3, -4)`** — no space after the comma, which is
  TNoodle's spelling verbatim (`"(" + top + "," + bottom + ")"`). Cosmetic, and
  cosmetics are the entire function of a scramble sheet: a competitor who has read a
  thousand TNoodle sheets notices, and any line-by-line comparison between the two
  programs previously reported *every* row as different. The single space between
  tokens and the trailing slash were checked against TNoodle's `AlgorithmBuilder` join
  and are unchanged; the comma was the only difference.

  🔴 **A scramble stored in the old spelling remains valid.** The parser was not
  narrowed: `(-3,-4)`, `(-3, -4)`, `( -3 , -4 )` and a string mixing them all still
  parse, with or without the trailing slash. The emitted set and the accepted set are
  deliberately different, and `core/validate-scramble.test.ts` pins each spelling as
  intentional rather than incidental.

### Measured

Per-event cost on the development machine (Windows 11, Node 22, 2026-08-11), each
figure from a **fresh process** so a shared table cannot make a later event look cheap:

| Event | cold (ms) | warm (ms) | Event | cold (ms) | warm (ms) |
|---|---:|---:|---|---:|---:|
| `222` | 4857 | 0 | `333mbf` | 8657 | 233 |
| `333` | 8850 | 103 | `444bf` | 15,324 | 1123 |
| `444` | **15,382** | 241 | `555bf` | 20 | 0 |
| `555` | 14 | 1 | `minx` | 5 | 1 |
| `666` | 19 | 1 | `pyram` | 208 | 0 |
| `777` | 25 | 2 | `clock` | 11 | 0 |
| `333bf` | 8062 | 246 | `skewb` | 739 | 0 |
| `333fm` | 8381 | 109 | `sq1` | 4239 | 740 |
| `333oh` | 8251 | 212 | | | |

What `prepareEvent` moves, same conditions:

| Event | `prepareEvent` | first scramble after | warm |
|---|---:|---:|---:|
| `222` | 4803 | **5** | 0 |
| `333` | 8184 | **110** | 46 |
| `444` | 11,550 | 4462 | 1137 |
| `sq1` | 3242 | 1553 | 51 |
| `skewb` | 746 | **10** | 0 |
| `pyram` | 218 | **5** | 0 |

🔴 **`444` is the one event where preparing does not make the first scramble as fast as
the tenth**, and saying so is more useful than a claim that reads better. Two things are
left lazy on purpose: the per-group wing-pair tables (building all six costs about 8.5 s
that one scramble does not need, and measurably makes the *total* worse) and the
centre-generator library (a search, not a table, and more expensive to pre-build than a
first scramble is). `sq1` leaves about 1.5 s for the same reason.

Two gaps in this helper were found by measuring rather than by reading, and both had
already been written and doc-commented as if they worked: `prepare333Tables` built the
phase **move** tables and not the phase **pruning** tables, which live in their own
modules — `prepareEvent('333')` cost 624 ms and the first scramble after it still cost
7719 ms — and `prepareSquare1Tables` built the solver's tables and not the *draw's*.
`core/prepare-event.test.ts` now times the scramble that comes **after** a prepare,
which is the only arrangement that can see either.

## 0.12.0

**Every one of the seventeen events can now be validated**, not only the twelve
written in cube notation — with the same quality of answer the cube path has had
since `0.11.0`: a stable reason code, an offset, a length, and no English
sentence to string-match.

This was less "write five parsers" than it sounds. All five bespoke parsers —
Megaminx, Clock, Pyraminx, Skewb, Square-1 — already existed inside the package,
tested, and were **re-exported from nowhere**. What they lacked was error parity:
each threw a bare `Error` carrying an English sentence, no offset, no span and no
code. Exporting them unchanged would have shipped an API that is localizable for
twelve events and not for five, undoing the point of the release before it.

**Nothing breaks.** Every change is additive, and the claim was checked rather
than asserted: the built `dist/index.d.ts` was diffed against `0.11.0`'s. Every
existing declaration is byte-identical, **no line is a removal or a
modification**, and the only line that is not a pure addition is the single
`export { … }` statement, which gains eight names and loses none (37 → 45).

**Bundle size**, measured on both builds with the same command
(`zlib.gzipSync` on `dist/index.js`):

| | `0.11.0` | `0.12.0` | Delta |
|---|---|---|---|
| Raw | 210,783 B | 219,870 B | +9,087 B (+4.31%) |
| Gzip | 46,187 B | 48,327 B | +2,140 B (+4.63%) |

The package has one entry point, so this ships to every consumer whether they
validate anything or not. That is the honest framing, and it is why the new
surface is as small as it is.

### Added

- **`validateScramble(event, text)`** — one door onto all six grammars, keyed on
  a `WcaEventId`. Returns `{ valid: true, notation }` or `{ valid: false,
  notation, error }` and never throws for bad input. Twelve events dispatch to
  `parseAlgorithm`; the other five to their own parser. The event → notation map
  is **derived** from a five-row table rather than a hand-maintained
  seventeen-row one, and `corpus.test.ts` now imports the same table instead of
  keeping its own copy.
- **`ScrambleSyntaxError`** — the bespoke-notation sibling of
  `AlgorithmSyntaxError`, carrying `notation`, `input`, `offset`, `length`,
  `reason` and whichever of `token`, `char`, `pins`, `hours` the code uses. A
  `length` of `0` still means text is **missing** rather than wrong.
- **`ScrambleErrorReason`** — **thirteen** stable codes (twelve real ones plus
  the documented residual), each prefixed by the grammar that produces it. The
  count is read off the union by `readme.test.ts`, not written in prose:
  `megaminx-not-a-move`, `megaminx-bad-direction`, `pyraminx-not-a-vertex`,
  `pyraminx-bad-amount`, `skewb-not-a-corner`, `skewb-bad-amount`,
  `clock-not-a-token`, `clock-not-a-pin-set`, `clock-hour-out-of-range`,
  `clock-pin-not-a-corner`, `square1-stray-character`, `square1-zero-turn`,
  `unexpected-token`. Every one of the twelve has a test that produces it.
- **Whole-string parsers for the token-based trio** — `parseMegaminxScramble`,
  `parsePyraminxScramble`, `parseSkewbScramble`. Internal: they wrap the existing
  per-token functions, which are on the generation path and are unchanged.
- **Offsets on the two that already parsed whole strings.**
  `parseSquare1Scramble` now reports the `match.index` it already had in scope;
  `parseClockScramble` moved off `text.split(/\s+/)`, which discarded positions,
  onto a new offset-keeping tokenizer. Both now throw `ScrambleSyntaxError`
  instead of a bare `Error`; their successful behaviour is unchanged, and their
  messages keep the `<notation>-notation:` prefix they always printed.
- **`notationForEvent(event)`**, plus the types `ScrambleValidation`,
  `ScrambleSyntaxErrorDetail`, `Notation` and `BespokeNotation`.

### Notes

- 🔴 **`ScrambleSyntaxError` is deliberately not a subclass of
  `AlgorithmSyntaxError`**, and `ScrambleErrorReason` deliberately not new
  members of `SyntaxErrorReason`. Subclassing would make `error instanceof
  AlgorithmSyntaxError` true for a Clock failure, so an existing
  catch-and-classify would silently receive codes its table has never heard of;
  extending the union would stop a cube-only consumer's exhaustive
  `Record<SyntaxErrorReason, …>` compiling on upgrade, even though nothing it
  does had changed. Two grammars, two unions, two classes. Asserted in both
  directions by a test, because this is exactly what a later "tidy the class
  hierarchy" refactor would undo.
- 🔴 **No locale strings ship, and none ever will** — the same rule `0.11.0` set,
  restated because it is the one most likely to be assumed away for a new set of
  codes.
- **The valid arm carries no parsed form.** There is no shared tree to hand back:
  five notations, five node types, and merging them would be actively wrong — a
  Pyraminx `2` means *counterclockwise*, not a half turn. Publishing all five
  internal ASTs would freeze five shapes written for a solver's convenience, so
  they stay private. Adding a payload later is additive; removing one would not
  be, which is why the door is left open rather than nailed shut.
- **The five ASTs stay unmerged, and `parseAlgorithm` stays intolerant.**
  `corpus.test.ts` still asserts it **throws** on generated `minx`, `clock` and
  `sq1` scrambles, unchanged. `validateScramble('minx', …)` routing to the
  Megaminx grammar is the point; `parseAlgorithm` learning Pochmann notation
  would have broken the thing this release exists to serve.
- **This is syntax only.** Whether a scramble is WCA-legal — Regulation 4b3
  floors, orientation suffixes, shape distributions — is `scramble-shape.ts`'s
  business and is not asked here, and whether `(13, 0)` is reachable on a real
  Square-1 is a question about a puzzle. Empty input is valid for every notation,
  agreeing with `validateAlgorithm`.
- **No throwing sibling ships.** The five parsers already throw; a consumer who
  wants that shape writes a two-line wrapper whose behaviour they choose.
  Doubling the public surface, the docs and the README's executed examples for a
  wrapper was not worth it. Revisit if asked for.

---

## 0.11.0

A notation syntax error is now **machine-readable and localizable**, and there
is a **non-throwing** way to ask whether a string is valid notation.

**Nothing breaks.** Every change in this release is additive, and that claim was
checked rather than asserted: the built `dist/index.d.ts` was diffed against
`0.10.0`'s, and the only line that is not a pure addition is
`AlgorithmSyntaxError`'s constructor gaining an **optional** fourth parameter,
which every existing call still satisfies. `.name`, `.message`, `.input` and
`.offset` are byte-for-byte what `0.10.0` produced, and a test now pins the
message format so a later refactor cannot quietly change it.

### Added

- **`reason` on `AlgorithmSyntaxError`** — a stable `SyntaxErrorReason` string
  code, one of twenty, covering all eighteen conditions the parser and
  tokenizer distinguish. Before this, classifying an error meant string-matching
  an English sentence, which made every wording change a silent breakage for the
  consumer; the parser knew the difference between `Mw` and `3R` and `R''` and
  reported one opaque string for all of them.
- **The data a message needs to interpolate**, beside the code: `char`,
  `family`, `outer`/`inner`, `count` — whichever the code carries.
- **`length` on `AlgorithmSyntaxError`** — how many characters at `offset` the
  problem covers, so a caller can underline the offending *token* (`Q2`,
  `2-3Rw`) rather than only pointing at its first character. It is free at throw
  time and cannot be reconstructed afterwards without re-tokenizing. A `length`
  of `0` means the text is **missing** rather than wrong (`2-Rw` has no second
  number to underline) — render a caret there, not a zero-width selection.
- **`validateAlgorithm(input)`**, returning
  `{ valid: true, algorithm } | { valid: false, error }`. `parseAlgorithm` still
  throws, unchanged, and is still the right call when invalid input is
  exceptional. This is for the other calling context — a text field validated on
  every keystroke, where invalid-while-typing is the normal state and an
  exception per keypress is control flow. It agrees with `parseAlgorithm` that
  empty input is the empty algorithm, returns the tree on the valid arm so you
  do not tokenize twice, and **re-throws anything that is not a syntax error**:
  a bug in this package must not be reported to your user as their typo.
- **`SyntaxErrorReason`, `AlgorithmSyntaxErrorDetail` and `AlgorithmValidation`**
  are exported types.

### Notes

- 🔴 **No locale strings ship, and none ever will** — not even an English table
  keyed by code. The package returns a code and its data; the sentence belongs
  to the consumer, in the consumer's language. `.message` remains the English
  one and remains the right thing to log.
- **`stray-comma` and `stray-colon` are enumerated** rather than folded into the
  catch-all they used to share. `unexpected-token` survives as the documented
  residual — nothing the parser currently produces reaches it, and an
  `AlgorithmSyntaxError` constructed without a detail reports it rather than
  claiming a precision it does not have.
- **One error per parse, still.** `parseAlgorithm` stops at the first problem and
  this release keeps it that way. Multi-error reporting needs error recovery,
  which is a substantially larger parser.
- Bundle: `dist/index.js` grows from 207,943 B raw / 45,432 B gzip to
  **210,783 B raw / 46,187 B gzip** — `+2,840 B` raw (`+1.4 %`), `+755 B` gzip
  (`+1.7 %`). Measured with the same command on both builds, which is why the
  `0.10.0` gzip figure here differs by 35 B from the one recorded in that
  release's notes. The package has a single entry point, so this ships to every
  consumer whether it parses notation or not.
- `docs/notation-design.md` §2 carries the full code table and the four design
  decisions behind it (why `layer-count-too-small` and `layer-count-without-w`
  stayed separate, why `unclosed-bracket` is one code down two paths, why the
  residual is documented rather than removed, and why the error class uses flat
  optional fields while the validation result uses a discriminated union).

---

## 0.10.0

Event coverage reaches **17 of 17**, two events' scrambles change, and the
package can now read the notation it writes.

### ⚠️ Breaking: two events produce different scrambles for the same seed

Neither is an API change — no export was removed or altered — but if you have
recorded seeded fixtures or snapshot tests for either event, they will change.

- **`333fm` — the old output was not a Fewest Moves scramble at all.** It was
  registered as a plain alias for `333`. Every official FMC scramble is padded
  `R' U' F` … `R' U' F`; TNoodle, the official WCA scramble program, models it
  as a separate puzzle class (`ThreeByThreeCubeFewestMovesPuzzle`) for exactly
  this reason. If you recorded `333fm` fixtures before this release you
  recorded invalid data — re-record them, but do not assume the old ones were
  merely differently-shaped.
- **`444bf` now ends with a random whole-cube rotation** (`x`, `y`, `z`).
  Previously it carried no orientation suffix, on the argument that an even
  cube has no fixed centre and so no observable orientation. TNoodle appends
  one anyway — and appends a *rotation*, which cannot change the state, only
  how the competitor is told to hold the puzzle. cubing.js agrees that `444bf`
  differs from `444`. The full argument and why it was overruled is in
  `docs/444-design.md` §11.

### Added

- **`333mbf` (Multi-Blind)** — the last unimplemented event. One attempt covers
  many cubes, so `generateScramble` gained an optional `count` and
  `ScrambleResult` an optional `scrambles`. `moves` is still `scrambles[0]`, so
  existing callers are unaffected. Draws are independent and deliberately not
  de-duplicated. `count` is capped at the new `MAX_SCRAMBLE_COUNT` (100) — a
  guard against blocking a caller's main thread, not a regulation — and passing
  it to any other event throws the new `InvalidScrambleCountError` rather than
  being silently ignored.
- **An algorithm-notation layer**: `parseAlgorithm`, `serializeAlgorithm`,
  `invertAlgorithm`, `AlgorithmSyntaxError` and the AST types. Reads face,
  wide, slice and rotation moves (including `3Rw`, `2-3Rw` and lowercase `r`),
  groups with repetitions, commutators, conjugates, pauses and `//` comments,
  nested arbitrarily; syntax errors carry the offset. It is **syntax only** —
  there is no puzzle behind it, so no `simplify()` and no move cancellation.
  See `docs/notation-design.md`.

### Fixed

- **Regulation 4b3's two-move floor now applies to every one of the seventeen
  events.** It was missing for `333`, `333oh` and `minx`, while `README.md`
  claimed it was enforced everywhere. Seeded output for those events is
  unchanged — the first draw clears the floor with probability
  `1 − 4 × 10⁻¹⁹` — so this is additive in practice and a conformance fix in
  principle.

### Notes

- `parseMove`, `moveToString`, `movesToString`, `inverseMove`, `inverseMoves`,
  `FACES` and `AMOUNTS` are unchanged and not deprecated. They are the narrow
  face-move primitives the cube puzzles are built on, and the new notation
  layer does not supersede them.
- Bundle: `dist/index.js` is 207,943 B raw / 45,397 B gzip, of which the
  notation layer accounts for 10,966 B raw / 2,743 B gzip.
- Two known defects are documented rather than fixed, both far below anything
  observable and both breaking seeded output if fixed: a same-face pair can
  print at the phase-1/phase-2 boundary of a 3x3x3 solve
  (`docs/333-design.md` §8), and Megaminx's floor is measured against the
  identity state rather than "solved up to whole-puzzle rotation"
  (`docs/megaminx-design.md` §8).
