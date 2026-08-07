import type { Algorithm, AlgorithmNode, MoveNode } from './types';

/**
 * Tree → string.
 *
 * ## The normalizations, which are behaviour rather than formatting
 *
 * A serializer that quietly rewrites its input is a source of consumer
 * surprise, so every rewrite this one performs is listed here and tested.
 * `serialize(parse(s))` returns `s` exactly **unless** `s` used one of the
 * spellings below, in which case it returns the canonical one.
 *
 * | Written | Re-emitted | Why |
 * |---|---|---|
 * | `r`, `l'`, `r2` | `Rw`, `Lw'`, `Rw2` | The lowercase form is resolved at parse time, so the tree does not remember which spelling was used. One spelling out. |
 * | `2Rw` | `Rw` | Same block, and `Rw` is what official scrambles print — matching `nxn/notation.ts`, which accepts `2Rw` on input and never emits it. |
 * | `R1` | `R` | An amount of 1 is the absence of a suffix everywhere in WCA notation. |
 * | `(R U)1` | `(R U)` | Same rule, applied to a repetition. |
 * | `R  U`, `R\nU` | `R U` | Nodes are joined with single spaces; a multi-line algorithm comes back on one line. |
 * | `R U // note` | `R U` | Comments are discarded at parse time. **The one lossy case**, and the only one where information is destroyed rather than respelled. |
 *
 * Everything else round-trips character for character, including `R3`, `R2'`,
 * `2-3Rw`, pauses, and the distinction between `[A, B]` and `[A: B]`.
 *
 * Serialization is idempotent: `serialize(parse(serialize(parse(s))))` equals
 * `serialize(parse(s))` for every input, which is the property that makes the
 * table above a complete list rather than a hopeful one.
 */
export function serializeAlgorithm(algorithm: Algorithm): string {
  return algorithm.nodes.map(serializeNode).join(' ');
}

export function serializeNode(node: AlgorithmNode): string {
  switch (node.type) {
    case 'move':
      return serializeMove(node);
    case 'pause':
      return '.';
    case 'group':
      return `(${serializeAlgorithm(node.body)})${serializeAmount(node.amount)}`;
    case 'commutator':
      return `[${serializeAlgorithm(node.a)}, ${serializeAlgorithm(node.b)}]${serializeAmount(node.amount)}`;
    case 'conjugate':
      return `[${serializeAlgorithm(node.a)}: ${serializeAlgorithm(node.b)}]${serializeAmount(node.amount)}`;
  }
}

function serializeMove(move: MoveNode): string {
  const prefix =
    move.outerLayer !== null
      ? `${move.outerLayer}-${move.innerLayer}`
      : move.innerLayer !== null && move.innerLayer > 2
        ? String(move.innerLayer)
        : '';
  const wide = move.innerLayer !== null ? 'w' : '';
  return `${prefix}${move.family}${wide}${serializeAmount(move.amount)}`;
}

/** `1` is bare, `-1` is `'`, `n` is `n`, `-n` is `n'`. Never emits `1` or a bare `-`. */
function serializeAmount(amount: number): string {
  const magnitude = Math.abs(amount);
  const digits = magnitude === 1 ? '' : String(magnitude);
  return amount < 0 ? `${digits}'` : digits;
}
