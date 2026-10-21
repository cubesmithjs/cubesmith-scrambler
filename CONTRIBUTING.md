# Contributing to @cubesmith/scrambler

Thank you for helping. This package generates scrambles that people compete on, so the
bar is correctness that can be checked, not just code that looks right. This page is
short on purpose; the reasoning behind each rule is in [`docs/`](./docs/).

## Getting started

You need Node.js 22 (what CI uses; the published package supports Node 18 and later).

```bash
npm ci
npm run ci          # typecheck → tests with coverage → build: exactly what CI runs
```

While working:

| Command | What it does |
|---|---|
| `npm test` | run the test suite once |
| `npm run test:watch` | re-run tests as you edit |
| `npm run typecheck` | TypeScript only |
| `npm run bench` | table-build and scramble-time benchmarks |
| `npm run build` | build `dist/` with tsup |

The coverage run is slow by design: pruning tables are built under V8 instrumentation,
and the test timeout is 180 s. Give it a few minutes.

## Ground rules

1. **No runtime dependencies, and pure computation only.** No Web Worker, no DOM, no
   browser-only API, so the package runs the same in Node, Bun, browsers and Next.js
   server code. A change that needs one of these is out of scope.
2. **Never copy code from another scrambler.** csTimer and TNoodle are GPL-3.0, and
   cubing.js is MPL-2.0 or GPL-3.0; none of them may be copied or translated into this MIT
   package. Published *facts* (a puzzle's construction, a state count, a regulation) are
   fine, cited where you use them. If you read another project's source for any reason,
   say so in your pull request, as [`docs/architecture.md`](./docs/architecture.md) §4
   does for the one file this package has consulted.
3. **Every number is read off the code or measured.** A state count, a scramble length or
   a timing in a doc or a comment must come from a test or a measurement you ran, never
   from memory. Prefer a test that checks the number against an independently published
   one: a plausible-looking wrong model is the failure that matters here.
4. **The README is executable.** `src/readme.test.ts` runs its examples and checks its
   counts. If you change the public API or an example, change the README and its test
   together.
5. **Randomness goes through `RandomSource`.** Outside `src/random/`, never call
   `Math.random()` or `crypto` directly. A seeded call must be reproducible, so don't consume random draws you then
   throw away.
6. **WCA and unofficial events stay apart.** WCA events live on the main entry and follow
   the WCA Regulations. A puzzle the WCA does not hold goes in `src/unofficial/`, never
   into `WcaEventId`, and every convention it uses is labelled as one in
   [`docs/unofficial-design.md`](./docs/unofficial-design.md).
7. **A change to seeded output is a breaking change.** If the same seed would give a
   different scramble, say so in `CHANGELOG.md` and in the pull request.

## Adding a puzzle

Open an issue first, so the method (random-state or random-moves), notation and
verification can be agreed before you write the solver. A new puzzle comes with:

- its model, scrambler, notation and `validateScramble` support, with tests that check the
  model against published numbers;
- a drawing, if there is a sourced geometry for it;
- `docs/<puzzle>-design.md` in the nine-section structure the others use (overview,
  notation, state model, move model, scramble generation, validation, complexity, known
  limitations, references), and a row in [`docs/README.md`](./docs/README.md);
- the README's event table and a `CHANGELOG.md` entry.

## Pull requests

- Keep a pull request to one change. Write a commit message that says what changed and why.
- `npm run ci` must pass. CI runs it again on every pull request (Dependabot's are skipped
  to save Actions minutes, and the maintainer checks those locally).
- A known limitation belongs in the puzzle's design document (§8), stated plainly.

## Reporting a bug

Open an issue with the package version, the event, the scramble text and, if you have it,
the seed. A wrong scramble is reproducible from those four, and that is the fastest way to
a fix. Please don't report a security problem in a public issue; contact the maintainer,
[@DrSiroukane](https://github.com/DrSiroukane), privately first.

## Releases

Releases are made by the maintainer: a GitHub release publishes the package to npm from
CI, with provenance. Contributors don't need to bump the version.
