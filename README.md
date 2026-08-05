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

**`generateScramble('333')`, `('222')`, `('pyram')` and `('skewb')` all work
end to end.** Each generates a uniformly random, physically-reachable state
and solves it via IDA* with pruning-table heuristics; the solution's inverse
is returned as the scramble. Every other event still throws
`UnimplementedEventError`.

| Piece | Status |
|---|---|
| Package scaffold, strict TypeScript, ESM, Vitest | ✅ Done |
| `generateScramble()` / registry / typed "not implemented" errors | ✅ Done |
| Seeded (`RandomSource`) / cryptographically-random number generation | ✅ Done |
| Shared face-turn notation (`U`, `R'`, `F2`, …) | ✅ Done |
| WCA Regulation 4b3 scramble shaping (per-event minimum distance to solved, presentable sequence length) | ✅ Done |
| **`generateScramble('333')`** — cube state model + all 18 move tables (invariant-tested), parity-correct random-state generation, two-phase (Kociemba-style) solver + pruning tables | ✅ **Done** |
| **`generateScramble('222')`** — single-phase solver (the whole 3,674,160-state group fits in one pruning table, confirmed by BFS reaching every entry — no two-phase decomposition needed) | ✅ **Done** |
| **`generateScramble('pyram')`** — tetrahedral geometry derived on an exact integer lattice, single exact pruning table, optimal solve + WCA-shaped tip moves | ✅ **Done** |
| **`generateScramble('skewb')`** — corner-turning, deep-cut geometry; BFS-discovered coordinates reproducing the puzzle's 3,149,280 states exactly | ✅ **Done** |
| Every other event (444, 555, …, clock) | Not started — folders exist, no implementation |

Known limitation: pruning tables are built lazily in memory on first use,
not precomputed and shipped as a serialized asset. Measured on this
machine: **333** — ~11s one-time cold-build, then ~7-400ms per scramble
(mean ~100ms; search depth varies per state). **222** — ~5.75s cold-build,
then ~0.017ms per scramble (~59,000/sec). **pyram** — ~1s cold-build, then
~0.020ms (~50,000/sec). **skewb** — ~1.5s cold-build, then ~0.014ms
(~72,000/sec). For 222, pyram and skewb the pruning table holds the *exact*
distance for the whole group, so search is essentially free once built.
Precomputing and shipping serialized tables to eliminate the cold-start cost
is the natural next optimization, not yet done. See `npm run bench`.

## Usage

```ts
import { generateScramble } from '@cubesmith/scrambler';

const { moves } = await generateScramble('333');
const { moves: pocketCube } = await generateScramble('222');
const { moves: pyraminx } = await generateScramble('pyram');
const { moves: skewb } = await generateScramble('skewb');
// deterministic given a seed:
const { moves: reproducible } = await generateScramble('333', { seed: 'my-seed' });
```

## Scramble shape — what the WCA Regulations require beyond "random state"

A scramble is not just the inverse of a random state's solution. Two extra
rules apply, and both are implemented here (`src/core/scramble-shape.ts`):

- **A minimum number of moves to solve.** Regulation 4b3 sets a floor of 2
  moves, with per-puzzle exceptions: **2x2x2 ≥ 4** (4b3b), **Skewb ≥ 7**
  (4b3c), **Square-1 ≥ 11** (4b3d), **Pyraminx ≥ 6** (4b3f). Enforced by
  redrawing, which is what keeps the "equal probability for each state" the
  regulation also demands — the conditional distribution of a uniform draw is
  uniform on the condition.
- **A minimum sequence length.** The regulation constrains the state, not
  the printed sequence — but a scrambler that always prints the *optimal*
  solution leaks the state's difficulty, so a short sequence on a scramble
  sheet advertises an easy scramble. WCA's own scrambler pads to 11 moves
  for this reason ([incident 28](https://www.worldcubeassociation.org/incidents/28)).
  Padding here asks the solver for a solution of a given *exact* length
  rather than the shortest one, so the state reached is unchanged and still
  uniformly random.

## Design

- **`src/core/`** — the public entry point (`generateScramble`), the
  per-event scrambler registry, and shared types. `WcaEventId` lists the
  full target event surface as a type; only events actually registered
  (currently: none) are callable — everything else throws a typed
  `UnimplementedEventError` rather than a placeholder result.
- **`src/random/`** — `RandomSource`, the only thing any scrambler is
  allowed to draw randomness from. Seeded via a tiny deterministic PRNG
  (mulberry32) when `options.seed` is given; backed by
  `crypto.getRandomValues` (never `window.crypto` — the standard
  `globalThis.crypto`, present in Node ≥19, Bun, and every browser)
  otherwise.
- **`src/notation/`** — move/notation primitives (`Face`, `FaceMove`,
  `moveToString`, `parseMove`, inversion) shared by every face-turn-family
  puzzle (222–777).
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
- **`src/puzzles/{444,555,666,777,megaminx,square1,clock}/`** — empty.
  Deliberately: an empty directory isn't a placeholder implementation, but a
  stub file pretending to be a working API would be.

## Independence note

The two-phase algorithm this package's solver will implement is Herbert
Kociemba's published *method* — the group-theoretic decomposition and
IDA*-with-pruning-tables technique, not any project's source code. It's
implemented from that conceptual description; no code was read from or
adapted from `cubing.js`, csTimer, or TNoodle.

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
