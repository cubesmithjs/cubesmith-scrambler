# 2D scramble drawing — design

> Shipped in **0.13.0**. Entry point: `@cubesmith/scrambler/draw`.
>
> Plan: [`cubesmith-scrambler-plans/plans/scramble_drawing_and_batch_plan/`](https://github.com/DrSiroukane/cubesmith-scrambler-plans),
> spec: `02-tnoodle-drawing-spec.md`.

## 1. What this is, and what it deliberately is not

The flat sticker picture that appears beside every scramble on an official WCA
scramble sheet, for all seventeen events, as **data** plus an optional SVG string.

For a *picture* the Regulations say nothing at all, so TNoodle is the only
specification there is — which is exactly why "the same as TNoodle" is a meaningful
requirement here rather than a preference. Every constant, layout formula and colour
below was read from [`thewca/tnoodle-lib`](https://github.com/thewca/tnoodle-lib)
`master`, package `org.worldcubeassociation.tnoodle.puzzle`.

**Out of scope, and staying out:** 3D rendering, `twisty`, WebGL, `customElements`
— refused on the same grounds as `cubingjs_parity_plan/01-gap-assessment.md` §C1.
2D is in scope precisely *because* it is pure geometry: it needs no browser API,
only numbers and colour strings. Also out: PDF generation, sheet layout, fonts, QR
codes and passcodes. Those are TNoodle *application* concerns and belong to the
consumer.

## 2. Data first, SVG as a thin serializer

```ts
drawScramble(event, scrambleText, colorScheme?) → ScrambleImage
scrambleImageToSvg(image) → string
defaultColorScheme(event) → Readonly<Record<string, string>>
isDrawableEvent(event) → boolean
drawableEvents() → WcaEventId[]
```

`ScrambleImage` is `{ event, width, height, strokeWidth, shapes }` where a shape is
one of `rect` / `polygon` / `circle` / `path`, each carrying `fill`, `stroke`, an
optional `strokeWidth` and an optional `face` (the colour-scheme key it wears, when
it is a sticker).

This mirrors TNoodle, whose `drawScramble` returns an `Svg` *document object* built
from `Rectangle`/`Circle`/`Path` primitives rather than a string each puzzle
concatenates. It earns its keep three times:

- A **React** consumer maps `shapes` to elements. An SVG string would force
  `dangerouslySetInnerHTML` — the wrong default anywhere near organiser-authored
  content — and lose per-sticker keys, `title`s and click targets.
- A **print/PDF** consumer wants the string, and `scrambleImageToSvg` is a thin
  serializer over the same data.
- **Tests can assert geometry** — "the U-face centre rectangle is at (x, y) and is
  white" — instead of string-matching markup. That is the only way the parity claim
  is checkable at all.

Coordinates are in TNoodle's own unit space with no `viewBox` scaling baked in;
`width`/`height` are its `getPreferredSize()`. Transforms are applied **eagerly**
rather than emitted as a `transform` attribute, because "every shape lies inside
`0..width` × `0..height`" is the invariant that catches a transposed offset, and it
would be uncheckable without reimplementing matrix composition inside the test.

### 2.1 A second entry point

`package.json`'s `exports` carries `./draw`, `tsup` builds it as a second entry, and
🔴 **the main entry re-exports nothing from it.** One entry point would ship the
drawing layer to a consumer that only scrambles. `src/draw/bundle.test.ts` reads the
built `dist/index.js` and fails if a re-export is ever added — a source-level
convention would not survive a well-meaning barrel edit.

Measured at 0.13.0: main entry **226,735 B raw / 49,559 B gzip**; drawing entry
**97,059 B raw / 23,592 B gzip**.

`splitting: false` keeps each entry self-contained, so a consumer importing *both*
carries two copies of the puzzle state models. That is dead weight rather than a
correctness problem — every drawer builds its state from the scramble text, so there
is no shared mutable state to split — and it is what makes the absence check a fact
about one file rather than about a chunk graph.

### 2.2 Errors

Three, and each is a different thing to tell a user:

| Error | Means |
|---|---|
| `UnimplementedDrawingError` | no picture for this event. 🔴 Deliberately **not** `UnimplementedEventError`, which means no *scrambler* — two different absences |
| `UnsupportedScrambleError` | valid cube notation a scramble never contains: a slice move (`M`, `E`, `S`), a layer range (`2-3Rw`), or a grouping (`(R U)2`, `[R, U]`, `[R: U]`). Carries a stable `construct` code |
| `InvalidColorError` | a caller-supplied colour that is not `#rgb`/`#rrggbb`/`#rgba`/`#rrggbbaa`/a CSS named colour/`none` |

A **malformed** scramble is not in that table on purpose: it throws the package's
existing `AlgorithmSyntaxError` or `ScrambleSyntaxError`, **unwrapped**, so a
consumer already handling those from `validateScramble` keeps its handling. A pause
(`.`) is skipped rather than refused — it carries no turn.

### 2.3 Why a caller's colour is validated at the door

`scrambleImageToSvg` writes inline markup into a consumer's page, and a `fill`
attribute is a place a `"` closes early. Every value the serializer writes is either
a number this package computed or a colour string it produced — except a caller's
override, which is the one untrusted input in the whole layer. It is checked in
`mergeColorScheme` rather than escaped on the way out, so there is one place to be
right instead of one per attribute.

## 3. Per-puzzle notes

Layout constants, colour values and formulas are quoted in the source of each
drawer; what follows is only what a reader needs that is *not* a quotation.

### Cubes — twelve events, one drawing

`gap = 2`, `cubieSize = 10`, four face-columns `L | F | R | B` with `U` above `F` and
`D` below. Size comes from a **table** keyed on the event, never parsed from the
event id — `333mbf` and `444bf` would both break a clever parse.

🔴 The `(row, col)` convention was the single most likely thing to get silently
wrong: a transposed or mirrored face still looks like a cube. It is read off
TNoodle's own `getStickersByPiece`, which names which `[row][col]` of each face
belongs to which physical corner, and the outcome is what a reader of the picture
expects — each face's `(row, col)` is (top→bottom, left→right) *as it appears in the
net*. `cube.test.ts` pins it with orientation assertions for `R`, `U` and `F` against
a physical cube's behaviour, on two faces each.

The state comes from `puzzles/nxn/` — the facelet model, not `puzzles/333/state.ts`'s
cubie model, which carries permutation plus orientation rather than stickers and
would have needed a 54-entry mapping written by hand.

One gap in the shared model had to be filled here: `modelForSize` builds
permutations for the scramble move set plus the specific deeper blocks
`nxn/orientation.ts` needs, and for an **odd** cube that does not include a
full-depth block — so a bare `x`, `y` or `z` on a 3x3x3 has no permutation. Right for
the generator, which never emits one; not enough for a drawing, which takes pasted
text. `draw/cube.ts` derives the missing permutation with the same exported
`deriveFaceletPermutation` the model itself uses, and caches it, so nothing about
scramble generation changes.

### Pyraminx — 36 stickers, tips included

Each face's nine regions are three **tip**, three **axial** and three **edge**
stickers. 🔴 So the total is **36**, not 40: the tips live inside the nine-per-face
count, exactly as the spec's §4 says ("tips are drawn as part of the corner
regions"). Task 05's acceptance arithmetic (`4*9 + 4`) double-counts them; the code
and the tests follow the spec.

Which region is which was **verified, not assumed**: TNoodle's `turnTip(0)` is
`swap(0,0, 3,0, 2,3)`, and with the derived corner table those three indices are
exactly the three faces' stickers at puzzle vertex `U` — which is what a `u` tip turn
cycles. Its `turn(0)` adds the three axial stickers at `U` and two more cycles over
the three `U` edges' six stickers. Every index lines up.

Tips being drawn matters more than it sounds: most Pyraminx scrambles end in tip
moves, so a picture that ignored them would be wrong for nearly every real scramble
— and wrong in a way that still looks like a Pyraminx.

### Skewb — 30 stickers, and a frame conversion

Five per face: a centre diamond and four corner triangles in normalised `(-1..1)`
space, placed by six skewed transforms (the picture is an isometric-style unfold, not
a flat net).

🔴 Its colours are **not the cube's**: `R` is blue, `F` red, `L` green, `B` orange.
`puzzles.test.ts` asserts the scheme object itself so a future "let's unify the face
colours" cleanup fails a test.

The one derivation worth recording: this package holds corner `(1,1,1)` (WCA Fixed
Corner Notation, white up, green front-left) while TNoodle holds `(-1,1,1)`, so the
two frames differ. The map carrying this package's four turn axes onto TNoodle's
letter for letter is **`M(x, y, z) = (-z, y, x)`**, derived by matching all four axes
plus the held corner — five independent checks, all of which pass. Under it, the
Skewb net turns out to use the *same* `(row, col)` convention as the cube net, which
is a result rather than an assumption: each face's row/col axes were read off
TNoodle's own `turn()` tables.

### Megaminx — 132 regions

Twelve pentagons in two half-nets, each subdivided into ten outer regions plus a
centre. Twelve authored colours, and 🔴 the twelve **keys** are public contract — a
consumer overriding one needs the name, and these names are not guessable from the
cube's six.

Two things this drawer had to decide that the package's model does not fix:

1. **Which face centre wears which name.** `puzzles/megaminx/geometry.ts` names only
   `U_FACE` and `L_FACE` (U's lowest-keyed neighbour, chosen because "any neighbour
   would do"), because a *solver* needs an axis and an extent, not a colour. The
   drawing completes it from three facts: `U` and `L` are those two, so the drawing's
   names agree with what the notation already means; `turn(U)` cycles U's neighbours
   `BL → BR → R → F → L` and their drawn positions put that order clockwise from
   outside U, so walking clockwise from `L` gives the rest; and the lower six are
   forced as antipodes by `Face.oppositeFace()`. Any other choice of `L` yields the
   same physical picture with the colours rotated, which is why it is anchored to the
   notation rather than to taste.
2. **The rotational phase of each pentagon's sticker ring** — the one thing a picture
   can get plausibly and invisibly wrong. Read off TNoodle's `turn()` table: for each
   face, which neighbour's turn touches which run of its ten outer slots. Slots
   `2k, 2k+1, 2k+2` are the run shared with neighbour `k`, and the ring runs clockwise
   seen from outside. Checked on `U` (`BL BR R F L`) and on `F` (`L U R DR DL`).

`rotateFifths` works in floating point — a dodecahedron has no integer lattice — so
rotated vectors are snapped back onto the exact face-centre array entry, keeping
`positionKey` usable as an identity.

### Square-1 — two layer views and the middle bar

Top layer at `(width/2, height/4)`, bottom at `(width/2, 3*height/4)`; corner pieces
span 60°, wedges 30°. 🔴 Its scheme is its own again: `U` yellow and `D` white, the
reverse of the cube net.

🔴 **The lower layer is a mirror view, so its ring is walked backwards.** The upper
view looks down at `U`; the lower one looks *up* at `D`. Both rings are indexed in one
shared angular frame (that is what makes the slice expressible at all — see
`square1-design.md` §3), so drawing the lower one forwards, as the upper one is, puts
slot 0 where slot 11 belongs and runs the angle the wrong way. Reversing the ring maps
slot `i` to unit `11 - i`, which keeps a corner's two slots adjacent and so leaves the
piece walk untouched. The `[top, b, a]` swap in `pieceColors` belongs to that
reversal, not to the colours: reverse without swapping, or swap without reversing, and
every face is torn into three.

🔴 **The start angles are `±15°`, not TNoodle's `±105°`, and `SIDES` is `FLBR`, not
its `LBRF`.** This package's ring frame is TNoodle's turned a quarter: its cut plane
runs between slots `(2,3)` and `(8,9)`, where TNoodle's runs between `(11,0)` and
`(5,6)`. Where the cut sits **relative to the colours** is drawable — the middle bar
draws the `F` face split at one corner's width, which is only true if the cut bisects
`F` — so both the labels and the picture turn back by that quarter. The two turns
cancel on a *solved* puzzle, which is why either pair draws the same upper layer, and
they come apart one slice later, when `/` exchanges the wrong six wedges.

Both bugs shipped in 0.13.0 and 0.14.0 and were found by eye: on a solved puzzle the
lower layer drew as a diamond where the upper drew as a square. The three invariants
that now pin it (`square1SideRing` + contiguous face runs, rigid per-ring rotation,
and the slice exchanging exactly the wedges the bar claims) all read the **drawn
coordinates**, because a misordered ring emits exactly the right faces in exactly the
right counts — the only thing wrong is where each one landed. Every check that walked
the shape list in paint order passed throughout.

🔴 **The middle bar carries the slice-parity bit.** Two rectangles flank the centre;
the second takes the front colour when the slice is solved and the back colour when
it is not. That bit is the `x2` in `3678 × 8! × 8! × 2`, it is
`Square1State.middleFlipped`, and it is the one piece of Square-1 state a picture can
drop without looking wrong — dropping it makes two genuinely different states draw
identically.

One bug this cost, worth recording because TNoodle has it too:

> TNoodle's layer walk starts unconditionally at slot 0 and tests for a corner with
> `if(ch < 11 && face[ch] == face[ch+1])`, which assumes no corner spans the boundary
> between the last slot and the first. In *TNoodle's* frame that holds for every state
> it draws. In this package's frame it does not — the cut plane runs between slots
> `(2,3)` and `(8,9)` (`CUT_BOUNDARIES`), so a legal, twistable state can have a
> corner on slots 11 and 0. Starting at 0 there draws that corner **twice**, adding
> three polygons and advancing the rotation 120° for a 60° piece, sliding everything
> after it. Measured on a real seeded scramble: 47 polygons instead of 44. The fix is
> to start the walk at the first real piece boundary and advance the start angle 30°
> per skipped unit.

Two consequences for the tests, both of them facts about the puzzle rather than gaps:
the **whole-picture colour multiset is not invariant** (the bar is repainted, not
permuted — so the invariant is asserted over the forty piece polygons and the bar has
its own test), and a **layer's** mix of corners and edges changes with the shape,
though the total stays eight corners and eight edges.

### Clock — 332 shapes, both sides

Two round panels side by side, each nine dials with twelve tick marks, plus eighteen
hands and eight pins. The one puzzle that sets a document-level stroke width (2).

🔴 **Pins are decoration, not state.** TNoodle's `ClockState` is eighteen dial
readings and carries no pin positions, so each panel's four pins take a single colour
saying which side you are looking at. This package *does* model `pinsUp`, and the
drawing deliberately ignores it — drawing it would be a picture no official sheet
shows.

🔴 **The panel frame has to be recovered from the flip count.** TNoodle's left panel
is whichever side faces the solver when the scramble *ends*, and it tracks that with
a `rightSideUp` flag, swapping its two nine-dial halves on each `y2`. This package's
`ClockState` normalises instead, always reporting `front` and `back` in the front's
own frame. Both are complete descriptions, but they do not draw the same picture —
and an official Clock scramble contains exactly one `y2`, so ignoring the difference
would draw the two sides swapped on **every real scramble**. Counting the flips is
that one bit.

## 4. How parity is verified, and what is not claimed

Two halves, because neither is sufficient alone.

**Structural invariants** (`src/draw/__tests__/invariants.ts`) hold independently of
the transcription, so they catch a transposed offset or a mirrored face:

- shape count is exactly the sticker count — cube `6 × size²`, skewb 30, pyraminx 36,
  megaminx 132, clock 332;
- the empty scramble draws each face in **one** colour, and that colour is the
  scheme's own entry for it;
- every shape lies inside `0..width × 0..height`, and no two stickers share a slot;
- a scramble followed by its inverse draws the solved picture (20 seeded cases per
  bespoke puzzle, one per cube size) — with the inverse written **in the test from
  each notation's own rules**, so a shared mistake in the package's own inverter
  could not hide;
- the colour multiset is invariant under any scramble, since a move permutes stickers
  and never repaints one (Square-1's bar excepted, above);
- `width`/`height` equal TNoodle's formula, computed in the test from the quoted
  expression rather than hard-coded;
- specific named-slot assertions where a count would not do: the cube's `R`/`U`/`F`
  orientation pins, a whole-cube rotation leaving every face single-coloured *on a
  different face*, Pyraminx's tip-only scramble touching only tip stickers, Skewb's
  `R` moving exactly the three face centres TNoodle's `turn(axis=0)` names, Megaminx's
  `U` token touching only its five neighbours' adjacent runs.

**Golden fixtures** (`src/draw/__fixtures__/golden.json`, one shape per line) catch
what invariants cannot: a *uniform* shift. Every constant one pixel out, or a `gap`
applied twice, is still self-consistent and still passes every invariant above. A
committed fixture turns that into a reviewable diff.

### 4.1 🔴 The drawing tests generate no scrambles

Every scramble they draw is a **literal string** in `src/draw/__tests__/corpus.ts`.
Nothing under `src/draw/` imports `generateScramble`, and `cube.test.ts` and
`puzzles.test.ts` do not import `src/index.ts` at all.

That started as a cost problem and turned out to be a correctness one.

The cost: a drawing takes text, so generating a scramble to test a *picture* pays for a
two-phase search to produce a string that could be written down. Under
`npm run test:coverage` that is not a rounding error — V8 instrumentation slows the
solvers by roughly an order of magnitude, and the first version of these suites (twenty
seeded Square-1 draws, one generated scramble per cube size, eighteen generated golden
fixtures) **timed out at the 180 s per-test limit in CI**. The same suites now run in
under a second.

The correctness half is the better argument. A fixture whose input came from a seed is a
fixture that changes when the **generator** changes — and this package's 4x4x4 solver is
documented as non-optimal and open to improvement. The day someone improves it, every
seeded fixture would diff, in a file whose entire job is to make a *drawing* change
visible. Literal inputs mean a golden diff can only ever mean a drawing changed.

The corpus entries are real `0.13.0` output (`seed: 'lit-<event>-<i>'`, captured
2026-08-11) rather than hand-written notation, which matters for `444`'s 140-move
solutions and for `clock` and `sq1`, whose token grammars a hand-written sample gets
subtly wrong. Regenerating them needs no ceremony — they are inputs. The
**expectations** are `golden.json`, and regenerating *that* is a review step.

🔴 **What is not claimed: pixel-exact equality with an actual TNoodle SVG.** That
would need TNoodle built. The honest claim after this work is "geometry and colours
derived from TNoodle's source constants, with the formulas reproduced in tests, and
the sticker-index mappings cross-checked against TNoodle's own move tables". If pixel
parity is ever wanted, the way to get it is a fixture: run TNoodle-WCA-1.2.3 once,
commit its SVG for a known scramble, and diff shape by shape. That is a separate task
and was not in this plan.

## Sources

- [`thewca/tnoodle-lib`](https://github.com/thewca/tnoodle-lib) `master`, module
  `scrambles/`, package `org.worldcubeassociation.tnoodle.puzzle`: `Puzzle.java`,
  `CubePuzzle.java`, `SkewbPuzzle.java`, `MegaminxPuzzle.java`,
  `PyraminxPuzzle.java`, `SquareOnePuzzle.java`, `ClockPuzzle.java`
- [WCA Scrambles](https://www.worldcubeassociation.org/regulations/scrambles/) —
  TNoodle is the official program; current official release TNoodle-WCA-1.2.3
- `src/puzzles/**` — the state models the drawings read
