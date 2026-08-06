# Blindfolded events — conformance review

`333bf` and `555bf`, checked against the current WCA Regulations and against
what official scramblers are observed to produce. Written before v1.0, so that
anything wrong is wrong on paper first.

---

## 1. What the regulations require

**4b3** — random state, at least 2 moves to solve, equal probability for each
state. **4b3e** — 5x5x5 is random *moves* "instead of random state, at least 2
moves to solve": the move-count floor survives the exception.

**4b3a** — the clause that makes a blindfolded event more than an alias:

> For blindfolded events, the scramble sequence must orient the puzzle randomly
> (equal probability for each orientation).

This is needed because an ordinary scramble never moves a centre — a 3x3x3
scramble is all single-layer turns, and a 5x5x5 scramble uses only depth-1 and
depth-2 moves, neither of which touches the middle layer. Without a suffix the
cube always ends white-up green-front, and for a blindfolded solve the starting
orientation is part of what must be memorised.

---

## 2. What official scramblers do

For **3BLD**, TNoodle appends a move drawn from `{id, Rw, Rw2, Rw', Fw, Fw'}`
followed by one from `{id, Dw, Dw2, Dw'}`. That is `6 x 4 = 24` combinations:
six choices of which face ends up on top, four of how it is spun there. The
approach was chosen because it "keeps the same centers on U and F for most of
the scramble, is easy to understand and prove correct, and doesn't require
changing the solver", and the wide moves "are considered part of the scramble,
with scramble filtering done on the result".

For **5BLD** the same idea, but the moves must be **three slices wide**
(`3Rw`, `3Rw2`, …), because on a 5x5x5 a two-layer wide move leaves the middle
layer — and therefore the orientation — untouched. Competition 5BLD scrambles
are observed ending in exactly that, e.g. `… 3Fw` and `… 3Fw 3Rw`.

---

## 3. What CubeSmith does — verified

| | |
|---|---|
| Orientation count | **24**, found by breadth-first search over wide moves and asserted to be exactly 24 rather than assumed |
| Distribution | **uniform** — one shortest representative per orientation, drawn with `randomInt` |
| Suffix length | 0 moves x1, 1 move x9, 2 moves x14 — the same 0/1/2 profile TNoodle's `6 x 4` gives |
| 3BLD tokens | `Uw`, `Fw`, `Lw` and their pairs |
| 5BLD tokens | `3Uw`, `3Fw`, `3Lw` and their pairs — **three slices wide**, as required |
| Placement | appended to the end of the scramble |
| `555bf` quality | declared `random-moves`, matching 4b3e |
| `444bf` | absent until `444` exists, throwing rather than aliasing something else |
| `333mbf` | out of scope by design |

**Verdict on 4b3a: conforming.** The distribution over orientations is uniform
over all 24, which is what the regulation specifies. The token *vocabulary*
differs from TNoodle's — `Uw/Fw/Lw` where TNoodle uses `Rw/Fw/Dw` — but both
are legal WCA notation, both produce suffixes of at most two moves, and the
resulting distribution over orientations is identical. Nothing about the
regulation privileges one vocabulary.

---

## 4. Findings

### 4.1 The 2-move floor was not enforced for `333`, `555`, `666`, `777` — **fixed**

4b3 asks for at least two moves to solve, for every event; 4b3e repeats it for
the random-moves ones. The package enforced this for `222`, `pyram`, `skewb`
and `sq1`, and not for the rest.

The probability of it ever mattering is vanishing — about `4 x 10^-19` for a
uniform 3x3x3 state, and less for a 60-move random-moves sequence — but the
regulation states a requirement, not a likelihood, and "too unlikely to happen"
is not the same as "cannot happen". Two moves is also the one threshold that
needs no solver: a state closer than that is either solved or one move from it,
so the test is one solvedness check plus one per move.

Added as `core/scramble-shape.ts`'s `isAtLeastTwoMovesFromSolved` and
`nxn/minimum.ts`, and applied to `333`, `555`, `666`, `777` and both
blindfolded events.

