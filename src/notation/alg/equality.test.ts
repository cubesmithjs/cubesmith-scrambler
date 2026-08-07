import { describe, expect, it } from 'vitest';
import { algorithmsEqual, collectMoves, nodesEqual } from './equality';
import { parseAlgorithm } from './parse';
import type { MoveNode } from './types';

const parse = parseAlgorithm;

describe('algorithmsEqual', () => {
  it('compares trees, not strings — so spelling does not matter but structure does', () => {
    expect(algorithmsEqual(parse('r U'), parse('Rw U'))).toBe(true);
    expect(algorithmsEqual(parse('R  U'), parse('R U'))).toBe(true);
    expect(algorithmsEqual(parse('R U // note\n'), parse('R U'))).toBe(true);
  });

  it('is not semantic equality, and is not trying to be', () => {
    // `R R` and `R2` do the same thing to a cube. Saying so needs a puzzle
    // model, which this layer deliberately does not have — so they are
    // different trees and compare unequal. Anything else would be a promise
    // this module cannot keep.
    expect(algorithmsEqual(parse('R R'), parse('R2'))).toBe(false);
    expect(algorithmsEqual(parse("R R'"), parse(''))).toBe(false);
    expect(algorithmsEqual(parse('(R)'), parse('R'))).toBe(false);
  });

  it('separates length, order and amount', () => {
    expect(algorithmsEqual(parse('R U'), parse('R U F'))).toBe(false);
    expect(algorithmsEqual(parse('R U'), parse('U R'))).toBe(false);
    expect(algorithmsEqual(parse('R'), parse("R'"))).toBe(false);
    expect(algorithmsEqual(parse('R'), parse('L'))).toBe(false);
  });

  it('separates the layers, including outer from inner', () => {
    expect(algorithmsEqual(parse('Rw'), parse('3Rw'))).toBe(false);
    expect(algorithmsEqual(parse('3Rw'), parse('2-3Rw'))).toBe(false);
    expect(algorithmsEqual(parse('R'), parse('Rw'))).toBe(false);
  });

  it('separates a commutator from a conjugate written with the same halves', () => {
    expect(algorithmsEqual(parse('[R, U]'), parse('[R: U]'))).toBe(false);
    expect(algorithmsEqual(parse('[R, U]'), parse('[R, U]'))).toBe(true);
    expect(algorithmsEqual(parse('[R, U]'), parse('[R, U]2'))).toBe(false);
    expect(algorithmsEqual(parse('[R, U]'), parse('[U, R]'))).toBe(false);
  });

  it('recurses into groups and brackets', () => {
    expect(algorithmsEqual(parse("[R: (U r U')2]"), parse("[R: (U Rw U')2]"))).toBe(true);
    expect(algorithmsEqual(parse("[R: (U r U')2]"), parse("[R: (U Rw U')3]"))).toBe(false);
    expect(algorithmsEqual(parse('(R U)2'), parse("(R U)2'"))).toBe(false);
  });

  it('compares pauses', () => {
    expect(algorithmsEqual(parse('R . U'), parse('R . U'))).toBe(true);
    expect(algorithmsEqual(parse('R . U'), parse('R U'))).toBe(false);
  });
});

describe('nodesEqual', () => {
  it('rejects two different node types outright', () => {
    const move = parse('R').nodes[0]!;
    const group = parse('(R)').nodes[0]!;
    expect(nodesEqual(move, group)).toBe(false);
  });
});

describe('collectMoves', () => {
  it('flattens in written order, descending into every construct', () => {
    const moves = collectMoves(parse("[R: (U D)2] F . [M, E]")) as MoveNode[];
    expect(moves.map((m) => m.family)).toEqual(['R', 'U', 'D', 'F', 'M', 'E']);
  });

  it('does not expand repetitions — it collects what is written, once', () => {
    // Expanding would need the semantics this layer refuses to have. `(R U)2`
    // holds two moves, not four.
    expect(collectMoves(parse('(R U)2'))).toHaveLength(2);
  });

  it('is empty for an empty algorithm and for a lone pause', () => {
    expect(collectMoves(parse(''))).toEqual([]);
    expect(collectMoves(parse('.'))).toEqual([]);
  });
});
