import type { Algorithm, AlgorithmNode } from './types';

/**
 * The inverse of an algorithm: the sequence that undoes it.
 *
 * A list is reversed and each node inverted, which is the only part that is
 * obvious. The three compound nodes are each worth deriving rather than
 * pattern-matching, because two of them have a plausible wrong answer:
 *
 * **Group.** `(A)ⁿ` means `A` repeated `n` times, so its inverse is
 * `(A⁻¹)ⁿ` — the **body** is inverted and the count is left alone. The
 * tempting `(A)ⁿ'` is a different thing: it would negate the repetition as
 * well, inverting twice. This holds for a negative `n` too: `(A)'` is `A⁻¹`,
 * and inverting gives `(A')'` — body inverted, count still `-1` — which is
 * `A`, as it should be.
 *
 * **Commutator.** `[A, B]` is `A B A' B'`, so
 * `[A, B]⁻¹ = B A B' A' = [B, A]`. The halves swap.
 *
 * **Conjugate.** `[A: B]` is `A B A'`, so
 * `[A: B]⁻¹ = A B' A' = [A: B']`. Only the second half is inverted, and the
 * halves do **not** swap — the mirror image of the commutator rule, and the
 * easiest of the three to get backwards.
 *
 * **Move.** The amount is negated. Note what this deliberately does *not* do:
 * `R2` inverts to `R2'` rather than to `R2`. The two are the same turn on a
 * cube only because a face has order 4, and this layer has no puzzle behind it
 * — see `docs/notation-design.md` §8. `cubing/alg` behaves the same way, which
 * was verified against it rather than assumed.
 *
 * **Pause.** Its own inverse.
 */
export function invertAlgorithm(algorithm: Algorithm): Algorithm {
  return { nodes: [...algorithm.nodes].reverse().map(invertNode) };
}

export function invertNode(node: AlgorithmNode): AlgorithmNode {
  switch (node.type) {
    case 'move':
      return { ...node, amount: -node.amount };
    case 'pause':
      return node;
    case 'group':
      return { ...node, body: invertAlgorithm(node.body) };
    case 'commutator':
      return { ...node, a: node.b, b: node.a };
    case 'conjugate':
      return { ...node, b: invertAlgorithm(node.b) };
  }
}
