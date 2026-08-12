# Design documents

One document per implemented puzzle, plus a conformance review that spans
several events. All seventeen WCA events are implemented.

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
| `333oh` | random-state | [333-design.md](./333-design.md) — plain alias |
| `333fm` | random-state + `R' U' F` padding | [333-design.md](./333-design.md) §5a — a puzzle of its own, not an alias |
| `333bf` | random-state + 4b3a orientation | [333-design.md](./333-design.md), [nxn-design.md](./nxn-design.md) §5 |
| `444` `444bf` | random-state | [444-design.md](./444-design.md) — `444bf` adds a whole-cube rotation, not a wide move (§11) |
| `555` `666` `777` | random-moves (4b3e) | [nxn-design.md](./nxn-design.md) |
| `555bf` | random-moves + 4b3a orientation | [nxn-design.md](./nxn-design.md) |
| `minx` | random-moves (4b3e) | [megaminx-design.md](./megaminx-design.md) |
| `pyram` | random-state | [pyraminx-design.md](./pyraminx-design.md) |
| `skewb` | random-state | [skewb-design.md](./skewb-design.md) |
| `clock` | random-state | [clock-design.md](./clock-design.md) |
| `sq1` | random-state | [square1-design.md](./square1-design.md) |
| `333mbf` | random-state | [333-design.md](./333-design.md) — `count` × `333bf`, one attempt over many cubes |

## Cross-cutting

- [notation-design.md](./notation-design.md) — the algorithm-notation layer: parser,
  serializer and inverter. Syntax only, no puzzle behind it.
- [blindfolded-review.md](./blindfolded-review.md) — Regulation 4b3a conformance
  for `333bf` and `555bf`, and the review that added the two-move floor.
- [square1-design.md](./square1-design.md) — written *before* implementation, and
  the standard the rest of these follow. Now also its own build record.
- [444-design.md](./444-design.md) — written before implementation, to that same
  standard; §12 tracks the seven milestones through to a working scrambler.

## Open conformance gaps

Recorded here so they are visible in one place rather than only inside the
document that found them:

Every one of these is now **pinned by a test**: `src/core/move-count.test.ts` holds a
per-event band against TNoodle-WCA-1.2.3's own token counts, and an event that deviates
carries its band as a *recorded defect* naming the task that closes it — rather than
having the band widened until the suite passes. Until 2026-08-12 no test anywhere in the
package bounded a generated scramble's length, which is why the `444` row below reached a
printed scramble sheet.

| Gap | Where | Severity |
|---|---|---|
| 🔴 A `444`/`444bf` scramble runs **94–205 tokens** against TNoodle's 42–46 | [444-design.md](./444-design.md) §12 | usability: a scrambler cannot practically apply 156 moves. Measured split over 8 states — centres 16.4, pairing 51.6, **parity 96.5**, 3x3x3 hand-off 22.8. The *state* is uniformly random and unaffected (χ² 5.32 against df 5); the scrambles are long, not wrong |
| 🔴 A `clock` scramble appends **bare pin names** (`… ALL5+ DL UL`) after the fifteenth token | [clock-design.md](./clock-design.md) §5 | format: TNoodle-WCA-1.2.3 emits exactly 15 tokens and ends on the second `ALLn±`, so the string differs *in kind* from the official one and a consumer parsing both handles two grammars |
| A same-face pair can print at the phase-1 / phase-2 boundary of a 3x3x3 solve | [333-design.md](./333-design.md) §8 | ~1 scramble in 20; the printed sequence merges one move shorter. Fixing it changes `333` output for every seed. It is also most of why the five 3x3x3-family events run +3 to +5 moves over TNoodle |
| The `minx` 4b3e floor is measured against the identity state, not "solved up to whole-puzzle rotation" | [megaminx-design.md](./megaminx-design.md) §8 | ~`10^-66`; the floor itself is enforced, this is the residual the piece model cannot yet express |
| Same-face seam at a blindfolded orientation suffix | [nxn-design.md](./nxn-design.md) §8 | cosmetic; deliberately deferred |
| Pruning tables are built in memory on first use, not shipped serialized | every random-state document §8 | 0.2 s–7.6 s cold start depending on the event |
| `444` solver totality measured over dozens of states, not a large sample (checkpoint H's empirical half) | [444-design.md](./444-design.md) §12 | not blocking correctness; every state solved so far, none known to fail |
