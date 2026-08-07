# Algorithm notation — design document

Written *after* the implementation, to record what `src/notation/alg/` actually
does. Numbers are read off the code or measured, never recalled.

Covers the parser, the serializer and the inverter — the layer that lets the
package read notation rather than only print it. Targets: `parseAlgorithm`,
`serializeAlgorithm` and `invertAlgorithm`, shipped since v0.10.

---

## 1. Overview

### What it is for

Two gaps, one internal and one external.

**The package could not read its own output.** `src/notation/move.ts`'s
`parseMove` accepts `/^([UDFBLR])(2|')?$/` and nothing else, while
`generateScramble('333bf')` emits `Rw2 Fw'`, `generateScramble('555')` emits
`3Rw`, and `generateScramble('444bf')` emits `x2 y'`. That is incoherent
regardless of whether anyone consumes it.

**A consumer needed a parser.** `cube-manager-frontend` uses `cubing/alg`'s
`Alg.fromString(...).invert().toString()` in two places: to derive a case's
setup as the inverse of its algorithm, and as a *notation validator* over its
whole OLL/PLL/F2L library. Both are exactly this layer's job, and neither needs
a puzzle model.

### Goal of the implementation

Parse full WCA algorithm notation into a typed tree, invert it, and write it
back — with nothing puzzle-aware anywhere in the path.

### References used

- The WCA Regulations' notation article, for what official scrambles contain.
- `cubing/alg`'s observable behaviour, as a **cross-check on inversion only**
  and run once as a one-off script. It is not a dependency of this package and
  must not become one: depending on the library you are replacing, in order to
  test the replacement, is a dependency the package should not carry.
- No third-party parser source was read.

### Files

| | |
|---|---|
| `types.ts` | the AST node union, `Algorithm`, and `AlgorithmSyntaxError` |
| `tokenize.ts` | string → flat token list with offsets |
| `parse.ts` | recursive-descent parser over the tokens |
| `serialize.ts` | tree → string, and the normalizations it performs |
| `invert.ts` | the inverse of a tree |
| `equality.ts` | structural equality and a flat move walk |
| `cfop-corpus.ts` | 122 algorithms copied from the frontend, as an external test corpus |

---

## 2. Notation

### Supported notation

| Construct | Accepted spellings |
|---|---|
| Face moves | `R` `R'` `R2` `R3` `R2'` — six faces `U D F B L R` |
| Wide moves | `Rw` `Rw'` `Rw2`, lowercase `r`, numeric prefix `3Rw` / `3r`, range `2-3Rw` |
| Slices | `M` `E` `S` with the same amounts |
| Rotations | `x` `y` `z` with the same amounts |
| Grouping | `(R U)` `(R U)2` `(R U)'` `(R U)2'`, nested |
| Commutator | `[A, B]`, with an optional repetition |
| Conjugate | `[A: B]`, with an optional repetition |
| Pause | `.` |
| Comment | `// …` to end of line |
| Whitespace | spaces, tabs and newlines are all one separator |

**Amounts are signed integers and never zero.** `R` is `1`, `R2` is `2`, `R'`
is `-1`, `R2'` is `-2`, `R3` is `3`.

`R3` and `R2'` are accepted deliberately, not by accident of the grammar. The
WCA never emits them and neither does this package — but the reason this layer
exists is to *read* notation somebody else wrote, and `cubing/alg` accepts
arbitrary integer amounts. Rejecting them would make this a **stricter**
validator than the one it replaces, which would surface as false failures on a
library that was previously fine.

### What is deliberately not accepted

The five bespoke puzzle notations: Megaminx's Pochmann `R++`/`D--`/`U`,
Clock's pin-and-hour syntax, Pyraminx's and Skewb's order-3 turns, and
Square-1's `(a,b)/`. They live in their own modules and do not share this type.
This is the main design risk in the whole layer, and the reason is concrete: a
Pyraminx `2` means *counterclockwise*, not a half turn, so a shared `amount`
field would be actively wrong rather than merely loose. `corpus.test.ts`
asserts that parsing a generated `minx`, `clock` or `sq1` scramble **throws**,
so the refusal is tested rather than assumed.

Unknown letters are a syntax error too. A validator that tolerates `Q` is not
validating.

### Parsing rules

The grammar in full:

```
algorithm  := node*
node       := move | pause | group | bracket
group      := "(" algorithm ")" amount?
bracket    := "[" algorithm ( "," | ":" ) algorithm "]" amount?
```

Two things make it more than a regex sweep.

**A number means different things in different places.** `2` opens a layer
range in `2-3Rw` and is a repetition count in `(R U)2`. They are told apart by
what precedes them — an amount can only follow a `)` or a `]` — so the
tokenizer is context-sensitive by one token. That is unusual enough to be worth
stating rather than discovering.

**`[` does not say which construct it opens.** `[A, B]` is a commutator and
`[A: B]` a conjugate, and the separator that decides it can be arbitrarily far
away, past any amount of nesting. So the parser reads the first half until it
meets a separator *at its own depth* and decides then. Committing on the `[` is
the obvious wrong turn.

