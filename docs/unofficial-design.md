# Unofficial events — `@cubesmith/scrambler/unofficial`

> Shipped in **0.15.0**, alongside `fto`. Sixteen events the WCA
> does not hold, behind their own entry point. Every number below is read off the
> code or measured; every convention is labelled as one.
>
> Plan: `cubesmith-scrambler-plans/plans/unofficial_events_plan/`.

## 1. Overview

The main entry makes claims backed by the WCA Regulations or by TNoodle: a
scramble length, an orientation rule, a minimum distance. None of the events here
has either source, so they are served from a **separate entry point** with its own
id type (`UnofficialEventId`), its own registry, its own quality type and its own
errors. Three consequences:

- The main entry's API is unchanged. `isImplementedEvent()` still answers `false`
  for every id here, even with both entries loaded in one process, because the
  unofficial registry is a separate `Map` (`unofficial.test.ts`). Its type
  declarations were checked at build: the same 49 exports and the same 51
  declarations as before (20 for `./draw`), only split across more chunk files.
  Adding the entries alone left `dist/index.js` byte-identical. The only other
  change to its code in this release is the separate `333` seam fix.
- A WCA-only consumer bundles none of this code (`unofficial-bundle.test.ts`).
- Each event's provenance is explicit (§5).

The ids are **CubeManager's catalogue refs, verbatim**
(`cube-manager-backend/database/seeders/EventSeeder.php`), `[a-z0-9]+` with no
hyphen, so a consumer can pass an event ref straight through.

| Group | Events | Scramble | Quality |
|---|---|---|---|
| Big cubes | `888` `999` `1010` `1111` `1212` | NxN random moves | `random-moves` |
| Blindfolded cubes | `222bf` `666bf` `777bf` | sighted scramble + random orientation | `random-state` / `random-moves` |
| Blindfolded Pyraminx, Megaminx | `pyrambf` `minxbf` | the WCA scramble, unchanged (§5.3) | `random-state` / `random-moves` |
| 3x3x3 shape mods | `mirror` `axis` `fisher` `windmill` `ghost` `mastermorphix` | the `333` scramble | `random-state-mechanism` |

## 2. Notation

No event here has a notation of its own. Each is written in a WCA event's
notation, recorded in `NOTATION_OF` (`src/unofficial/catalogue.ts`):

- **Big cubes, blindfolded cubes, shape mods**: cube notation. A big cube uses
  layer prefixes up to `floor(n/2)`, so a 12x12x12 scramble contains `6Rw`. The
  parser has always accepted any prefix (`/^(\d+)?([UDFBLR])(w)?(2|')?$/`).
- **Shape mods**: standard 3x3x3 face turns, relative to the **mechanism**. On a
  Fisher Cube, `R` turns the mechanism's right layer, which runs diagonally across
  the outer cube. This is a **CubeSmith convention**, and the usual way these
  puzzles are scrambled. No community document defining it was found.
- **`pyrambf`, `minxbf`**: Pyraminx and Pochmann Megaminx notation, exactly as
  for `pyram` and `minx`.

## 3. State model

Nothing new. Every scramble here is produced and checked by an existing model:
`puzzles/nxn` (sticker permutation, any size), `puzzles/222`, `puzzles/333`,
`puzzles/pyraminx`, `puzzles/megaminx`. The drawing layer adds one model, the
cubie-with-rotation mechanism, described in `shape-mod-drawing-design.md` §3.

## 4. Move model

As §3: the NxN move model already handles every size. Its facelet model scales
as `6n²` stickers (864 at 12x12x12).

## 5. Scramble generation, with provenance

### 5.1 Big cubes

`generateCubeNxNScramble(random, size, length)`: the same random-moves generator
as `555`–`777`, with the same same-axis redundancy rule and the same ≥ 2-moves
floor.

| Item | Value | Source |
|---|---|---|
| Method | random moves | follows WCA 4b3e for `555`–`777`, by analogy |
| Lengths | 120 / 140 / 160 / 180 / 200 | **CubeSmith convention**, backed by a measurement (below) |
| Floor | ≥ 2 moves from solved | follows 4b3, by analogy |

**How the lengths were chosen.** They extend the shipped table's +20-per-size
step (`555` 60, `666` 80, `777` 100). The pattern alone proves nothing, so they
are checked against a measured criterion:

- The statistic is χ² per degree of freedom of per-sticker colour frequencies
  over N scrambles. It is about 1 when every position is equally likely to show
  every colour. An odd cube's six fixed centres are left out.
- The **knee** is where the statistic first stays near 1. Measured 2026-10-21 over
  4,000 scrambles per point:

  | Size | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
  |---|---|---|---|---|---|---|---|---|
  | Knee (moves) | ~48 | ~32 | ~72 | ~40 | ~96 | ~56 | ~96 | ~56 |

  Odd cubes mix more slowly. Their central-line pieces are moved only by a
  middle-layer wide turn.
- The **least** conservative shipped WCA length is `555`: 60 against a knee near
  48, a margin of ×1.25. Each new length must keep at least that margin.
  `big-cubes.test.ts` checks that every one is already mixed at `length / 1.25`
  (1,500 scrambles), and that the statistic really does separate: a 9x9x9 at
  12 moves reads above 10. Every length clears the bar comfortably, the closest
  being `999` and `1111` (×1.46, ×1.875).

### 5.2 Blindfolded cubes

