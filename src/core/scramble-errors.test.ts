import { describe, expect, it } from 'vitest';
import { AlgorithmSyntaxError } from '../notation/alg/types';
import { ScrambleSyntaxError, SHARED_RESIDUAL_REASON } from './scramble-errors';

describe('ScrambleSyntaxError', () => {
  it('keeps every field it was constructed with', () => {
    const error = new ScrambleSyntaxError('megaminx', 'R+++ U', 0, '"R+++" is not a direction', {
      reason: 'megaminx-bad-direction',
      length: 4,
      token: 'R+++',
    });

    expect(error.notation).toBe('megaminx');
    expect(error.input).toBe('R+++ U');
    expect(error.offset).toBe(0);
    expect(error.reason).toBe('megaminx-bad-direction');
    expect(error.length).toBe(4);
    expect(error.token).toBe('R+++');
    expect(error.name).toBe('ScrambleSyntaxError');
    expect(error).toBeInstanceOf(Error);
  });

  /**
   * The prefix these five parsers printed before they carried any structure,
   * pinned so an upgrade does not silently break a consumer or a test that
   * matches on it.
   */
  it('writes an English message carrying the notation, the offset and the input', () => {
    const error = new ScrambleSyntaxError('clock', 'ALL1+ U', 6, '"U" can only close a scramble', {
      reason: 'clock-pin-not-a-corner',
      length: 1,
      token: 'U',
      pins: 'U',
    });

    expect(error.message).toBe(
      'clock-notation: "U" can only close a scramble at offset 6 in "ALL1+ U"',
    );
  });

  /**
   * `exactOptionalPropertyTypes` makes an absent property a different type from
   * a present-but-`undefined` one, which is why the constructor assigns the
   * optional fields one at a time instead of spreading `detail` — a spread
   * would not type-check.
   *
   * At **runtime** the distinction does not survive: the class declares the
   * fields, and under `target: ES2022` a declared field is defined as
   * `undefined` whether or not the constructor writes to it. That is exactly
   * what `AlgorithmSyntaxError` does too, and the sameness is the point — a
   * consumer reading `.char` on either class gets `undefined` when the code
   * does not carry one, and never a missing-property surprise on one and not
   * the other.
   */
  it('reports undefined for a payload field the code does not carry, exactly as the cube class does', () => {
    const error = new ScrambleSyntaxError('square1', '(1, 0) x', 7, 'unexpected "x"', {
      reason: 'square1-stray-character',
      length: 1,
      char: 'x',
    });

    expect(error.char).toBe('x');
    expect(error.token).toBeUndefined();
    expect(error.pins).toBeUndefined();
    expect(error.hours).toBeUndefined();

    const cube = new AlgorithmSyntaxError('Q', 0, 'nope', { reason: 'not-a-move', length: 1 });
    expect('family' in cube).toBe('pins' in error);
  });

  it('reports the documented residual, not a precision it does not have, when built without a detail', () => {
    const error = new ScrambleSyntaxError('skewb', 'Z', 0, 'unclassified');
    expect(error.reason).toBe(SHARED_RESIDUAL_REASON);
    expect(error.reason).toBe('unexpected-token');
    // `0` is the documented "text is missing rather than wrong" span, which is
    // also the honest default for an error that could not say what it covers.
    expect(error.length).toBe(0);
  });

  /**
   * 🔴 The whole point of D4-ii, asserted in **both** directions.
   *
   * If a later "tidy the class hierarchy" refactor made one a subclass of the
   * other, an existing consumer's `catch (e) { if (e instanceof
   * AlgorithmSyntaxError) translate(e.reason) }` would start receiving Clock
   * and Square-1 codes its exhaustive table has never heard of, and fall
   * through it silently. The two grammars stay distinguishable by construction.
   */
  it('is not an AlgorithmSyntaxError, and an AlgorithmSyntaxError is not one of these', () => {
    const scramble = new ScrambleSyntaxError('pyraminx', 'Z', 0, 'nope', {
      reason: 'pyraminx-not-a-vertex',
      length: 1,
      char: 'Z',
    });
    const algorithm = new AlgorithmSyntaxError('Q', 0, 'nope', { reason: 'not-a-move', length: 1 });

    expect(scramble).not.toBeInstanceOf(AlgorithmSyntaxError);
    expect(algorithm).not.toBeInstanceOf(ScrambleSyntaxError);
    // Both are still plain `Error`s, so a `catch` that does not classify at all
    // keeps working for either.
    expect(scramble).toBeInstanceOf(Error);
    expect(algorithm).toBeInstanceOf(Error);
    expect(scramble.name).not.toBe(algorithm.name);
  });

  it('carries the Clock-specific payload fields', () => {
    const error = new ScrambleSyntaxError('clock', 'UR9+', 0, 'out of range', {
      reason: 'clock-hour-out-of-range',
      length: 4,
      token: 'UR9+',
      pins: 'UR',
      hours: 9,
    });
    expect(error.pins).toBe('UR');
    expect(error.hours).toBe(9);
  });
});