A related structural choice: `parseNodes` never throws. A token that cannot
start a node simply ends the list, and the caller — which knows what it was
expecting — decides whether that was a legitimate terminator or an error. That
keeps every "unexpected X" message in one place instead of splitting them
between the node dispatcher and three call sites.

### Rendering rules — the normalizations

A serializer that quietly rewrites its input is a source of consumer surprise,
so every rewrite is listed and tested. `serialize(parse(s))` returns `s`
exactly **unless** `s` used one of these spellings:

| Written | Re-emitted | Why |
|---|---|---|
| `r`, `l'`, `r2` | `Rw`, `Lw'`, `Rw2` | Resolved at parse time; the tree does not remember the spelling. One spelling out. |
| `2Rw` | `Rw` | Same block, and `Rw` is what official scrambles print — matching `nxn/notation.ts`, which accepts `2Rw` and never emits it. |
| `R1` | `R` | An amount of 1 is the absence of a suffix throughout WCA notation. |
| `(R U)1` | `(R U)` | The same rule applied to a repetition. |
| `R  U`, `R\nU` | `R U` | Nodes join with single spaces; a multi-line algorithm returns on one line. |
| `R U // note` | `R U` | **The one lossy case** — comments are discarded at parse time. |

Everything else round-trips character for character, including `R3`, `R2'`,
`2-3Rw`, pauses, and the difference between `[A, B]` and `[A: B]`.

Serialization is **idempotent**, and that is what makes the table a complete
list rather than a hopeful one: `serialize(parse(serialize(parse(s))))` equals
`serialize(parse(s))` for every input, asserted over the whole CFOP corpus.

### Examples

```
parse("R U R' U' // sexy") -> serialize -> "R U R' U'"
parse("[R: (U r U')2]")    -> serialize -> "[R: (U Rw U')2]"
```

---

## 3. State model

There is none, and that is the design rather than a gap. The tree is syntax:
nodes, amounts and nesting. Nothing in this module knows what a cube is, how
many layers it has, or what order a face turn has.

The node union:

| Node | Fields |
|---|---|
| `move` | `family`, `outerLayer`, `innerLayer`, `amount` |
| `pause` | — |
| `group` | `body`, `amount` |
| `commutator` | `a`, `b`, `amount` |
| `conjugate` | `a`, `b`, `amount` |

Layers are a **closed range counted inwards from the face**, and both ends are
`null` when the notation did not write them:

| Written | `outerLayer` | `innerLayer` |
|---|---|---|
| `R` | `null` | `null` |
| `Rw`, `r` | `null` | `2` |
| `3Rw`, `3r` | `null` | `3` |
| `2-3Rw` | `2` | `3` |
| `M`, `x` | `null` | `null` |

Required-and-nullable rather than optional properties, for two reasons: the
package compiles with `exactOptionalPropertyTypes`, under which an absent
property and a present-but-`undefined` one are different types; and structural
equality over a tree is far simpler when every node has the same shape.

---

## 4. Move model

Inversion is the only operation, and each compound node is worth deriving
rather than pattern-matching — two of the three have a plausible wrong answer.

| Node | Inverse | Derivation |
|---|---|---|
| `move` | negate `amount` | — |
| `pause` | itself | — |
| `group` | invert the **body**, keep the count | `(A)ⁿ` is `A` repeated `n` times, so its inverse is `(A⁻¹)ⁿ` |
| `commutator` | **swap** the halves | `[A, B]` is `A B A' B'`, so its inverse is `B A B' A' = [B, A]` |
| `conjugate` | invert the **second half only**, do not swap | `[A: B]` is `A B A'`, so its inverse is `A B' A' = [A: B']` |

A node list is reversed and each node inverted.

The conjugate rule is the mirror image of the commutator rule and is the
easiest of the three to get backwards, which is why both are written out above
rather than left to the reader.

### The half-turn question

`R2` inverts to `R2'`, **not** to `R2`. They are the same turn on a cube, but
only because a face has order 4 — a fact about the puzzle, not about the
notation. Returning `R2` would be a semantic simplification smuggled into a
syntax operation, and the same rule would be wrong on a Pyraminx, where a turn
has order 3. `cubing/alg` behaves identically, verified rather than assumed
(§6).

---

## 5. Scramble generation algorithm

Not applicable: this module generates nothing. It is listed here only so the
nine-section structure is not silently broken — the section a reader expects
should say why it is empty rather than be missing.

---

## 6. Validation

### Two corpora that were not written for this parser

A grammar tested only against strings written while writing the grammar will
pass. Both corpora here were written by something else.

**The package's own output.** A generated scramble for every cube event —
`222`, `333`, `333bf`, `333fm`, `333mbf`, `333oh`, `444`, `444bf`, `555`,
`555bf`, `666`, `777` — is parsed, checked to contain exactly as many nodes as
it has tokens, and round-tripped through the serializer **exactly**. This is the
coherence gap closing; `333bf`/`555bf` (wide-move suffixes), `555`/`666`/`777`
(`3Rw`) and `444bf` (rotations) are the load-bearing cases. Totality is checked
over 300 further seeded scrambles.

