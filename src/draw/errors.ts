import type { WcaEventId } from '../core/types';

/**
 * Thrown by `drawScramble` for an event that has no drawer.
 *
 * 🔴 Deliberately **not** `UnimplementedEventError`, which means "no scrambler".
 * Two different absences: an event can be scrambled and not drawable, and (in
 * principle) drawable and not scrambled. Collapsing them would leave a consumer
 * unable to tell "I cannot picture this" from "I cannot generate this", which are
 * different things to tell a user.
 */
export class UnimplementedDrawingError extends Error {
  readonly event: WcaEventId;

  constructor(event: WcaEventId) {
    super(`@cubesmith/scrambler: no drawing is implemented for event "${event}" yet`);
    this.name = 'UnimplementedDrawingError';
    this.event = event;
  }
}

/**
 * Thrown when a scramble is *valid notation* that a drawing cannot apply.
 *
 * Not a syntax error and not reported as one: `parseAlgorithm` accepted the text,
 * so calling it malformed would send a consumer looking for a typo that is not
 * there. What it means is narrower and worth saying plainly — this is a **scramble**
 * drawer, and cube notation is larger than the set of things a scramble contains.
 *
 * The three constructs it refuses on the cube net, and why:
 *
 * | Construct | Example | Why |
 * |---|---|---|
 * | slice move | `M`, `E2`, `S'` | not an outer block, so `nxn`'s move model has no permutation for it, and on a 5x5x5 "the middle layer" is not even well defined |
 * | layer range | `2-3Rw` | an inner block, same reason |
 * | grouping | `(R U)2`, `[R, U]`, `[R: U]` | an algorithm-writing convenience; no WCA scramble contains one |
 *
 * A pause (`.`) is **not** here: it carries no turn, so a drawing skips it.
 */
export class UnsupportedScrambleError extends Error {
  readonly event: WcaEventId;
  /** A stable code for the construct, so a consumer's message need not parse prose. */
  readonly construct: 'slice-move' | 'layer-range' | 'grouping';

  constructor(
    event: WcaEventId,
    construct: 'slice-move' | 'layer-range' | 'grouping',
    detail: string,
  ) {
    super(
      `@cubesmith/scrambler: a "${event}" drawing cannot apply ${detail} — ` +
        'valid notation, but not something a WCA scramble contains',
    );
    this.name = 'UnsupportedScrambleError';
    this.event = event;
    this.construct = construct;
  }
}

/**
 * Thrown when a caller-supplied colour is not a colour string this package is
 * willing to write into markup.
 *
 * 🔴 The reason it is validated at all rather than interpolated: `scrambleImageToSvg`
 * writes inline markup into a consumer's page, and a `fill` attribute is a place
 * a `"` closes early. Every *other* value the serializer writes is a number or a
 * colour this package produced itself; a caller's override is the one untrusted
 * input in the whole drawing layer, so it is checked at the door rather than
 * escaped at the exit.
 */
export class InvalidColorError extends Error {
  readonly key: string;
  readonly value: string;

  constructor(key: string, value: string) {
    super(
      `@cubesmith/scrambler: "${value}" is not a usable colour for "${key}" — ` +
        'expected #rgb, #rrggbb, #rgba, #rrggbbaa, a CSS named colour, or "none"',
    );
    this.name = 'InvalidColorError';
    this.key = key;
    this.value = value;
  }
}