### 4.2 For blindfolded events the floor has to be checked **after** the suffix — **fixed**

This is the finding worth the review on its own. A wide move is a whole-puzzle
rotation *composed with a turn*, so appending one moves the state by a move as
well as reorienting it. A state exactly two moves from solved can come back one
move from solved. Filtering the draw and then appending would leave the
sequence actually handed to a competitor unchecked.

TNoodle does the same thing — "scramble filtering done on the result" — and for
the same reason. CubeSmith now checks the rendered scramble, by applying it to a
solved cube, which also means the check shares nothing with the generator that
produced it.

### 4.3 `isSolvedNxN` is orientation-dependent, and that is a trap — **addressed**

`isSolvedNxN` asks whether every slot shows *its own* face's colour, so a solved
cube that has merely been rotated reads as unsolved. That is a legitimate
question — it is the right one for round-trip tests — but it is the wrong one
for "is this scramble too close to solved", and blindfolded scrambles rotate the
puzzle **deliberately**. Using it for the floor check would have made the check
silently useless for exactly the events it was added for: `Uw` on a 3x3x3 leaves
a cube one move from solved, and the old predicate called it far enough.

Found by the first run of the new tests, which asserted `Uw` fails the floor and
got the opposite. `isUniformlyColouredNxN` — every face one colour, whichever
colour — is now the predicate the regulation check uses, with both predicates
kept and their difference documented at both sites.

### 4.4 Same-face seam at the suffix — **cosmetic, not fixed**

About one blindfolded scramble in six ends with the scramble's last move and the
suffix's first move on the same face: `… Lw 3Lw'` on a 5x5x5, `… U Uw` on a
3x3x3. It is legal notation, it does not affect the state distribution, and
TNoodle can produce the same thing. It reads oddly, and the package already has
the machinery to avoid it (Square-1's `compressSquare1Moves` solves the
analogous phase-boundary seam).

Left alone deliberately: fixing it means either rejecting suffixes that collide
— which would break the uniform draw over orientations unless done carefully —
or merging at the seam, which changes every blindfolded scramble a given seed
produces. Worth doing before 1.0, worth doing on purpose rather than in passing.

### 4.5 `444bf` — a note for when `444` lands

An even cube has no fixed centres, so its orientation is not observable at all,
and the random frame is already part of a uniform random-state draw. 4b3a is
therefore satisfied without any suffix. Whether to emit one anyway, for
consistency with what competitors are used to seeing, is a presentation
decision rather than a compliance one — recorded in `444-design.md` §11.

---

## 5. Summary

| | status |
|---|---|
| 4b3a random orientation, uniform over 24 | conforming, before and after this review |
| 5BLD three-slice-wide orientation moves | conforming |
| 4b3 two-move floor, `333` and NxN | **was missing — now enforced** |
| 4b3 floor for blindfolded, checked after the suffix | **was checked at the wrong point — now correct** |
| Orientation-agnostic solvedness | **new predicate; the old one was a trap** |
| Same-face seam at the suffix | cosmetic, open, deliberately deferred |

---

## References

- [WCA Regulations](https://www.worldcubeassociation.org/regulations/) — 4b3,
  4b3a, 4b3e
- [Rotations/wide turns for non-inspection events (TNoodle issue #148)](https://github.com/thewca/tnoodle/issues/148)
  — the `{id, Rw, Rw2, Rw', Fw, Fw'} x {id, Dw, Dw2, Dw'}` construction, the
  three-slice-wide requirement for 5BLD, and filtering on the result
- [Scrambling Program Update: TNoodle 0.8.0](https://www.worldcubeassociation.org/posts/scrambling-program-update-tnoodle-0-8-0)
  — "Random orientation for blindfolded events, as specified in Regulation 4b3a"
- [Weekly Competition 2026-31](https://www.speedsolving.com/threads/weekly-competition-2026-31.97413/)
  — 5BLD scrambles ending in `3Fw 3Rw`