**The frontend's CFOP library**, 122 unique algorithms copied into
`cfop-corpus.ts` — copied, not imported: the two repositories have separate
release cycles and this package has no dependency on the app. It uses lowercase
wides (`r`, `l'`, `r2`), slices (`M`, `M'`, `M2`) and rotations (`x'`, `y'`)
mixed with face turns, which is exactly the set of spellings a hand-rolled
grammar gets wrong. A companion test asserts the corpus still *contains* those
spellings, so trimming it later fails loudly rather than quietly weakening the
parse test.

### The one-off cross-check against `cubing/alg`

Run once, on 2026-08-07, against the `cubing@0.63.3` installed in the frontend,
as a script outside this package's test suite.

| | |
|---|---|
| Corpus | 122 algorithms |
| Identical output strings | **100 / 122** |
| Identical **trees** after re-serializing cubing's own answer through this parser | **122 / 122** |
| Genuine disagreements | **0** |

Every one of the 22 string differences is the documented `r` → `Rw`
respelling; feeding cubing's output back through this serializer makes all 122
match exactly.

On constructs the corpus does not contain, the two agree on moves, wide moves,
slices, rotations, commutators, conjugates, nesting and pauses. They differ in
**how they represent an inverted group**, and the difference is representational
rather than semantic:

```
(R U)2   ours: (U' R')2      cubing: (R U)2'
(R U)'   ours: (U' R')'      cubing: (R U)
```

`(A)ⁿ'` means `(A)⁻ⁿ`, and `(A)⁻ⁿ = (A⁻¹)ⁿ`, so the two denote the same
algorithm. This module inverts the body; cubing negates the repetition. Both
are involutions. Ours was chosen because it does not require the reader to
reason about a negative exponent — at the cost of `(R U)'` inverting to
`(U' R')'` where cubing prints the tidier `(R U)`. Recorded here because it is
consumer-visible.

### Properties asserted

- `serialize(parse(s))` is idempotent, over the whole corpus.
- `invert(invert(a))` is structurally equal to `a`, over the whole corpus and
  over every construct.
- Inverting a generated scramble for every cube event produces a string that
  parses, and inverting twice returns the original exactly.
- 30 malformed inputs each throw `AlgorithmSyntaxError` **with the offending
  offset**, checked individually rather than as a batch.

---

## 7. Complexity

Linear in the input. One pass to tokenize, one recursive descent over the
tokens, no backtracking anywhere. No tables, no caches, no lazy initialization —
this is the one subsystem in the package with no cold start at all.

The bundle cost is measured rather than assumed, because the package has a
single entry point and therefore ships this to every consumer whether they
parse notation or not:

| | raw | gzip |
|---|---|---|
| `dist/index.js` before this layer was exported | 196,977 B | 42,654 B |
| after | 207,943 B | 45,397 B |
| **this layer** | **+10,966 B** | **+2,743 B** |

For comparison, `cubing/alg` as installed in the frontend is 54,467 B raw /
11,826 B gzip — so a consumer replacing it with this trades about 11.8 KB
gzipped for about 2.7 KB, in a package they were already installing.

---

## 8. Known limitations

Stated plainly, because most of them are choices rather than bugs.

1. **No `simplify()`, and no move cancellation.** `R R` is not equal to `R2`,
   `R R'` is not empty, and `R2` inverts to `R2'`. All three need a move order,
   which is a property of a puzzle. Adding one would mean a state model, which
   this package deliberately does not have at this layer.
2. **No expansion.** `(R U)2` holds two moves, not four; a commutator is not
   flattened into `A B A' B'`. `collectMoves` walks what is written, once. The
   inverter does not need expansion, and exporting one would invite the
   simplification requests above.
3. **No way to apply an algorithm to a puzzle.** Same refusal, more directly.
   The AST *can* represent a `FaceMove`, but no puzzle module was migrated onto
   it — the cube puzzles keep the narrow `notation/move.ts` type they were built
   and verified against.
4. **No move-count metrics** (OBTM, ETM, QTM). Small to add once this exists,
   wanted by nobody today.
5. **Comments are lost.** Accepted on input, absent from output. The only place
   this layer destroys information rather than respelling it.
6. **Lowercase spellings do not survive a round trip.** `r` comes back as `Rw`.
   Deliberate — one canonical spelling out — but it means this is not a
   formatter and should not be used as one.
7. **The five non-cube notations are out of scope, permanently.** See §2.
8. **Inverted groups differ in representation from `cubing/alg`.** Same
   algorithm, different string; see §6.

### Planned improvements

- Nothing scheduled. The items in 1–4 are refusals rather than a backlog, and
  each would need its own justification to become work.

---

## 9. References

- [WCA Regulations](https://www.worldcubeassociation.org/regulations/) —
  notation as used in official scrambles.
- [cubing.js `Alg`](https://js.cubing.net/cubing/alg/) — the implementation this
  layer replaces for two of the frontend's three call sites, and the one-off
  cross-check in §6.
- `docs/nxn-design.md` §2 — wide-move notation as the NxN module models it,
  which this grammar is a superset of.
- `docs/333-design.md` §2 — the narrow face-move notation `notation/move.ts`
  provides, which this does **not** replace.
