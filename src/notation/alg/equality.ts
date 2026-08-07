import type { Algorithm, AlgorithmNode } from './types';

/**
 * Structural equality over two parsed trees.
 *
 * This exists so the tests can compare **trees** rather than round-tripped
 * strings. A suite that only ever checks `serialize(parse(s)) === s` cannot
 * tell a parser bug from a serializer bug — the two can cancel out perfectly —
 * and until the serializer exists (task 04) there is nothing to round-trip
 * through at all.
 *
 * Equality is on what the notation *means structurally*, not on how it was
 * written: `r` and `Rw` parse to the same node and compare equal, because the
 * tokenizer resolves the spelling. It is not semantic equality — `R R` and
 * `R2` are different trees and compare unequal, which is correct for a layer
 * that deliberately knows nothing about the puzzle.
 */
export function algorithmsEqual(a: Algorithm, b: Algorithm): boolean {
  if (a.nodes.length !== b.nodes.length) return false;
  return a.nodes.every((node, i) => nodesEqual(node, b.nodes[i]!));
}

export function nodesEqual(a: AlgorithmNode, b: AlgorithmNode): boolean {
  if (a.type !== b.type) return false;

  switch (a.type) {
    case 'move': {
      const other = b as typeof a;
      return (
        a.family === other.family &&
        a.outerLayer === other.outerLayer &&
        a.innerLayer === other.innerLayer &&
        a.amount === other.amount
      );
    }
    case 'pause':
      return true;
    case 'group': {
      const other = b as typeof a;
      return a.amount === other.amount && algorithmsEqual(a.body, other.body);
    }
    case 'commutator':
    case 'conjugate': {
      const other = b as typeof a;
      return (
        a.amount === other.amount &&
        algorithmsEqual(a.a, other.a) &&
        algorithmsEqual(a.b, other.b)
      );
    }
  }
}

/** Every move in a tree, in written order, descending into groups and brackets. Test helper today; task 04's inverter will want it too. */
export function collectMoves(algorithm: Algorithm): AlgorithmNode[] {
  const moves: AlgorithmNode[] = [];
  const visit = (nodes: readonly AlgorithmNode[]): void => {
    for (const node of nodes) {
      switch (node.type) {
        case 'move':
          moves.push(node);
          break;
        case 'pause':
          break;
        case 'group':
          visit(node.body.nodes);
          break;
        case 'commutator':
        case 'conjugate':
          visit(node.a.nodes);
          visit(node.b.nodes);
          break;
      }
    }
  };
  visit(algorithm.nodes);
  return moves;
}
