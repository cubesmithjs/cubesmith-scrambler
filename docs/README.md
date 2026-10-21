# Design documents

One document per implemented puzzle, plus a conformance review that spans
several events. All eighteen WCA events are implemented.

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
| `fto` | random-state | [fto-design.md](./fto-design.md) — official from 2027-01-02; notation and floor provisional until the regulations (§8) |

## Unofficial events (`@cubesmith/scrambler/unofficial`)

Sixteen events the WCA does not hold, behind their own entry point so the WCA
surface and its claims are untouched. Every convention is labelled as one.

| Events | Method | Document |
|---|---|---|
| `888` `999` `1010` `1111` `1212` | random-moves, lengths backed by a mixing measurement | [unofficial-design.md](./unofficial-design.md) §5.1 |
| `222bf` `666bf` `777bf` | sighted scramble + 4b3a-style orientation | [unofficial-design.md](./unofficial-design.md) §5.2 |
| `pyrambf` `minxbf` | the WCA scramble, unchanged, and measured to be why | [unofficial-design.md](./unofficial-design.md) §5.3 |
| `mirror` `axis` `fisher` `windmill` `ghost` `mastermorphix` | `333` scramble, `random-state-mechanism` | [unofficial-design.md](./unofficial-design.md) §5.4 |
| drawings, including the shape-mod geometry engine | nets, isometric views, a height map | [shape-mod-drawing-design.md](./shape-mod-drawing-design.md) |

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
carries its band as a *recorded defect* naming the task that closes it, or the decision
that **accepted** it — rather than having the band widened until the suite passes. Until 2026-08-12 no test anywhere in the
package bounded a generated scramble's length, which is why the `444` row below reached a
printed scramble sheet.

| Gap | Where | Severity |
|---|---|---|
| ⚠️ A `444`/`444bf` scramble runs **56–114 tokens, mean 74** against TNoodle's 42–46 | [444-design.md](./444-design.md) §8, §12.8–12.9 | 94–205 (mean 137.5) → 74–172 (119.4) on 2026-08-12 → 59–119 (85.9) → **56–114 (73.8, median 69)** on 2026-08-13, the last two steps being a pairing searched for total word length and a phase-1 route chosen for even wing parity, which decides OLL parity for the whole solve — 23 states in 30 now need no parity pass. **accepted, not outstanding.** Centres (16.1) + hand-off (23.3) = 39.4 already fits TNoodle's whole budget, so the gap is all reduction overhead — every move that can pair a wing unsolves the centres, so pairing runs over ~7-move centre-neutral sequences. The six-wing pruning table *does* build (23.1 s under a 24-fold symmetry fold, against the doc's "minutes to hours") and reads 6.7 where the pairing spends 29.9. 🔴 And **more phases is the wrong lever**: the published eight-phase method (arXiv:1601.05744) runs 67–79 moves, *longer than our median of 69*. Closing it needs **fewer** phases with a coordinate of radius ~20, which nobody has produced. The *state* is uniformly random and unaffected |
| ~~A same-face pair can print at the phase-1 / phase-2 boundary of a 3x3x3 solve~~ | [333-design.md](./333-design.md) §8 "Fixed" | **Fixed 2026-10-21.** It was 20–22 of 300 scrambles per 3x3x3-family event, plus 1–2 with the opposite-face form `R2 L2 R'`. Phase 2 now reads phase 1's moves as history: 0 of 300, and only the scrambles that had a seam changed |
| ⚠️ The five 3x3x3-family events run **+3 to +5 moves** over TNoodle (`333` 21–26 against 19–20) | [333-design.md](./333-design.md) §8 rough edge 2 | **accepted, not outstanding.** The cause is that the solver takes the first phase-1 solution rather than sweeping several. Measured 2026-08-13: sweeping buys 1.3 moves for ≥10× the time and 2.1 for ≥73×, and still lands at 21.2. A 3x3x3 scramble is on the consuming app's practice-timer hot path |
| The `minx` 4b3e floor is measured against the identity state, not "solved up to whole-puzzle rotation" | [megaminx-design.md](./megaminx-design.md) §8 | ~`10^-66`; the floor itself is enforced, this is the residual the piece model cannot yet express |
| Same-face seam at a blindfolded orientation suffix | [nxn-design.md](./nxn-design.md) §8 | cosmetic; deliberately deferred |
| Pruning tables are built in memory on first use, not shipped serialized | every random-state document §8 | 0.2 s–7.6 s cold start depending on the event |
| `444` solver totality measured over dozens of states, not a large sample (checkpoint H's empirical half) | [444-design.md](./444-design.md) §12 | not blocking correctness; every state solved so far, none known to fail |