`withMinimumDistance(size, () => withRandomOrientation(sighted(random), random, size))`:
the helper `333bf`, `444bf` and `555bf` use. An even cube gets a whole-cube
rotation suffix (`x`, `y`, `z`) and an odd cube a wide-move suffix
(`docs/nxn-design.md`, `puzzles/nxn/orientation.ts`). Both cover all 24
orientations, uniformly.

| Item | Source |
|---|---|
| Random orientation | WCA 4b3a, adopted by analogy: **CubeSmith convention** |
| `222bf` sighted part | `generate222Scramble`: random-state, as `222` |
| `666bf`, `777bf` sighted part | random moves at the shipped `666`/`777` lengths |

### 5.3 `pyrambf` and `minxbf`: no suffix, for opposite reasons

- **Pyraminx.** The four axial pieces never change position under any turn, so
  the puzzle's colour frame is fixed by the puzzle itself. A whole-puzzle rotation
  is not reachable by turns and has no token in WCA Pyraminx notation. The
  scramble is random-state, so what a solver memorises is already uniform.
  `pyrambf` is the `pyram` scramble.
- **Megaminx.** Pochmann's `R++` and `D++` turn the bulk of the puzzle, so a WCA
  scramble already moves the centres. **Measured** over 30,000 scrambles: all 60
  orientations occur, χ² = 57.5 on 59 degrees of freedom. A WCA Megaminx
  scramble is already uniformly oriented, and `minxbf` is the `minx` scramble.
  `blindfolded.test.ts` keeps both facts true (12,000 draws, under the 0.1%
  critical value).

This replaces the plan's first proposal (D-4: a 12- or 60-way orientation suffix),
which was based on an assumption the measurement and the geometry overturned.

### 5.4 Shape mods

`generate333ScrambleWithFloor`: the `333` event's own scramble, seed for seed
(`shape-mods.test.ts`).

**Why the quality is `random-state-mechanism`, not `random-state`.** The scramble
is uniform over the 3x3x3 mechanism's corners and edges. But Axis, Fisher,
Windmill, Ghost and Mastermorphix **show** their centres' orientation (a
supercube), and that orientation follows from the move sequence. It is not drawn
uniformly from the 4⁶/2 supercube possibilities (Jaap's Puzzle Page, *Cube
theory*: the supergroup is 2048 times the cube group; Cube-Lovers, D. Woods,
"Re: Supergroup", 1981). The test pins two facts:

- **The parity law holds**: total centre quarter-turns ≡ corner permutation
  parity (mod 2), over 60 scrambles. The mechanism model agrees with published
  theory.
- **Every twist occurs** on every centre over those 60, so no centre is biased
  to one twist. The six are tied to each other and to the corners, so they are
  not uniform **jointly**. That is what the label says.

The Mirror Cube's centres are featureless, so for it the label is conservative.
It is kept for one rule across the group.

## 6. Validation

`validateUnofficialScramble(event, text)` returns `validateScramble(NOTATION_OF[event], text)`
unchanged. It checks **notation**, not size, exactly as the WCA cubes do (`7Rw`
is valid cube notation whatever the cube).

`AlgorithmSyntaxError` and `ScrambleSyntaxError` are re-exported from this entry.
Each entry is a self-contained file, so the main entry's copies would not match an
error thrown from here under `instanceof`.

## 7. Complexity

Measured in one process on the dev box (Node 22.14), 2026-10-21. "Prepare" is
`prepareUnofficialEvent` cold; scramble times are medians of 15.

| Event | Prepare | Scramble median |
|---|---|---|
| `888` / `999` / `1010` / `1111` / `1212` | 31 / 30 / 45 / 55 / 76 ms | 0.3–0.5 ms |
| `222bf` | 5.5 s (the `222` tables) | 0.1 ms |
| `666bf` / `777bf` | 10 / 15 ms | 0.3 / 0.2 ms |
| `pyrambf` | 0.7 s (the `pyram` tables) | 0.1 ms |
| `minxbf` | none | 0.3 ms |
| shape mods | 10.1 s (the `333` tables, shared by all six) | 64 ms |

## 8. Known limitations

1. **No regulation exists for any of these events.** Lengths, orientation rules
   and notation are conventions, labelled in §5. If an organising body publishes
   rules, they win, as a patch.
2. ~~The `333` phase-boundary same-face pair is inherited.~~ **Fixed in the same
   release** (`333-design.md` §8 "Fixed"). The shape mods reuse the `333` generator,
   so they received the fix with it: 0 redundant moves in 300 `333` scrambles,
   which the shape mods are, seed for seed.
3. **Big-cube lengths are measured on sticker marginals only.** The statistic
   cannot see correlations between stickers. It is the same check applied to the
   shipped WCA lengths, so the comparison is fair, but it is a necessary
   condition, not a proof of mixing.
4. **Three shape mods have no drawing** (Axis, Windmill, Ghost): their geometry
   has no source yet. See `shape-mod-drawing-design.md` §5.

## 9. References

- WCA Regulations 4b3, 4b3a, 4b3e (adopted by analogy only).
- Jaap's Puzzle Page, *Cube theory*: https://www.jaapsch.net/puzzles/theory.htm
- Cube-Lovers, D. Woods, "Re: Supergroup" (1981):
  https://www.math.rwth-aachen.de/~Martin.Schoenert/Cube-Lovers/Don_Woods__Re__Supergroup.html
- `docs/nxn-design.md`, `docs/333-design.md`, `docs/blindfolded-review.md` for the
  reused generators.
