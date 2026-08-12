import { describe, expect, it } from 'vitest';
// Imported for its registration side effects as much as for the functions: the
// registry is populated by the package entry point, not by the core module.
import { generateScramble, validateScramble } from '../index';
import { AlgorithmSyntaxError } from '../notation/alg/types';
import { BESPOKE_NOTATION_BY_EVENT, NON_CUBE_EVENTS, notationForEvent } from './event-notation';
import { ScrambleSyntaxError, type Notation } from './scramble-errors';
import { implementedEvents } from './scrambler-registry';
import type { WcaEventId } from './types';

/**
 * The event-keyed door onto six grammars.
 *
 * Every generated scramble in this file lives here rather than in the five
 * notation test files for the reason `corpus.test.ts` gives: generating a
 * `333` builds the pruning tables, Vitest isolates by file, and paying that
 * more than once is minutes rather than seconds under `--coverage`.
 */

describe('notationForEvent', () => {
  /**
   * The dispatch is total over the registry, and its shape is asserted rather
   * than assumed: an eighteenth event added tomorrow would default to `'cube'`
   * and silently pass a "every event maps to something" check, so the counts
   * are pinned instead. A new event fails here and has to be classified
   * deliberately.
   */
  it('maps every registered event onto one of the six notations, twelve of them cube', () => {
    const byNotation = new Map<Notation, WcaEventId[]>();
    for (const event of implementedEvents()) {
      const notation = notationForEvent(event);
      byNotation.set(notation, [...(byNotation.get(notation) ?? []), event]);
    }

    expect([...implementedEvents()]).toHaveLength(17);
    expect(byNotation.get('cube')).toHaveLength(12);
    expect(byNotation.get('megaminx')).toEqual(['minx']);
    expect(byNotation.get('clock')).toEqual(['clock']);
    expect(byNotation.get('pyraminx')).toEqual(['pyram']);
    expect(byNotation.get('skewb')).toEqual(['skewb']);
    expect(byNotation.get('square1')).toEqual(['sq1']);
    expect([...byNotation.keys()].sort()).toEqual([
      'clock',
      'cube',
      'megaminx',
      'pyraminx',
      'skewb',
      'square1',
    ]);
  });

  /** The set `corpus.test.ts` derives its cube-event list from, so it cannot drift. */
  it('derives the non-cube event set from the notation map rather than a second literal', () => {
    expect([...NON_CUBE_EVENTS].sort()).toEqual(Object.keys(BESPOKE_NOTATION_BY_EVENT).sort());
    expect([...NON_CUBE_EVENTS].sort()).toEqual(['clock', 'minx', 'pyram', 'skewb', 'sq1']);
    for (const event of NON_CUBE_EVENTS) {
      expect(notationForEvent(event as WcaEventId), event).not.toBe('cube');
    }
  });

  /**
   * A parser needs no scrambler, so an event with none validates anyway rather
   * than throwing `UnimplementedEventError`. Currently unreachable — all
   * seventeen are implemented — and documented so it is not discovered.
   */
  it('answers cube for an event it has never heard of, rather than refusing', () => {
    expect(notationForEvent('888' as WcaEventId)).toBe('cube');
    expect(validateScramble('888' as WcaEventId, "R U R'")).toEqual({
      valid: true,
      notation: 'cube',
    });
  });
});

