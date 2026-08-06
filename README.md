# @cubesmith/scrambler

Dependency-free WCA scramble generation. Pure computation only — no Web
Worker, no DOM, no browser-only API (`window`, `document`, `customElements`,
`HTMLElement`, WebGL) — so it works identically in Node, Bun, Vite, and both
Next.js Server and Client Components.

Not affiliated with or endorsed by the World Cube Association.

## Why this exists

`cubing/scramble`, a popular existing scramble-generation package, always
instantiates a Web Worker to generate a scramble. That worker fails to
instantiate under some modern bundler dev setups (e.g. Next.js + Turbopack) —
a confirmed, unresolved upstream compatibility issue
([cubing/cubing.js#309](https://github.com/cubing/cubing.js/issues/309),
[#327](https://github.com/cubing/cubing.js/issues/327)). `@cubesmith/scrambler`
sidesteps that entire class of failure by never using a Worker at all.

## Install

```bash
npm install @cubesmith/scrambler
```

## Status

**Fourteen of the seventeen WCA events work end to end.** Two — `444` and
`444bf` — throw `UnimplementedEventError` while their solver is built, and
`333mbf` is out of scope by design (see below).

Every implemented puzzle has a design document under [`docs/`](./docs/), plus a
[conformance review of the blindfolded events](./docs/blindfolded-review.md) and
the [4x4x4 design](./docs/444-design.md) that is being built to.

| Event | Method | Status |
|---|---|---|
| `333` | random-state | ✅ Two-phase (Kociemba-style) solver, parity-correct random state |
| `222` | random-state | ✅ Single-phase; the whole 3,674,160-state group fits one exact pruning table |
| `pyram` | random-state | ✅ Tetrahedral geometry on an exact integer lattice; 933,120 states, God's number 11, both reproduced by BFS |
| `skewb` | random-state | ✅ Corner-turning deep cut; BFS-discovered coordinates reproducing 3,149,280 states and God's number 11 |
| `clock` | random-state | ✅ Dials and pins; the official 14-token template proved to be a unimodular basis for all 12^14 states |
| `minx` | random-moves | ✅ Dodecahedral geometry, Pochmann notation, 77 moves (random-moves is what 4b3e *requires* here) |
| `555` `666` `777` | random-moves | ✅ Shared NxN facelet model; 60 / 80 / 100 moves, no redundant move anywhere |
| `333fm` `333oh` | random-state | ✅ Plain aliases for `333` — same puzzle, only the human constraint differs |
| `333bf` `555bf` | as their base | ✅ Base scramble **plus a uniformly random puzzle orientation** (Regulation 4b3a) |
| `sq1` | random-state | ✅ Shape-changing 24-slot model; two-phase solver, exact 4b3d verification, 3,678 twistable shapes and 11,958,666,854,400 positions reproduced |
| `444` `444bf` | random-state | 🚧 In progress — piece model, coordinates and phase 1 done and verified; `generateScramble` still throws until the solver is finished |
| `333mbf` | — | ⛔ Deliberately out of scope: one inspection over many cubes doesn't fit a one-scramble-per-call API |

Supporting pieces, all done: package scaffold (strict TypeScript, ESM, Vitest),
`generateScramble()` / registry / typed "not implemented" errors, seeded and
cryptographically-random number generation, shared face-turn and wide-move
notation, and the WCA Regulation 4b3 scramble shaping described below.

Known limitation: pruning tables are built lazily in memory on first use,
not precomputed and shipped as a serialized asset. Measured on this
machine: **333** — ~11s one-time cold-build, then ~7-400ms per scramble
(mean ~100ms; search depth varies per state). **222** — ~5.75s cold-build,
then ~0.017ms per scramble (~59,000/sec). **pyram** — ~1s cold-build, then
~0.020ms (~50,000/sec). **skewb** — ~1.5s cold-build, then ~0.014ms
(~72,000/sec). For 222, pyram and skewb the pruning table holds the *exact*
distance for the whole group, so search is essentially free once built.
Precomputing and shipping serialized tables to eliminate the cold-start cost
is the natural next optimization, not yet done. **clock** has no table and no
cold start at all — ~0.011ms (~93,000/sec). The random-moves events have no
table and no search either: **minx** ~0.01ms, **555/666/777** ~0.011 / 0.014 /
0.018ms. See `npm run bench`.

## Usage

```ts
import { generateScramble } from '@cubesmith/scrambler';

const { moves } = await generateScramble('333');
const { moves: pocketCube } = await generateScramble('222');
const { moves: pyraminx } = await generateScramble('pyram');
const { moves: skewb } = await generateScramble('skewb');
const { moves: clock } = await generateScramble('clock');
const { moves: megaminx } = await generateScramble('minx');
const { moves: big } = await generateScramble('777');
// blindfolded events additionally orient the puzzle randomly:
const { moves: blind } = await generateScramble('333bf');
// deterministic given a seed:
const { moves: reproducible } = await generateScramble('333', { seed: 'my-seed' });
```

`ScrambleResult` also carries `quality`, which is `'random-state'` or
`'random-moves'` depending on what the event's regulation calls for — see
below. `isImplementedEvent(event)` answers whether an event is callable
without having to catch `UnimplementedEventError`.

## Scramble shape — what the WCA Regulations require beyond "random state"

A scramble is not just the inverse of a random state's solution. Four extra
rules apply, and all four are implemented (`src/core/scramble-shape.ts` and
`src/puzzles/nxn/orientation.ts`):

- **A minimum number of moves to solve.** Regulation 4b3 sets a floor of 2
  moves, with per-puzzle exceptions: **2x2x2 ≥ 4** (4b3b), **Skewb ≥ 7**
  (4b3c), **Square-1 ≥ 11** (4b3d), **Pyraminx ≥ 6** (4b3f). The base floor of
  2 is enforced for every event too, including the random-*moves* cubes, where
  4b3e restates it — and for the blindfolded events it is checked **after** the
  orientation suffix, because a wide move moves the state by a move as well as
  reorienting it (see [`docs/blindfolded-review.md`](./docs/blindfolded-review.md)
  §4.2). Enforced by
  redrawing, which is what keeps the "equal probability for each state" the
  regulation also demands — the conditional distribution of a uniform draw is
  uniform on the condition.
- **Random-state is not always the right method.** Regulation 4b3e specifies
  *random moves* for **5x5x5, 6x6x6, 7x7x7 and Megaminx** — for those events a
  random-state scramble would be the non-conforming one, and WCA's own
  scrambler doesn't do one either. `ScrambleResult.quality` reports which
  method was used (`'random-state'` or `'random-moves'`) rather than always
  claiming the stronger one.
- **A minimum sequence length.** The regulation constrains the state, not
  the printed sequence — but a scrambler that always prints the *optimal*
  solution leaks the state's difficulty, so a short sequence on a scramble
  sheet advertises an easy scramble. WCA's own scrambler pads to 11 moves
  for this reason ([incident 28](https://www.worldcubeassociation.org/incidents/28)).
  Padding here asks the solver for a solution of a given *exact* length
  rather than the shortest one, so the state reached is unchanged and still
  uniformly random.
- **Blindfolded events must orient the puzzle randomly.** Regulation 4b3a, and
  the reason `333bf` is *not* an alias for `333`: a 3x3x3 scramble is all
  single-layer turns, so it never moves a centre and always leaves the cube
  white-up green-front. For a blindfolded solve the starting orientation is
  part of what gets memorised. The orientation is carried by wide moves —
  which is why official 3BLD scrambles end with tokens like `Rw2 Fw'` — and
  the suffixes are *searched for* rather than written down, because the
  obvious `Rw^a Fw^b` construction reaches only 16 of the 24 orientations and
  so cannot give the equal probability the regulation asks for.

## Design

- **`src/core/`** — the public entry point (`generateScramble`), the
  per-event scrambler registry, and shared types. `WcaEventId` lists the full
  target event surface as a type; only events actually registered are
  callable — everything else throws a typed `UnimplementedEventError` rather
  than returning a placeholder result. The registry also records each event's
  scramble *quality*, so `generateScramble` reports the method actually used
  instead of always claiming random-state. `scramble-shape.ts` holds the two
  WCA rules that apply on top of "draw a random state" (see above).
- **`src/random/`** — `RandomSource`, the only thing any scrambler is
  allowed to draw randomness from. Seeded via a tiny deterministic PRNG
  (mulberry32) when `options.seed` is given; backed by
  `crypto.getRandomValues` (never `window.crypto` — the standard
  `globalThis.crypto`, present in Node ≥19, Bun, and every browser)
  otherwise.
- **`src/notation/`** — move/notation primitives (`Face`, `FaceMove`,
  `moveToString`, `parseMove`, inversion) shared by the face-turn-family
  puzzles. `puzzles/nxn/notation.ts` extends them with layer depth (`Rw`,
  `3Rw`). The non-cube puzzles each bring their own notation instead of bending
  these types: a Pyraminx or Skewb turn has order 3 so `2` would mean
  *counterclockwise* rather than a half turn, a Megaminx token names a face to
  *hold*, and a Clock token names a pin configuration and an hour count.
- **`src/puzzles/333/`** — the 3x3x3 cube state model (`CubeState`), its 18
  move tables (derived geometrically from 3D rotation matrices rather than
  hand-transcribed, and cross-checked against known mathematical invariants
  of the cube group — see the module doc comments), a parity-correct
  uniformly-random state generator, and the two-phase solver:
  `coordinates.ts`/`phase2-coordinates.ts` (state → small integers a search
  can reason about), `phase1-tables.ts`/`phase2-tables.ts` (per-move
  transitions in that coordinate space, derived from the same verified
  `CubeState` move application — never re-derived by hand a second time),
  `phase1-pruning.ts`/`phase2-pruning.ts` (BFS-built admissible IDA*
  heuristics), and `phase1-search.ts`/`phase2-search.ts`/`solve.ts` (the
  search itself, and `generate333Scramble` — solve a random state, invert
  the solution). Only `register333Scrambler` (called once, explicitly, from
  `src/index.ts`) is part of the public contract; everything else here is
  an internal implementation detail.
- **`src/puzzles/222/`** — mirrors the 333 module's structure at much
  smaller scale. Reuses `puzzles/333/geometry.ts`'s corner rotation
  mechanics directly (a 2x2x2 is literally "the corners of a 3x3x3"; U/R/F
  — the only faces WCA/TNoodle 2x2x2 scrambles use — never touch the 8th
  corner, which is the standard "fixed reference corner" convention,
  falling out automatically rather than needing special-casing). Its
  entire state space (7! × 3^6 = 3,674,160 — the well-known Pocket Cube
  group order, confirmed by the pruning table's BFS reaching every single
  entry) fits in one pruning table holding *exact* distances, so there's
  no two-phase decomposition and no parity fix-up needed in random-state
  generation (every permutation/orientation combination is independently
  reachable).
- **`src/puzzles/pyraminx/`** — the first non-cube puzzle, so it brings its
  own `notation.ts` rather than reusing `src/notation/`: a Pyraminx turn has
  order 3, so there are only two amounts and `2` means *counterclockwise*,
  where a cube face turn has order 4 and `2` means a half turn. `geometry.ts`
  derives the turn tables from 3D rotations the same way 333 does, but on an
  exact **integer** lattice — a regular tetrahedron's four vertices are four
  alternate corners of a cube, which puts the six edge midpoints precisely on
  the six cube face centers, so no floating-point tolerance appears anywhere.
  All 720 edge permutations and all 64 flip vectors are encodable rather than
  just the legal ones, so the pruning BFS *proves* the two constraints
  (even permutation, even total flip) instead of assuming them: it reaches
  exactly 933,120 of the 3,732,480 encodable states — the published Pyraminx
  group order — at a maximum distance of 11, the published God's number.
  Tips are modelled but not searched: nothing on the puzzle can observe a
  tip, and an uppercase turn carries its own tip along, so they're
  reconciled after the layer solve and emitted last, as WCA scrambles do.
- **`src/puzzles/skewb/`** — a *corner*-turning, deep-cut puzzle: every turn
  rotates half the cube by 120° about a body diagonal, so `geometry.ts`
  reuses the same exact-integer 120° rotation as the Pyraminx (`utils/vec3.ts`)
  but applies it to whole cube corners and face centers. WCA **Fixed Corner
  Notation** holds one corner still and turns the four whose moving half
  excludes it; `geometry.test.ts` reconstructs the official holding position
  (white up, green front-left) and checks each letter lands on the corner the
  regulation describes, rather than taking the assignment on trust.
  Coordinates are *discovered* rather than designed: the corner permutation
  alone has `8! = 40,320` encodable values of which only **36** occur, so a
  closed-form product would be a 227 MB table that is almost entirely holes.
  Instead each projection is BFS-closed from solved and re-indexed densely,
  landing on 8,748 corner states × 360 center states = **3,149,280** — the
  published Skewb position count — with the pruning BFS then reaching every
  one of them at a maximum distance of 11, the published God's number.
- **`src/puzzles/clock/`** — the outlier. No cube geometry is reusable here
  and none is used: a Clock is eighteen twelve-position dials (nine per side)
  and four pins, where a pin's state decides whether its corner clock is
  geared to its three neighbours on the front or the back. Its own
  `notation.ts` too — a token names a *pin configuration* and an hour count,
  and a scramble also contains a physical flip of the puzzle and a closing
  declaration of where the pins are left.

  Every move is an *addition* in `Z12` on a fixed set of dials, so the group
  is abelian and the puzzle is linear algebra rather than search — no pruning
  table, no IDA*, no state-space BFS. Corner clocks pass through the puzzle
  and show on both sides, leaving `9 + 9 - 4 = 14` independent dials and the
  published `12^14 = 1,283,918,464,548,864` states.

  The payoff is that the official fourteen-token scramble template turns out
  to be a **unimodular basis**: its effect matrix — *measured* by applying
  each token to a solved puzzle, not written down — has determinant ±1. So
  every state is reachable by exactly one choice of the fourteen amounts,
  generating a uniformly random state is fourteen uniform draws with no
  constraint to satisfy, and solving one is a single matrix multiply
  (`utils/mod-matrix.ts`, which inverts mod 4 and mod 3 and recombines by
  CRT, because `Z12` is not a field and a column can lack a pivot entirely).
- **`src/puzzles/megaminx/`** — the only **random-moves** event implemented so
  far, and the only puzzle here with no solver. That's Regulation 4b3e, not a
  shortcut: a random-state Megaminx scramble would not be an official one.
  WCA's Pochmann notation has just six tokens, two of which *hold* a face and
  turn everything else — `R±±` holds L, `D±±` holds U, `U`/`U'` turns the top
  layer — so the derivation takes "which pieces move" as a parameter rather
  than assuming it's the turning layer. Centers are modelled precisely because
  those bulk turns carry them: a Megaminx scramble genuinely leaves the puzzle
  reoriented, and the center permutation being confined to the dodecahedron's
  60 rotations is one of the sharper checks on the geometry.

  This is also the one puzzle that can't live on an integer lattice — `φ` and
  `sin 72°` are irrational and dodecahedral rotations aren't expressible over
  the integers the way the cube-family and tetrahedral ones are. So positions
  are floats matched within a tolerance, which is sound because the structure
  is discrete and well separated: the closest two distinct positions of a kind
  are 1 apart against a 1e-6 tolerance and ~1e-15 of rotation error, and
  `geometry.test.ts` *measures* that margin instead of assuming it. Because
  there's no solver, the end-to-end gate is scramble-then-invert rather than
  scramble-then-solve, plus a check that 77 random moves really does displace
  essentially every piece.
- **`src/puzzles/nxn/`** — one module for the whole NxNxN family, currently
  serving 555, 666 and 777 (and, once it exists, 444). It models the cube at
  the **facelet** level rather than as pieces with orientation counters: these
  are random-moves events with no solver, so there is nothing to coordinatise,
  and tracking every sticker individually is a *stronger* check on the derived
  moves than tracking a piece plus a twist. Positions live on an exact integer
  lattice doubled so cubie centres are integers, and each facelet carries its
  outward normal — which is what makes the layer test correct, since which
  layer a facelet belongs to is a property of its cubie, not of its own
  position (every R-face sticker sits at `x = n` on every cube). The 90°
  rotations come from `utils/vec3.ts`, shared with `puzzles/333/geometry.ts`.

  `random-moves.ts` holds the one rule that makes "random moves" mean
  something: within any run of consecutive moves on the same axis, no two may
  turn the same layer set. Same-axis moves commute, so a repeat anywhere inside
  such a run could be reordered together and merged — `R Rw R'` is as redundant
  as `R R'`, and a scrambler that only checked the previous move would emit it.
  `orientation.ts` provides the random puzzle orientation the blindfolded
  events need.
- **`src/puzzles/variants.ts`** — the events that are the same puzzle as one
  already implemented: `333fm`/`333oh` as plain aliases, `333bf`/`555bf` with
  the orientation suffix added.
- **`src/puzzles/square1/`** — the shape-changing puzzle: a 24-slot model where
  a corner is one piece id in two consecutive slots, an exact enumeration
  reproducing the published 3,678 twistable shapes, a two-phase solver, and an
  exact Regulation 4b3d distance check.
- **`src/puzzles/444/`** — under construction, in the milestones of
  [`docs/444-design.md`](./docs/444-design.md). The piece model (derived from the
  facelet model, which stays as its oracle), the coordinates and the published
  `7.4 x 10^45` state count, and phase 1 of the solver are done; the remaining
  phases are not, so `generateScramble('444')` still throws rather than
  returning something plausible.

## Independence note

Every puzzle here is implemented from published *descriptions* of its
mechanics and from this package's own geometric derivations — no code was read
from or adapted from `cubing.js`, csTimer, or TNoodle. The 3x3x3 solver uses
Herbert Kociemba's published two-phase *method*: the group-theoretic
decomposition and the IDA*-with-pruning-tables technique, not any project's
source expression of it.

Where a fact about a puzzle could have been misremembered, it was looked up
and then checked against something computable. The move tables are derived
from coordinate models rather than transcribed, and each puzzle's derivation
is cross-checked against numbers published independently of this code — the
Pyraminx's 933,120 states and God's number of 11, the Skewb's 3,149,280 and
11, the Clock's 12^14, the Megaminx's dodecahedral structure and its 60
rotations. Those checks are what the test suites spend most of their effort
on, because a plausible-looking wrong model is the failure mode that matters.

## Contributing

```bash
npm install
npm run typecheck
npm test
npm run build
```

Every public function should have tests; run `npm run test:coverage` to
check. Issues and pull requests welcome once the repository is public.

## License

[MIT](./LICENSE)
