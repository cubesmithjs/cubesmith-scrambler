import type { Projection } from './coordinates';

/**
 * Distance tables over a product of projections, built by breadth-first search
 * from every goal entry at once.
 *
 * Every table here is an exact distance over its own coordinate, which makes it
 * an *admissible* heuristic for the phase it serves: the coordinate is a
 * projection of the real state, so no real solution can be shorter than the
 * distance of its projection.
 *
 * The BFS is a **layer scan**: at depth `d`, every entry equal to `d` is
 * expanded. That costs a full pass over the table per depth, which is the right
 * trade at these sizes — a queue of 63.5 million `Uint32` indices would be a
 * 254 MB allocation to save a few hundred million byte comparisons.
 */

export const UNVISITED = 255;

/**
 * A table over `A × B`, indexed `a * B.size + b`. An entry is a goal when both
 * of its components are (`goalA[a] && goalB[b]`), which is the only shape of
 * goal the phases need: each is a conjunction of conditions on separate pieces.
 */
export function buildPairTable(
  a: Projection,
  b: Projection,
  goalA: Uint8Array,
  goalB: Uint8Array,
): Uint8Array {
  if (a.moves.length !== b.moves.length || a.moves.some((m, k) => m !== b.moves[k])) {
    throw new Error('fto-tables: the two projections were closed under different moves');
  }
  const sizeA = a.size;
  const sizeB = b.size;
  const moveCount = a.moves.length;
  const ta = a.transition;
  const tb = b.transition;
  const table = new Uint8Array(sizeA * sizeB).fill(UNVISITED);

  let frontier = 0;
  for (let i = 0; i < sizeA; i += 1) {
    if (!goalA[i]) continue;
    for (let j = 0; j < sizeB; j += 1) {
      if (!goalB[j]) continue;
      table[i * sizeB + j] = 0;
      frontier += 1;
    }
  }

  for (let depth = 0; frontier > 0; depth += 1) {
    frontier = 0;
    for (let i = 0; i < sizeA; i += 1) {
      const row = i * sizeB;
      for (let j = 0; j < sizeB; j += 1) {
        if (table[row + j] !== depth) continue;
        for (let k = 0; k < moveCount; k += 1) {
          const next = ta[k * sizeA + i]! * sizeB + tb[k * sizeB + j]!;
          if (table[next] === UNVISITED) {
            table[next] = depth + 1;
            frontier += 1;
          }
        }
      }
    }
  }
  return table;
}

/** The 2-bit value marking an entry no move sequence reaches, in a {@link buildMod3Table} table. */
export const UNVISITED_MOD3 = 3;

/** Entry `index` of a {@link buildMod3Table} table: its distance mod 3, or {@link UNVISITED_MOD3}. */
export function mod3At(table: Uint8Array, index: number): number {
  return (table[index >> 2]! >> ((index & 3) << 1)) & 3;
}

/**
 * A table over `A × B × E × C`, indexed `((a * |B| + b) * |E| + e) * |C| + c`,
 * from the single goal entry `(0, 0, 0, 0)` — the solved value of each
 * projection, which `buildProjection` always puts at index 0 — storing each
 * entry's distance **mod 3**, in two bits.
 *
 * Mod 3 loses nothing for a table read by *descent*. Neighbouring entries differ
 * in distance by at most one, so from an entry at `d` the three possibilities
 * `d − 1`, `d`, `d + 1` are three different residues, and "a neighbour one step
 * closer" is recognisable without knowing `d` itself. Walking that to the goal
 * (index 0, the only entry at distance 0) both solves and *measures* the state.
 * The table is the last phase's 63,504,000 entries, so this is 15.9 MB where a
 * byte per entry was 63.5 MB.
 *
 * Built breadth-first with the two frontiers as **bitsets** rather than by
 * scanning for "entries equal to `d`" — residues repeat every three layers, so a
 * scan could not tell this layer from the one three back. The bitsets cost
 * 7.9 MB each while building and are dropped after.
 */
export function buildMod3Table(
  a: Projection,
  b: Projection,
  e: Projection,
  c: Projection,
): Uint8Array {
  const [sa, sb, se, sc] = [a.size, b.size, e.size, c.size];
  const moveCount = a.moves.length;
  for (const p of [b, e, c]) {
    if (p.moves.length !== moveCount || p.moves.some((m, k) => m !== a.moves[k])) {
      throw new Error('fto-tables: the projections were closed under different moves');
    }
  }
  const [ta, tb, te, tc] = [a.transition, b.transition, e.transition, c.transition];
  const size = sa * sb * se * sc;
  const table = new Uint8Array(Math.ceil(size / 4)).fill(0xff);
  const words = Math.ceil(size / 32);
  let current = new Uint32Array(words);
  let next = new Uint32Array(words);

  // Distance 0 at index 0: clear its two bits (0xff & ~3).
  table[0] = 0xfc;
  current[0] = 1;

  for (let depth = 0, frontier = 1; frontier > 0; depth += 1) {
    frontier = 0;
    const residue = (depth + 1) % 3;
    for (let w = 0; w < words; w += 1) {
      let bits = current[w]!;
      while (bits !== 0) {
        const low = bits & -bits;
        const index = (w << 5) + (31 - Math.clz32(low));
        bits ^= low;

        const ic = index % sc;
        let rest = (index - ic) / sc;
        const ie = rest % se;
        rest = (rest - ie) / se;
        const ib = rest % sb;
        const ia = (rest - ib) / sb;

        for (let k = 0; k < moveCount; k += 1) {
          const n =
            ((ta[k * sa + ia]! * sb + tb[k * sb + ib]!) * se + te[k * se + ie]!) * sc +
            tc[k * sc + ic]!;
          const byte = n >> 2;
          const shift = (n & 3) << 1;
          if (((table[byte]! >> shift) & 3) === UNVISITED_MOD3) {
            table[byte] = (table[byte]! & ~(3 << shift)) | (residue << shift);
            next[n >> 5] = next[n >> 5]! | (1 << (n & 31));
            frontier += 1;
          }
        }
      }
    }
    [current, next] = [next, current];
    next.fill(0);
  }
  return table;
}