describe('validateScramble', () => {
  /**
   * The acceptance test for the whole plan: a scramble this package generated,
   * for **every** event, read back by the public validator.
   *
   * The event list is derived from the registry rather than written out, so an
   * eighteenth event has to be generated and validated here too rather than
   * silently skipped.
   *
   * One file, seventeen tests. The file is what shares the warm pruning tables
   * — Vitest isolates by file, and building the 3x3x3 tables a second time
   * costs a minute under `--coverage`. The split into separate `it`s is about
   * the *timeout*, which is per test: as a single loop this measured ~144 s
   * instrumented, against a 180 s limit, and would have failed the first time
   * anything got slower.
   */
  it.each([...implementedEvents()])(
    'validates a generated %s scramble through the public entry point',
    async (event) => {
      const result = await generateScramble(event, { seed: `validate-${event}` });
      const validation = validateScramble(event, result.moves);
      expect(validation, `${event}: ${result.moves}`).toEqual({
        valid: true,
        notation: notationForEvent(event),
      });
    },
  );

  it('agrees with validateAlgorithm that empty input is valid, for every notation', () => {
    for (const event of implementedEvents()) {
      expect(validateScramble(event, ''), event).toEqual({
        valid: true,
        notation: notationForEvent(event),
      });
      expect(validateScramble(event, '   '), event).toEqual({
        valid: true,
        notation: notationForEvent(event),
      });
    }
  });

  it('routes each bespoke event to its own grammar, and rejects another event scramble', () => {
    expect(validateScramble('minx', 'R++ D-- U').valid).toBe(true);
    expect(validateScramble('pyram', "U' R u l'").valid).toBe(true);
    expect(validateScramble('skewb', "U L U B' R").valid).toBe(true);
    expect(validateScramble('clock', 'UR4+ DR3+ y2 ALL2- DL').valid).toBe(true);
    expect(validateScramble('sq1', '(6, 2) / (-2, 4) /').valid).toBe(true);
    expect(validateScramble('333', "R U R' U'").valid).toBe(true);

    // Each grammar refuses the others rather than mis-reading them.
    expect(validateScramble('minx', '(6, 2) /').valid).toBe(false);
    expect(validateScramble('sq1', 'R++ D--').valid).toBe(false);
    expect(validateScramble('333', 'R++ D--').valid).toBe(false);
    expect(validateScramble('clock', "R U R'").valid).toBe(false);
  });

  /**
   * 🔴 Both Square-1 comma spellings validate, and both are pinned as
   * deliberate. 0.13.0 changed what the package *emits* to TNoodle's `(a,b)`; it
   * deliberately did **not** narrow what it accepts, because a scramble already
   * stored in a consumer's database was written `(a, b)` and must not stop
   * validating because a serializer changed.
   */
  it('accepts a Square-1 scramble in either comma spelling', () => {
    expect(validateScramble('sq1', '(-3,-4) / (6,3) / (-5,-2) / (-1,-1)').valid).toBe(true);
    expect(validateScramble('sq1', '(-3, -4) / (6, 3) / (-5, -2) / (-1, -1)').valid).toBe(true);
    // Mixed, because a human pasting two scrambles together produces exactly this.
    expect(validateScramble('sq1', '(-3,-4) / (6, 3) /').valid).toBe(true);
  });

  /**
   * 🔴 The two error classes stay apart, which is the point of shipping a
   * second one. A cube failure carries `AlgorithmSyntaxError` and a
   * `SyntaxErrorReason`; a bespoke failure carries `ScrambleSyntaxError` and a
   * `ScrambleErrorReason`; neither is an instance of the other.
   */
  it('hands back the cube error class on the cube arm and the scramble one elsewhere', () => {
    const cube = validateScramble('333', 'R U Q');
    expect(cube.valid).toBe(false);
    if (!cube.valid && cube.notation === 'cube') {
      expect(cube.error).toBeInstanceOf(AlgorithmSyntaxError);
      expect(cube.error).not.toBeInstanceOf(ScrambleSyntaxError);
      expect(cube.error.reason).toBe('not-a-move');
      expect(cube.error.offset).toBe(4);
    } else {
      expect.fail('expected a cube-notation failure');
    }

    const minx = validateScramble('minx', 'R++ X++');
    expect(minx.valid).toBe(false);
    if (!minx.valid && minx.notation !== 'cube') {
      expect(minx.error).toBeInstanceOf(ScrambleSyntaxError);
      expect(minx.error).not.toBeInstanceOf(AlgorithmSyntaxError);
      expect(minx.error.reason).toBe('megaminx-not-a-move');
      expect(minx.error.offset).toBe(4);
      expect(minx.error.length).toBe(3);
      expect(minx.error.notation).toBe('megaminx');
    } else {
      expect.fail('expected a Megaminx failure');
    }
  });

  it('carries the offset and span for each of the five bespoke notations', () => {
    const cases = [
      { event: 'minx', text: 'R++ R+++', reason: 'megaminx-bad-direction', offset: 4, length: 4 },
      { event: 'pyram', text: 'U Z', reason: 'pyraminx-not-a-vertex', offset: 2, length: 1 },
      { event: 'skewb', text: 'U R2', reason: 'skewb-bad-amount', offset: 2, length: 2 },
      { event: 'clock', text: 'UR4+ UR9+', reason: 'clock-hour-out-of-range', offset: 5, length: 4 },
      { event: 'sq1', text: '(1, 0) / (0, 0)', reason: 'square1-zero-turn', offset: 9, length: 6 },
    ] as const;

    for (const { event, text, reason, offset, length } of cases) {
      const result = validateScramble(event, text);
      expect(result.valid, text).toBe(false);
      if (result.valid || result.notation === 'cube') {
        expect.fail(`expected ${event} to fail with a bespoke error`);
      }
      expect(result.error.reason, text).toBe(reason);
      expect(result.error.offset, text).toBe(offset);
      expect(result.error.length, text).toBe(length);
      expect(result.error.input, text).toBe(text);
    }
  });

  /**
   * 🔴 A bug in this package must not be reported to a user as their typo.
   * `validateAlgorithm` re-throws anything that is not a syntax error, and this
   * has to agree — otherwise a `TypeError` from inside a parser becomes an
   * undebuggable `{ valid: false }`.
   */
  it('re-throws anything that is not a syntax error', () => {
    const exploding = {
      get length(): number {
        throw new TypeError('not a syntax error');
      },
    } as unknown as string;

    // Both tokenizers walk `input.length` first, so the throw happens inside
    // the parser rather than at the call boundary — which is the path that
    // matters, since that is where a real bug in this package would surface.
    expect(() => validateScramble('minx', exploding)).toThrow(TypeError);
    expect(() => validateScramble('333', exploding)).toThrow(TypeError);

    // Not `sq1`: its parser drives a `RegExp` over the input, which coerces
    // through `toString` rather than reading `.length`, so this particular
    // object reaches it as a string and is rejected as notation. The re-throw
    // is one `catch` shared by all six arms, and the two above exercise it.
  });
});
