# @cubesmith/scrambler

Dependency-free WCA scramble generation. Pure computation only — no Web Worker, no DOM,
no browser-only API — so it works identically in Node, Bun, Vite, and both Next.js
Server and Client Components.

Not affiliated with or endorsed by the World Cube Association.

**Live demo:** <https://cubesmithjs.github.io/cubesmith-scrambler-demo/>. Every scramble
on it is generated in your own browser tab, with no Worker involved
([demo source](https://github.com/cubesmithjs/cubesmith-scrambler-demo)).

## Why this exists

`cubing/scramble`, a popular scramble-generation package, always instantiates a Web
Worker, and that worker fails under some modern bundler dev setups such as Next.js +
Turbopack ([cubing/cubing.js#309](https://github.com/cubing/cubing.js/issues/309),
[#327](https://github.com/cubing/cubing.js/issues/327)). This package never uses a Worker,
so that whole class of failure cannot happen.

## Install

```bash
npm install @cubesmith/scrambler
```

## Quick start

```ts
import { generateScramble } from '@cubesmith/scrambler';

const { moves } = await generateScramble('333');
const { moves: octahedron } = await generateScramble('fto');
const { moves: blind } = await generateScramble('333bf');        // randomly oriented
const { scrambles } = await generateScramble('333mbf', { count: 5 }); // one attempt, five cubes
const { moves: same } = await generateScramble('333', { seed: 'my-seed' }); // deterministic
```

A `ScrambleResult` carries `moves` and `quality` (`'random-state'` or `'random-moves'`,
whichever the event's regulation calls for). `isImplementedEvent(event)` answers whether an
event is callable.

## Entry points

| Import | What it gives you |
|---|---|
| `@cubesmith/scrambler` | scrambles, batches and notation tools for the eighteen WCA events |
| `@cubesmith/scrambler/draw` | the scramble picture for each WCA event, as data plus an SVG serializer |
| `@cubesmith/scrambler/unofficial` | scrambles for sixteen non-WCA puzzles |
| `@cubesmith/scrambler/unofficial/draw` | their pictures |

Each is a separate bundle, so a consumer that only scrambles WCA events never ships the
drawing code or the unofficial events.

## Events

**All eighteen WCA events work end to end.** Each has a design document under
[`docs/`](./docs/), with the method, the measurements and its known limitations.

| Event | Method | Notes |
|---|---|---|
| `333` | random-state | two-phase (Kociemba-style) solver |
| `222` | random-state | one exact pruning table over all 3,674,160 states |
| `444` `444bf` | random-state | reduction + 3x3x3 hand-off; long and slow by design ([`docs/444-design.md`](./docs/444-design.md)) |
| `555` `666` `777` | random-moves | 60 / 80 / 100 moves, as Regulation 4b3e requires |
| `333oh` | random-state | the `333` scramble |
| `333fm` | random-state | padded with `R' U' F` at both ends, as the official program does |
| `333bf` `555bf` | as their base | plus a uniformly random orientation (Regulation 4b3a; see [`docs/blindfolded-review.md`](./docs/blindfolded-review.md)) |
| `333mbf` | random-state | `count` independent `333bf` scrambles |
| `minx` | random-moves | Pochmann notation, 77 moves |
| `pyram` | random-state | 933,120 states, reproduced by BFS |
| `skewb` | random-state | 3,149,280 states, reproduced by BFS |
| `clock` | random-state | linear algebra over `Z12`; 15 tokens, matching TNoodle |
| `sq1` | random-state | two-phase solver with an exact 4b3d check |
| `fto` | random-state | official from 2027-01-02; notation **provisional** until the WCA publishes its FTO regulations ([`docs/fto-design.md`](./docs/fto-design.md) §8) |

Every scramble also obeys the rest of Regulation 4b3: a minimum solve distance per
puzzle, a padded minimum length, and no redundant move. Details in
[`docs/architecture.md`](./docs/architecture.md) §2.

**Cost.** Pruning tables are built in memory the first time an event is used: about
11 s for `333`, 7 s for `444`, 6 s for `222` and `fto`, under 2 s for `pyram` and
`skewb`, and nothing for the random-moves events or `clock`. After that a scramble takes
well under a millisecond for most events, about 100 ms for `333`, 300 ms for `fto`, and
longer for `444`.
Call `prepareEvent()` to pay that cost before anyone is waiting
([`docs/architecture.md`](./docs/architecture.md) §3 has the measurements).

## Usage

### Reading and inverting notation

```ts
import { parseAlgorithm, serializeAlgorithm, invertAlgorithm } from '@cubesmith/scrambler';

const alg = parseAlgorithm("R U R' U' // sexy move");
serializeAlgorithm(invertAlgorithm(alg)); // "U R U' R'"

// wide moves, slices, rotations, groups, commutators and conjugates:
serializeAlgorithm(invertAlgorithm(parseAlgorithm("[R: (U Rw U')2]"))); // "[R: (U Rw' U')2]"
```

A parse error carries the offset, the span to underline and a **stable reason code**:

```ts
try {
  parseAlgorithm('R U Q');
} catch (error) {
  const syntax = error as AlgorithmSyntaxError;
  syntax.offset; // 4
  syntax.length; // 1        — how much to underline
  syntax.reason; // 'not-a-move'
  syntax.char;   // 'Q'
}
```

`reason` is a `SyntaxErrorReason`: one of twenty documented string codes, each with the
data a message needs. The package ships no message strings beyond the English `.message`,
so you write the sentence in any language. For a text field, `validateAlgorithm` is the
non-throwing sibling:

```ts
import { validateAlgorithm } from '@cubesmith/scrambler';

const ok = validateAlgorithm("R U R' U'");
ok.valid; // true
if (ok.valid) ok.algorithm.nodes.length; // 4 — the same tree parseAlgorithm returns

const bad = validateAlgorithm('R U Q');
bad.valid; // false
if (!bad.valid) bad.error.reason; // 'not-a-move'
```

This layer is syntax only, with no puzzle behind it, so it does no move cancellation.
See [`docs/notation-design.md`](./docs/notation-design.md).

### Validating a scramble, for any of the eighteen events

```ts
import { validateScramble } from '@cubesmith/scrambler';

validateScramble('minx', 'R++ D-- U').valid; // true
validateScramble('sq1', '(1, 0) / (0, -2) /').valid; // true
validateScramble('333', "R U R' U'").valid; // true
validateScramble('fto', "U BR' F L' BL D").valid; // true — BR is one face

const bad = validateScramble('clock', 'UR4+ UR9+');
bad.valid; // false
if (!bad.valid && bad.notation !== 'cube') {
  bad.error.reason; // 'clock-hour-out-of-range'
  bad.error.offset; // 5
  bad.error.length; // 4  — how much to underline
  bad.error.hours;  // 9
}
```

A cube-notation failure is an `AlgorithmSyntaxError`. The six other grammars raise a
`ScrambleSyntaxError` with a `ScrambleErrorReason`: one of fifteen documented string codes,
each prefixed by its grammar (`clock-*`, `fto-*`, …). The two classes are deliberately
separate:

```ts
import { AlgorithmSyntaxError, ScrambleSyntaxError } from '@cubesmith/scrambler';

const clock = validateScramble('clock', 'UR9+');
!clock.valid && clock.error instanceof AlgorithmSyntaxError; // false
```

`validateScramble` answers *"is this valid notation for this event"* and nothing else;
whether a scramble is WCA-legal is a different question.

### Generating a whole set

🔴 **Don't loop over `generateScramble` for a set: a seeded loop returns the same scramble N
times**, because each call reseeds. `generateScrambles` uses one random source for the whole
batch:

```ts
import { generateScrambles, prepareEvent, MAX_BATCH_COUNT } from '@cubesmith/scrambler';

await prepareEvent('444'); // build the tables now, not on the first scramble

const round = await generateScrambles('333', 20, {
  seed: 'comp-42-round-1',
  onProgress: (done, total) => {
    // Awaited: this is where a browser can repaint (return scheduler.yield()).
  },
});
round.length;   // 20
round[0].moves; // the first draw; `result[i]` is the i-th, always

const attempts = await generateScrambles('333mbf', 3, { cubesPerAttempt: 12 });
attempts[0].scrambles.length; // 12 cubes in the first attempt
```

`count` must be an integer in `1..MAX_BATCH_COUNT` (500). An `await` on a single
`generateScramble` is **not** a yield point for rendering; `onProgress` is.

### Drawing a scramble: `@cubesmith/scrambler/draw`

```ts
import { drawScramble, scrambleImageToSvg, defaultColorScheme } from '@cubesmith/scrambler/draw';

const image = drawScramble('333', "R U R' U' F2 D");
image.width;            // 130  — TNoodle's getPreferredSize()
image.height;           // 98
image.shapes.length;    // 54   — one per sticker
image.shapes[0].kind;   // 'rect'

scrambleImageToSvg(image);           // a standalone <svg> string
defaultColorScheme('skewb').R;       // '#0000ff' — blue here, red on a cube
```

It draws from **text**, so a typed or stored scramble draws exactly as a generated one.
The result is data, so a React consumer can map `shapes` to elements. Colour schemes
differ between puzzles: read `defaultColorScheme(event)` before overriding a key. See
[`docs/drawing-design.md`](./docs/drawing-design.md).

### Unofficial events: `@cubesmith/scrambler/unofficial`

Sixteen puzzles the WCA does not hold, behind their own entry point so nothing above
changes. `isImplementedEvent('888')` is still `false`.

```ts
import { generateUnofficialScramble } from '@cubesmith/scrambler/unofficial';
import { drawUnofficialScramble } from '@cubesmith/scrambler/unofficial/draw';

const big = await generateUnofficialScramble('888');
big.quality;                           // 'random-moves'
big.moves.split(' ').length;           // 120

(await generateUnofficialScramble('fisher')).quality;  // 'random-state-mechanism'

drawUnofficialScramble('888', big.moves).width;        // 330 — the cube net at size 8
drawUnofficialScramble('fisher', "R U R' U'").shapes[0].kind;  // 'polygon' — two isometric views
drawUnofficialScramble('mirror', 'R U', undefined, { view: 'height-map' }).width;  // 130
```

| Events | Scramble | Drawing |
|---|---|---|
| `888` `999` `1010` `1111` `1212` | random moves, 120–200 | cube net |
| `222bf` `666bf` `777bf` | sighted scramble + random orientation | cube net |
| `pyrambf` `minxbf` | the WCA scramble, unchanged | Pyraminx / Megaminx net |
| `mirror` `fisher` `mastermorphix` | the `333` scramble | isometric views (Mirror: also a height map) |
| `axis` `windmill` `ghost` | the `333` scramble | none yet: no source for their geometry |

No regulation exists for these events, so every length, orientation rule and notation
choice is cited or labelled a convention in
[`docs/unofficial-design.md`](./docs/unofficial-design.md).
`random-state-mechanism` means a shape-mod scramble is uniform over the hidden 3x3x3, not
over the centre orientations an Axis or Fisher Cube shows. The ids are the ones the
CubeManager event catalogue uses.

## Independence

No code was adapted from `cubing.js`, csTimer or TNoodle. Every puzzle is implemented from
published descriptions and checked against independently published numbers. The one
consulted source file is disclosed in [`docs/architecture.md`](./docs/architecture.md) §4.

## More

- [`CHANGELOG.md`](./CHANGELOG.md): what changed in each version, including seeded
  scrambles that differ after an upgrade.
- [`docs/`](./docs/): one design document per puzzle, plus the architecture overview.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md): how to build, test and propose a change.

## License

[MIT](./LICENSE)
