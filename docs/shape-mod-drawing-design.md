# Shape-mod and unofficial drawings — `@cubesmith/scrambler/unofficial/draw`

> Shipped in **0.15.0**. Pictures for the
> unofficial events: the cube net at any size, and a geometry engine that draws a
> shape mod as it looks in the hand. Plan:
> `cubesmith-scrambler-plans/plans/unofficial_events_plan/` (`01-drawing-design.md`).

## 1. Overview

| Events | Picture | Built from |
|---|---|---|
| `888`–`1212`, `222bf`, `666bf`, `777bf` | cube net | `draw/cube.ts`, unchanged, at any size |
| `pyrambf`, `minxbf` | Pyraminx, Megaminx net | the WCA drawers, unchanged |
| `mirror` | two isometric views (default), or a flat height map | the shape-mod engine (§3), `mirror-height-map.ts` (§4) |
| `fisher`, `mastermorphix` | two isometric views | the shape-mod engine |
| `axis`, `windmill`, `ghost` | **none yet** | no geometry source (§5) |

`drawUnofficialScramble(event, scramble, colorScheme?, { view? })` returns an
`UnofficialScrambleImage`, the same data as the WCA `ScrambleImage` with an
unofficial event id. `scrambleImageToSvg` from this entry serializes it through the
same code as the WCA one (`draw/svg.ts` `imageToSvg`).

### Clean room

csTimer (GPL-3.0) draws a Mirror Blocks image, and cubing.js (MPL-2.0 OR GPL-3.0)
describes puzzles as cut solids. Neither licence allows its code into this MIT
package, and **no code from either is used**. They were surveyed (2026-10-21) as
evidence that an approach works. Published facts (a puzzle's construction, the
PuzzleGeometry description of the Mastermorphix) are cited where used. Every
other number is derived here from the puzzle's physical model and labelled. The
code was written from the plan's design document with no third-party source open.

## 2. Nets at any size

`draw/cube.ts` was already parameterised by size. Two internal changes, no public
type change:

- `parseCubeNetMoves(scramble, size, unsupported)` is the parse behind
  `scrambleToWideMoves`, with the refusal built by the caller. The unofficial
  entry raises `UnsupportedUnofficialScrambleError`, so the WCA error type never
  has to name a non-WCA event.
- `faceOrigin`, `slotIndex`, `applyMoveForDrawing`, `drawState`, `GAP` and
  `CUBIE_SIZE` are exported module-internally for the height map and the nets.

A 12x12x12 net is 490 × 368 units, the WCA formula `(n·10 + 2)·4 + 2`, with
10-unit stickers. A consumer scales it with the SVG `viewBox`. At a typical
scramble-sheet width of 8 cm a sticker prints at about 1.6 mm, which is legible.
The blindfolded drawings are the sighted drawer reading the same text, rotation
suffix included (`unofficial-draw.test.ts` compares them shape for shape).

## 3. The shape-mod engine (`shape-mod/`)

**Model.**
- **Mechanism.** The 3x3x3's six cut planes, `x, y, z = ±½`, in the NxN model's
  frame (R = +x, U = +y, F = +z).
- **Outer solid.** A convex solid given as half-spaces, each tagged with the
  colour key it is stickered in (`solids.ts`).
- **Pieces.** A piece is `cell ∩ solid`, convex because both are. It is built by
  clipping a large box by each half-space in turn (`geometry.ts`: Sutherland–Hodgman
  per face, plus one cap polygon per cut). Cut faces are tagged `body`: the plastic
  that shows wherever a scramble exposes one.

**State.** `mechanism.ts` tracks each of the 26 cubies as a position plus a rotation
(three integer column vectors), so no rounding accumulates. A clockwise quarter
turn about a face normal `n` is `n(n·v) − n×v`. The rotation is what a flat net
cannot carry, and it is what makes a turned centre visible. `mechanism.test.ts`
checks this model against the NxN sticker model, sticker by sticker, after every
move of 20 random 25-move sequences that include wide turns and rotations.

**Drawing order, exact.** A piece always lies inside the cell it occupies,
because a turn maps cells to cells. So the six cut planes are a fixed binary space
partition of the pieces: for a viewer at infinity, nothing on the far side of a
plane can hide anything on the near side. Sorting cells by `(sx·x, sy·y, sz·z)`,
with `s = sign(view)`, is the far-first traversal of that partition. This is the
*a priori* BSP order (Fuchs, Kedem & Naylor, SIGGRAPH 1980), and it needs no depth
sort and has no ties. `render.test.ts` checks it against a brute-force z-buffer: at
every point of an 81 × 81 grid per view that a polygon covers, on three scrambles of each drawable puzzle, the
last polygon painted is the nearest one.

