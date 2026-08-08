# Changelog

This file starts at **0.10.0**. Versions `0.1.0` through `0.9.1` shipped without
one and no entries have been reconstructed for them — an invented history would
be less useful than an honest gap. What each earlier version added is recorded
in the `docs/*-design.md` header lines ("shipped since v0.4", and so on).

The package is pre-1.0, so by convention a **minor** bump may carry breaking
changes and a patch bump may not.

---

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
