# Face Turning Octahedron — design document

Written alongside the implementation, to record what `src/puzzles/fto/` and
`src/draw/fto.ts` actually do. Every count is computed by the code, and every
timing was measured on 2026-10-21 (Windows 11, Node 22.14.0) in a fresh process.

Target: `generateScramble('fto')`, `validateScramble('fto', …)` and
`drawScramble('fto', …)`, shipped in v0.15.0.

🔴 **FTO is the first event this package implemented before the WCA published
its regulations.** The WCA announced on 2026-06-24 that FTO is official from
2027-01-02, in Average of 5; the FTO articles are expected as a draft in the
January 2027 Regulations cycle. Everything the regulations will decide —
notation, method, minimum solve distance, image — is therefore a **provisional
choice** here, made on the best evidence available and listed in §8. The plan
that re-checks them is `cubesmith-scrambler-plans/plans/fto_event_plan/`
(task 10).

---

## 1. Overview

### WCA event

**`fto` — Face Turning Octahedron.** An octahedron whose eight triangular faces
turn by 120°, each cut one third of the way in. No regulation text exists yet;
until it does, this package applies Regulation **4b3**'s general rule — a
uniformly random state among those that need at least **2** moves to solve —
which is what every event without an exception of its own gets.

### Goal of the implementation

A random-state scrambler for a puzzle far too large for a single table — about
3.1 × 10²² positions — with nothing taken on trust: the geometry is derived,
the group it generates is *measured*, and the random draw is built from that
measurement.

### References used

- WCA announcement of 2026-06-24 (FTO official from 2027-01-02; Clock retired
  after 2027-07-18), as reported by cubzor.com and cuboss.com.
- Ruwix's FTO page — the piece inventory (6 corners, 12 edges, 24 centres in two
  orbits) and the position count **31,408,133,379,194,880,000,000**, used as a
  cross-check (§6).
- xyzzy's FTO solver as vendored in cubing.js (`fto-solver.ts`) — read for its
  **conventions** (face names, adjacencies, the Lanlan colour scheme) and its
  **published phase structure and coordinate sizes**, which §5 reproduces as
  cross-checks. 🔴 No code was copied: the cubing.js copy is GPL, and this
  package is MIT. The structure is reimplemented from its description.

### Files

| | |
|---|---|
| `notation.ts` | the eight faces, the 16 turns, and the parser with its two reason codes |
| `geometry.ts` | face normals, every piece and sticker position, and each turn derived as a rotation |
| `state.ts` | piece-level state, the 16 composed turn tables, and "solved as the eye sees it" |
| `random-state.ts` | the uniform draw over the measured group |
| `coordinates.ts` | BFS-discovered projections, move pruning, opposite faces |
| `tables.ts` | pair tables (one byte per entry) and the mod-3 table (two bits) |
| `phases.ts` | what each of the three phases solves, *computed* from the move sets |
| `search.ts` | IDA\* for phases 1 and 2, descent for phase 3, cancellation |
| `solve.ts` | the 4b3 floor, inversion, registration |
| `../../draw/fto.ts` | the two-square picture, from an independent 72-sticker model |

---

## 2. Notation

### Supported notation

| Token | Meaning |
|---|---|
| `U F R L` | the four faces around one vertex |
| `B D BR BL` | the four around the opposite vertex — `B` opposite `F`, `D` opposite `U`, `BR` opposite `L`, `BL` opposite `R` |
| plain letter | clockwise 120°, seen looking straight at the face |
| `'` | anticlockwise |

**There is no `2`.** A face turn has order 3, so a double turn *is* the prime
turn; accepting `R2` would give one move two spellings. Every puzzle shaped like
this in the official program (Pyraminx, Skewb) is written the same way.

### Parsing rules

Whitespace-separated tokens, like Megaminx, Skewb and Square-1. FTO **cannot**
be cube notation, and `validate-scramble.test.ts` pins why: cube notation reads
`BR BL` as four turns, `B R B L`. Only the event says `BR` is one face. Faces are
case-sensitive capitals; empty input is an empty scramble.

### Rendering rules

`ftoMovesToString` writes one space between tokens and `'` for amount 2.

### Examples

`U BR' F L' BL D` is valid. `R2`, `U'2` and `BR''` are bad amounts; `BX`, `UR`
and `r` name no face.

### Reason codes

| Code | Example | Meaning |
|---|---|---|
| `fto-not-a-face` | `BX` | the letters do not spell a face — including letters running on past one (`UR`) |
| `fto-bad-amount` | `R2` | a real face, followed by something other than nothing or `'` |

Both carry `token`; `fto-not-a-face` also carries `char`. The longest face name
is tried first, so `BR2` is a bad amount on `BR`, not on `B`.

