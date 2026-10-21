/**
 * The order of a permutation group, exactly — test-only.
 *
 * Deterministic Schreier–Sims: a base and strong generating set built
 * incrementally, with every Schreier generator stripped through the chain
 * below it, so the product of the basic orbit lengths is the group's order and
 * not an estimate. Permutations are image arrays: `p[x]` is where `x` goes.
 *
 * This exists so that `state.test.ts` can *derive* how many states the move
 * tables reach, rather than assert the published figure and hope the tables
 * agree with it. It is small, slow-ish, and fine for degree 48.
 */

type Perm = readonly number[];

function compose(a: Perm, b: Perm): number[] {
  // (a ∘ b)[x] = a[b[x]] — apply b, then a.
  return b.map((x) => a[x]!);
}

function invert(p: Perm): number[] {
  const out = new Array<number>(p.length);
  p.forEach((image, x) => {
    out[image] = x;
  });
  return out;
}

function isIdentity(p: Perm): boolean {
  return p.every((image, x) => image === x);
}

interface Level {
  readonly base: number;
  readonly generators: Perm[];
  /** orbit point → a group element carrying `base` to it */
  readonly transversal: Map<number, Perm>;
}

export function groupOrder(generators: readonly Perm[]): bigint {
  const degree = generators[0]!.length;
  const id = Array.from({ length: degree }, (_, i) => i);
  const levels: Level[] = [];

  function strip(g: Perm, from: number): [Perm, number] {
    let h = g;
    for (let i = from; i < levels.length; i += 1) {
      const level = levels[i]!;
      const t = level.transversal.get(h[level.base]!);
      if (!t) return [h, i];
      h = compose(invert(t), h);
    }
    return [h, levels.length];
  }

  /**
   * `g` fixes the base points of levels `from..to-1` and moves the one at `to`
   * (or every point there is, if `to` is a new level). It belongs to the
   * stabiliser at every one of those levels, so it joins each of their
   * generating sets — deepest first, so that a level's Schreier generators are
   * stripped through a chain that already knows about `g`.
   */
  function addGenerator(g: Perm, from: number, to: number): void {
    if (to === levels.length) {
      const base = g.findIndex((image, x) => image !== x);
      levels.push({ base, generators: [], transversal: new Map([[base, id]]) });
    }
    for (let i = to; i >= from; i -= 1) addAt(g, i);
  }

  function addAt(g: Perm, i: number): void {
    const level = levels[i]!;
    level.generators.push(g);

    // Close the orbit. Old points need only the new generator; points found on
    // the way need every generator.
    const pending: [number, Perm][] = [];
    const queue: number[] = [];
    for (const [p] of level.transversal) queue.push(p);
    const oldPoints = new Set(queue);
    while (queue.length > 0) {
      const p = queue.shift()!;
      const tp = level.transversal.get(p)!;
      const gens = oldPoints.has(p) ? [g] : level.generators;
      for (const h of gens) {
        const q = h[p]!;
        if (!level.transversal.has(q)) {
          level.transversal.set(q, compose(h, tp));
          queue.push(q);
        }
        pending.push([p, h]);
      }
    }
    // Pairs (new point, any generator) were queued above; pairs (old point, new
    // generator) too. Every Schreier generator they give must lie in the next level.
    for (const [p, h] of pending) {
      const tp = level.transversal.get(p)!;
      const thp = level.transversal.get(h[p]!)!;
      const schreier = compose(invert(thp), compose(h, tp));
      const [residue, j] = strip(schreier, i + 1);
      if (!isIdentity(residue)) addGenerator(residue, i + 1, j);
    }
  }

  for (const g of generators) {
    const [residue, j] = strip(g, 0);
    if (!isIdentity(residue)) addGenerator(residue, 0, j);
  }

  return levels.reduce((order, level) => order * BigInt(level.transversal.size), 1n);
}
