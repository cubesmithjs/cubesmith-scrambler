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

**`generateScramble('333')` works end to end** — a uniformly random,
physically-reachable state is generated, solved via a two-phase
(Kociemba-style) IDA* search with pruning tables, and the solution's
inverse is returned as the scramble. Every other event still throws
`UnimplementedEventError`.

| Piece | Status |
|---|---|
| Package scaffold, strict TypeScript, ESM, Vitest | ✅ Done |
| `generateScramble()` / registry / typed "not implemented" errors | ✅ Done |
| Seeded (`RandomSource`) / cryptographically-random number generation | ✅ Done |
| Shared face-turn notation (`U`, `R'`, `F2`, …) | ✅ Done |
| 3x3x3 cube state model + all 18 move tables, invariant-tested | ✅ Done |
| 3x3x3 uniformly-random, physically-reachable state generation | ✅ Done |
| 3x3x3 two-phase (Kociemba-style) solver + pruning tables | ✅ Done |
| **`generateScramble('333')`** | ✅ **Done** |
| Every other event (222, 444, …, clock) | Not started — folders exist, no implementation |

Known limitation: pruning tables (~2M states across phase 1, ~1M across
phase 2) are built lazily in memory on first use of each phase, not
precomputed and shipped as a serialized asset. Measured on this machine:
the first scramble in a process pays a **~11s** one-time table-build cost;
every scramble after that (tables now cached) takes **~7-400ms** (mean
~100ms — IDA* search depth varies per random state). Precomputing and
shipping serialized tables to eliminate that cold-start cost is the
natural next optimization, not yet done. See `npm run bench`.

## Usage

```ts
import { generateScramble } from '@cubesmith/scrambler';

const { moves } = await generateScramble('333');
// deterministic given a seed:
const { moves: reproducible } = await generateScramble('333', { seed: 'my-seed' });
```

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
- **`src/puzzles/{222,444,555,666,777,skewb,pyraminx,megaminx,square1,clock}/`**
  — empty. Deliberately: an empty directory isn't a placeholder
  implementation, but a stub file pretending to be a working API would be.

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
