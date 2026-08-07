# Design documents

One document per implemented puzzle, plus a conformance review that spans
several events. Every WCA event except `333mbf` is implemented; `333mbf` is out
of scope by design rather than unbuilt.

Most documents follow the same nine-section structure — overview, notation,
state model, move model, scramble generation, validation, complexity, known
limitations, references — and record a finished implementation. Three do not:
`square1-design.md` and `444-design.md` were written *before* their
implementations and kept as build records, so they run to thirteen sections of
plan-then-result; `blindfolded-review.md` is a conformance review rather than a
design document.

Every number in any of them is either read off the code or measured, not
recalled. Where an implementation has a limitation or a conformance gap, it is
stated in that document's §8 rather than smoothed over.

## By event

| Event | Method | Document |
|---|---|---|
| `222` | random-state | [222-design.md](./222-design.md) |
| `333` | random-state | [333-design.md](./333-design.md) |
| `333fm` `333oh` | random-state | [333-design.md](./333-design.md) — plain aliases |
| `333bf` | random-state + 4b3a orientation | [333-design.md](./333-design.md), [nxn-design.md](./nxn-design.md) §5 |
| `444` `444bf` | random-state | [444-design.md](./444-design.md) — `444bf` takes no orientation suffix (§11) |
| `555` `666` `777` | random-moves (4b3e) | [nxn-design.md](./nxn-design.md) |
| `555bf` | random-moves + 4b3a orientation | [nxn-design.md](./nxn-design.md) |
| `minx` | random-moves (4b3e) | [megaminx-design.md](./megaminx-design.md) |
| `pyram` | random-state | [pyraminx-design.md](./pyraminx-design.md) |
| `skewb` | random-state | [skewb-design.md](./skewb-design.md) |
| `clock` | random-state | [clock-design.md](./clock-design.md) |
| `sq1` | random-state | [square1-design.md](./square1-design.md) |
| `333mbf` | — | out of scope by design; see [nxn-design.md](./nxn-design.md) §8 |

## Cross-cutting

- [blindfolded-review.md](./blindfolded-review.md) — Regulation 4b3a conformance
  for `333bf` and `555bf`, and the review that added the two-move floor.
- [square1-design.md](./square1-design.md) — written *before* implementation, and
  the standard the rest of these follow. Now also its own build record.
- [444-design.md](./444-design.md) — written before implementation, to that same
  standard; §12 tracks the seven milestones through to a working scrambler.

## Open conformance gaps

Recorded here so they are visible in one place rather than only inside the
document that found them:

| Gap | Where | Severity |
|---|---|---|
| 4b3's two-move floor is not enforced for `333`, `333fm`, `333oh` | [333-design.md](./333-design.md) §8 | ~`4 × 10^-19` per scramble; a requirement, not a likelihood |
| 4b3e's two-move floor is not enforced for `minx` | [megaminx-design.md](./megaminx-design.md) §8 | far below observable; same reasoning |
| Same-face seam at a blindfolded orientation suffix | [nxn-design.md](./nxn-design.md) §8 | cosmetic; deliberately deferred |
| Pruning tables are built in memory on first use, not shipped serialized | every random-state document §8 | 0.2 s–7.6 s cold start depending on the event |
| `444` solver totality measured over dozens of states, not a large sample (checkpoint H's empirical half) | [444-design.md](./444-design.md) §12 | not blocking correctness; every state solved so far, none known to fail |