---

## 3. State model

### Internal representation

`FtoState`, piece-level:

- `cornerPermutation` / `cornerOrientation` — 6 corners, orientation in `Z2`;
- `edgePermutation` — 12 edges, no orientation;
- `centreA` / `centreB` — two orbits of 12 *labelled* centres, orbit A on
  `U F BR BL`, orbit B on `R L B D`.

Centres are labelled even though three of a colour look alike, because labels
are what a move table and a random draw want. What the solver and the picture
see is the **colour** on each slot (`centreColour(label)`), and "solved" means
solved as the eye sees it (`isSolvedFto`).

### Coordinate system

The octahedron is `|x| + |y| + |z| ≤ 1`, faces normal to the eight body
diagonals:

| Face | Normal | | Face | Normal |
|---|---|---|---|---|
| `U` | `( 1,  1,  1)` | | `D`  | `(-1, -1, -1)` |
| `F` | `(-1, -1,  1)` | | `B`  | `( 1,  1, -1)` |
| `R` | `( 1, -1,  1)` | | `BL` | `(-1,  1, -1)` |
| `L` | `(-1,  1,  1)` | | `BR` | `( 1, -1, -1)` |

The names are pinned by **adjacency**, which is what a scramble means: two
normals differing in one sign share an edge, in two a vertex only, in three
nothing. The table reproduces every relation the notation states — `U F R L`
meet at `(0,0,1)` and `B D BR BL` at `(0,0,-1)`; `U–R` and `F–D` share edges;
`U–F` and `BR–BL` only a vertex; mirroring `x` swaps `U↔L` and `F↔R`. Adjacency
cannot fix handedness (a mirror image satisfies all of it), so
`geometry.test.ts` also checks that with `U` up and `F` in front, `R` is on the
viewer's right.

Positions are scaled by 9 so every sticker centroid is an integer: a corner
sticker is `n + 6v`, an edge sticker `n + 3(u + w)`, a centre `2n + 3v`. A turn
of the face with normal `m` moves every sticker with `p·m > 3` — the cut one
third of the way in.

### Invariants

Every turn is a 120° rotation about a body diagonal, and those generate only the
**twelve rotations of a tetrahedron**. Each keeps the sign product of a normal,
which gives three structural facts, each tested:

- the centres split into **two orbits of 12** by face parity and never mix;
- an **edge has no orientation** — no tetrahedral rotation fixes an edge
  midpoint;
- a **corner has two orientations**, not four — only the half turn about a
  vertex fixes it, so its two `+` stickers can swap but never reach a `−` face.

The reachable group itself is measured in §6.

### Solved state

Identity everywhere. Because centres are compared by colour, 648² labelled
states (`3!⁴ / 2` even rearrangements per orbit) all look solved.

---

## 4. Move model

### Primitive moves

Eight clockwise turns, each **derived** in `geometry.ts` by rotating every
piece and sticker position with `rotate120(normal, p, −1)` — the same exact
integer rotation the Pyraminx and Skewb use. Nothing is typed in by hand. Each
turn moves 3 corners, 3 edges and 9 centres: its own three, plus two on each of
the three faces sharing an edge with it. That is 27 stickers.

### Composition

The prime turn is the clockwise one applied twice (`composeTwice`), giving 16
turn tables.

### Move legality

All 16 turns are legal from every state. The search never turns a face twice in
a row, and of two opposite faces — which share no piece and commute — it tries
only the lower-indexed first (`mayFollow`).

### Inverses

`inverseFtoMove` swaps amount 1 and 2. A sequence inverts by reversing it and
inverting each turn.

---

## 5. Scramble generation algorithm

### High-level algorithm

1. Draw a uniformly random state (§5, *Uniformity*).
2. Redraw if a sequence of fewer than `MIN_FTO_SOLVE_DISTANCE` (2) turns solves
   it — proved by exhaustive search, since FTO is far too big for an exact
   distance.
3. Solve it in three phases, join the phases, cancel across the joins, invert.

The three phases are a reduction, each restricting the moves the next may use.
The structure is xyzzy's; this is an independent implementation of it. 🔴 No
phase lists its pieces by hand — `phases.ts` *computes* each target set from
which slots its move set touches.