**Views.** Two isometric views, along `±(1, 1, 1)` turned by the solid's
`frameTurn` about U–D, so each view aims at a corner of the **outer** solid. A
Fisher Cube is turned 45°, and without the turn its sides would be seen edge-on.
The image width is fixed per puzzle by the largest vertex distance, which a
rotation cannot change, so every scramble of a puzzle has the same size.

**Shading.** `1 − s·(1 − max(0, n·l))` on the fill, with `s` per solid: 0.5 for
the one-colour Mirror Cube, whose faces are told apart only by light, and 0.25
for a stickered puzzle, whose colours must stay recognisable (a stronger shade
turns yellow olive). Only hex colours can be shaded; a named colour passes
through unshaded and the outlines still separate the faces.

**Painter's cost.** Hidden polygons stay in the list, painted over. A solved
3x3x3 view carries about 140–160 polygons. `visibleFaces()` in the tests counts
what can actually be seen.

## 4. Mirror Cube height map

Derivation:
- The cut planes never move.
- A piece in the outer layer of face `H` extends `t(H)` beyond the cut, and keeps
  that extent along whichever axis its `H` sticker comes to face.
- So **a tile's height is `t(home face of its sticker)`**, and the sticker net
  already knows every home face.

Rendering is borrowed from map-making, not from a puzzle program:
- **Hypsometric tint.** Darker means lower, from 45% to 100% of the surface colour.
- **Step contours.** One line along every shared edge of two tiles on the same face
  whose heights differ, 0.5 to 3 units wide by the size of the step.

After `R`, exactly 12 contours appear: three on each of the four faces the turn
moves a column onto. That was predicted from the derivation and is pinned as a
test.

## 5. Geometry and its provenance

| Puzzle | Outer solid | Source |
|---|---|---|
| Mirror | the 3-unit cube translated by `(Δx, Δy, Δz) = (0.2, 0.4, 0.3)` | construction: opposite layers change thickness in pairs (Chess.com forum); symmetric cuts with an offset shell (three.js forum). **The Δ values are a CubeSmith convention** pending a measurement: distinct (every piece a different block, Wikipedia *Mirror Blocks*), 0.1 apart, thinnest layer 0.6 |
| Fisher | the 3-unit cube turned 45° about U–D | "a standard cube twisted 45° around a central axis" (Ruwix; Wikipedia *Tony Fisher*). Keeping the 3-unit size is a **convention** |
| Mastermorphix | regular tetrahedron, vertices at alternate corners of `[-a, a]³`, `a = √3·½ / 0.346184634065199 ≈ 2.502` | PuzzleGeometry's published `t e 0.346184634065199`, distances in units of the inradius (the 3x3x3 is `c f 0.333…`). Face-to-colour assignment is a **convention** |
| Axis, Windmill, Ghost | **not drawn** | No source gives their construction (searched 2026-10-21: Ruwix, Brandeis puzzle collection, retailer pages). A guessed geometry would draw a picture that looks right and is wrong, which a scramble checker would trust. The engine draws them as soon as a measured geometry is added to `SHAPE_MOD_SOLIDS` |

`render.test.ts` checks every solid: the 26 pieces and the hidden core exactly fill
the outer solid (volumes agree to 10⁻⁶), the core cell lies wholly inside, every
cubie has a visible face, and scramble-then-inverse draws the solved picture
exactly.

## 6. Known limitations

1. **Three shape mods are undrawn** (§5), and the Mirror Δ values are a placeholder
   until measured. Either change is one table entry.
2. **Isometric only.** No perspective and no 3D interactivity, by design: the
   package is pure computation and returns data.
3. **Painter's order keeps hidden polygons** in the output (§3).

## 7. References

- I. E. Sutherland, G. W. Hodgman, "Reentrant Polygon Clipping", *CACM* 17(1), 1974.
- H. Fuchs, Z. M. Kedem, B. F. Naylor, "On Visible Surface Generation by A Priori
  Tree Structures", *SIGGRAPH '80*.
- Wikipedia, *Mirror Blocks*; *Tony Fisher (puzzle designer)*.
- Chess.com forum, *mirror cube puzzle*; three.js forum, *Mirror Cube, a 3×3 Mirror
  Blocks puzzle with a physically correct mechanism*.
- Ruwix, *Rubik's Cube Shape Mods*.
- Twizzle Explorer help (PuzzleGeometry); cubing.js `pgPuzzles.ts` (cited as fact).
- csTimer `image.js` (GPL-3.0; surveyed, not used).