| Phase | Moves | Solves | Coordinate | Goal fraction (xyzzy's figure) |
|---|---|---|---|---|
| 1 | all 16 | the **block**: the `D B BR BL` corner, its 4 edges, the 4 centres pointing at it | edges 11,880 × corner 12, and 18,480 per centre orbit | 1/11,880 of the edges, 9/132 per orbit ✓ |
| 2 | `U F R L` | 1 corner, 3 edges, 6 centres, and the other corners' twist into what `⟨U, L⟩` reaches | edges 336, corners 960, 25,200 per centre orbit | 1/336, 1/40, 1/120 per orbit ✓ |
| 3 | `U L` | everything | 210 × 210 × 60 × 24 = **63,504,000** ✓ | — |

Phases 1 and 2 are IDA\* over the maximum of three pair tables each, every one
an exact distance over its projection and so admissible. Phase 3 is one table
over the whole of `⟨U, L⟩`, so it is a **descent**, not a search. All 63,504,000
entries are reached, which proves the four phase-3 projections independent: a
phase 2 that solves its targets can never land somewhere phase 3 cannot finish.
The solver still checks that on arrival rather than assuming it.

The phase-3 table stores distance **mod 3** in two bits per state: 15.9 MB
rather than 63.5 MB. That loses nothing for a descent. Neighbouring states
differ in distance by at most one, so "one step closer" is recognisable from
residues alone, and walking it to the goal both solves and *measures* the
state. It is built breadth-first with bitset frontiers, because a scan for
"entries equal to `d`" cannot tell a layer from the one three back.

**Search effort.** The first solution of each phase gives 42.6 moves on average.
Scoring candidates instead is cheap, because phase 3's length is one descent.
`SEARCH` tries up to 4 optimal phase-1 solutions and, for each, up to 16 phase-2
solutions at its optimum and one move beyond, keeping the shortest whole. The
sweep that chose it, on the seed `sweep`:

| phase 1 limit/slack, phase 2 limit/slack | states | mean length | mean ms |
|---|---|---|---|
| 1/0, 1/0 — first found | 20 | 42.6 | 6.6 |
| 1/0, 16/1 | 20 | 40.1 | 21.3 |
| 1/0, 16/2 | 40 | 40.5 | 39.4 |
| **4/0, 16/1 — shipped** | 40 | **39.1** | **98.9** |
| 8/0, 32/1 | 40 | 38.8 | 198.3 |

Beyond the shipped setting, a further 0.3 moves costs double the time.

### Random-state vs random-move

Random-state. Regulation 4b3 requires it for every event except the four it
lists, and cubing.js's FTO scrambler — the one in use before the WCA program has
one — is random-state too. If the FTO regulations say otherwise, `minx` shows the
smaller job.

### Uniformity argument

The draw comes from the group's measured structure (§6): an even corner
permutation with an even twist sum, even permutations of the edges and of each
centre orbit, **unlinked**. Each part is drawn on its own — a uniform permutation
corrected to even by one fixed swap (a bijection between the halves), five free
twists with the sixth fixed by the sum. Labelled centres are uniform over what
the eye sees, because every colour arrangement has the same number (648) of
even labelled preimages. Redrawing on the 4b3 floor keeps the draw uniform over
the states that qualify. The solver never influences the state.

### WCA compliance

Provisional, against 4b3's general rule, until the FTO regulations exist (§8).

---

## 6. Validation

### Existing tests

- `geometry.test.ts` — every adjacency the notation states, handedness, and that
  every turn is clockwise seen from outside, sticker by sticker.
- `state.test.ts` — **the group order, by Schreier–Sims**, in both the piece
  model and the independent 72-sticker model:
  158,260,810,061,489,362,698,240,000,000 = `(6!/2) · 2⁵ · (12!/2)³` exactly.
  Dividing out the 648² look-alike centre arrangements and the 12 rotations of
  the whole puzzle gives **31,408,133,379,194,880,000,000** — Ruwix's published
  figure. The piece model, read back as stickers through the twelve tetrahedral
  rotations, matches the sticker model after 20 × 40 random turns. That is what
  pins the corner-orientation convention.
- `random-state.test.ts` — every invariant over 10,000 draws, and Pearson's χ²
  on four projections over 24,000 draws (seed `fto-chi-squared`), each below its
  0.1% critical value: edge in slot 0 **7.51** (df 11, critical 31.26), corner
  and twist in slot 0 **9.85** (df 11), the colour on one orbit-A slot **3.45**
  (df 3, critical 16.27), on one orbit-B slot **5.17** (df 3). A uniform draw's
  statistic averages its degrees of freedom, so two below and two a little above
  it is what uniformity looks like; none is near its critical value.
- `coordinates.test.ts` — projection sizes, bijective transitions, cancellation.
- `solve.test.ts` — every table entry reached; goal fractions against xyzzy's
  figures; each phase lands where it claims; 40 random states solved; and **the
  gate**: the scramble text, parsed and applied to a solved puzzle, reaches the
  drawn state.
- `core/move-count.test.ts` — the `fto` band, verdict `provisional` (§8).
- `draw/fto.test.ts` — tiling, colours, and that one turn changes exactly 18
  stickers.

### Independent verification

The published position count, reproduced from a group order the tests compute
rather than read; xyzzy's coordinate sizes and reduction factors, reproduced
from phases whose targets are computed rather than listed.

### Edge cases

A solved state solves in zero moves. A state one turn from solved is refused by
the floor. A shuffled move order still solves.

### Public validation

`validateScramble('fto', …)`, with the two reason codes of §2.

---

## 7. Complexity

### Time complexity

Phase 1 and phase 2 are IDA\* with admissible heuristics. Phase 3 is linear in
its length (≤ 29), at most 4 table probes per step.

### Memory usage

| Table | Entries | Size |
|---|---|---|
| phase 1 (3 pair tables) | 142,560 + 2 × 221,760 | 0.6 MB |
| phase 2 (3 pair tables) | 2 × 8,467,200 + 322,560 | 17.3 MB |
| phase 3 (mod 3) | 63,504,000 | **15.9 MB** |

Measured right after `prepareEvent('fto')`: typed arrays +51.9 MB, including
the 15.9 MB of bitset frontiers built for phase 3 and not yet collected; JS heap
+37.5 MB, including the transient projection arrays. With a byte per phase-3
entry those figures were +82.2 MB and +48.1 MB, which is why the table is mod 3.

### Expected scramble generation time

| | |
|---|---|
| cold `prepareEvent('fto')` | **6.5 s** (8.2 s before the mod-3 table) |
| first scramble after it | 271 ms |
| warm scramble | median 81 ms, mean 86 ms, p99 227 ms, max 279 ms (1,000 states) |

### Length

Over 1,000 seeded states: **29–44 moves, median 39, mean 39.08, p99 43.** Before
cancellation the phases average 8.10 + 11.88 + 19.10; their maxima were 10, 14
and 26, against a phase-3 table whose deepest layer is 29.

---

## 8. Known limitations

### Current bugs

None known.

### Provisional, until the WCA publishes the FTO regulations

Each of these is a choice made on the best evidence of 2026-10-21. Changing any
of them is a patch, and `fto_event_plan` task 10 re-checks every one.

1. **Notation** — the eight-face set with `'` and no `2`, which is the community
   convention. If the regulations write FTO differently, the parser and the
   reason-code examples change.
2. **Minimum solve distance** — `MIN_FTO_SOLVE_DISTANCE = 2`, 4b3's general rule.
   `isAtLeastMovesFromSolved` can prove any small bound, so a higher floor is
   one number.
3. **Image** — the two-square net and the Lanlan colours are this package's own.
   No TNoodle release draws an FTO.
4. **Reference length** — `move-count.test.ts` carries the `fto` band as
   `provisional`: it is this package's own measured distribution, and **nothing
   external has been compared with it yet**. cubing.js's random-state FTO
   scrambler is the stand-in to measure against until the official program
   scrambles FTO; then its sheets become the baseline, as TNoodle's did for
   every other event.

### Rough edges, stated plainly

- **A scramble opens with a long `U`/`L` run** — the inverse of phase 3, about
  19 moves of two faces — before the other faces appear. It is visible on a
  sheet. It is not a uniformity problem (the state is drawn first), but a
  scramble that looked like TNoodle's would not show its method so plainly.
- **~39 moves** is long. A two-phase solver with a richer phase 3 (xyzzy's uses
  36 short sequences as well as the two faces) would be shorter, at the cost of
  another table.
- **6.5 s cold** — in the same range as `444`, the slowest event here, and paid
  once per process.

### Planned improvements

None scheduled before the regulations are published.

---

## 9. References

### WCA regulations

- Regulation 4b3 (random state, minimum 2 moves), as applied provisionally.
- FTO articles: not yet published (expected January 2027).

### Published figures used as cross-checks

- 31,408,133,379,194,880,000,000 positions (Ruwix).
- 63,504,000 phase-3 states; reductions 1/11,880, 9/132, 1/336, 1/120, 1/40 (xyzzy's
  solver, as vendored in cubing.js).

### Algorithms and mathematics

- Schreier–Sims, for the exact group order (`src/puzzles/fto/__tests__/schreier-sims.ts`).
- IDA\* with maximum-of-projections heuristics; breadth-first search with
  bitset frontiers and mod-3 distance encoding.

### Related documents in this repository

- [skewb-design.md](./skewb-design.md) and [pyraminx-design.md](./pyraminx-design.md)
  — the same exact 120° rotation.
- [444-design.md](./444-design.md) — the other multi-phase reduction here.
- [drawing-design.md](./drawing-design.md) — the drawing layer the FTO net joins.
