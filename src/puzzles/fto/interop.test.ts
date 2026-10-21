import { describe, expect, it } from 'vitest';
import { validateScramble } from '../../core/validate-scramble';
import { createRandomSource } from '../../random/random-source';
import { randomInt } from '../../utils/random-int';
import {
  CUBINGJS_FTO_SCRAMBLES,
  CUBINGJS_FTO_TURNS,
  CUBINGJS_VERSION,
  ORIENTATIONS,
} from './__tests__/cubingjs-reference';
import { deriveTurnTableFto } from './geometry';
import { allMovesFto, FTO_FACES, ftoMoveToString, parseFtoScramble } from './notation';

/**
 * 🔴 **This package's FTO against cubing.js's**, the model a consumer is most
 * likely to display a scramble with. The reference tables are frozen in
 * `__tests__/cubingjs-reference.ts` (see there for provenance), so this runs on
 * every CI build with no dependency on cubing.js.
 *
 * The claim is the strongest one available between two models that number their
 * pieces differently: **there is exactly one way to match our slots to theirs so
 * that every one of the eight named turns is the same permutation** — and with
 * every turn taken as the other model's *prime*, there is none. Group orders of
 * random words then cover what a permutation match cannot see: corner twist.
 *
 * Measured once outside the suite (2026-10-21, cubing 0.63.3), and recorded in
 * `fto-design.md` §6 rather than re-run here: 30 of this package's scrambles,
 * followed by this package's own solutions, leave cubing.js's puzzle solved; 40
 * of cubing.js's own scrambles are solved by this package's solver, as cubing.js
 * confirms.
 */

const FACES = FTO_FACES;
type Orbit = 'corners' | 'edges' | 'centres';

/** Ours, per face: where the piece in each slot goes. Centres: orbit A then B, as 24 slots. */
function ourDestinations(orbit: Orbit): number[][] {
  return FACES.map((face) => {
    const t = deriveTurnTableFto(face);
    if (orbit === 'corners') return [...t.cornerDestination];
    if (orbit === 'edges') return [...t.edgeDestination];
    return [...t.centreADestination, ...t.centreBDestination.map((d) => d + 12)];
  });
}

/** Theirs, per face, converted from "which slot's piece arrives here" to destinations. */
function theirDestinations(orbit: Orbit): number[][] {
  return FACES.map((face) => {
    const perm = CUBINGJS_FTO_TURNS[face]![orbit].permutation;
    const dest = new Array<number>(perm.length);
    perm.forEach((from, to) => {
      dest[from] = to;
    });
    return dest;
  });
}

/**
 * Every bijection `f` from our slots to theirs with `f(g(i)) = h(f(i))` for every
 * generator. Seeded one orbit of *our* action at a time and propagated through
 * the generators, so the search is over seeds, not over all bijections.
 */
function correspondences(g: number[][], h: number[][], seeds: readonly number[]): number[][] {
  const n = g[0]!.length;
  const found: number[][] = [];
  const extend = (f: (number | undefined)[], next: number): void => {
    if (next === seeds.length) {
      found.push(f as number[]);
      return;
    }
    for (let j = 0; j < n; j += 1) {
      if (f.includes(j)) continue;
      const trial = [...f];
      trial[seeds[next]!] = j;
      const queue = [seeds[next]!];
      let ok = true;
      while (queue.length > 0 && ok) {
        const i = queue.shift()!;
        for (let k = 0; k < g.length && ok; k += 1) {
          const image = g[k]![i]!;
          const want = h[k]![trial[i]!]!;
          if (trial[image] === undefined) {
            if (trial.includes(want)) ok = false;
            else {
              trial[image] = want;
              queue.push(image);
            }
          } else if (trial[image] !== want) ok = false;
        }
      }
      if (ok) extend(trial, next + 1);
    }
  };
  extend([], 0);
  return found;
}

const primeOf = (table: number[][]): number[][] => table.map((d) => d.map((x) => d[x]!));

describe(`against cubing.js ${CUBINGJS_VERSION}'s FTO`, () => {
  it.each([
    ['corners', [0]],
    ['edges', [0]],
    ['centres', [0, 12]], // our two centre orbits, seeded separately
  ] as const)('matches all eight named turns on the %s through exactly one correspondence', (orbit, seeds) => {
    const found = correspondences(ourDestinations(orbit), theirDestinations(orbit), seeds);
    expect(found).toHaveLength(1);
    expect(new Set(found[0]).size).toBe(found[0]!.length); // a bijection
  });

  it('matches none of them if every turn is taken as the other model’s prime — so direction is pinned too', () => {
    for (const [orbit, seeds] of [['corners', [0]], ['edges', [0]], ['centres', [0, 12]]] as const) {
      expect(correspondences(primeOf(ourDestinations(orbit)), theirDestinations(orbit), seeds), orbit).toHaveLength(0);
    }
  });

  /**
   * A permutation match cannot see corner twist, so compare a quantity twist
   * changes: the order of the group element a word makes. Both sides are reduced
   * to permutations of (slot, orientation) points — ours 6 × 2 + 12 + 24, theirs
   * 6 × 4 + 12 × 2 + 24 — and the orders must agree for every word.
   */
  it('gives every one of 600 random words the same group order, corner twist included', () => {
    const ourPoints = (face: string): number[] => {
      const t = deriveTurnTableFto(face as (typeof FACES)[number]);
      const p: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        for (let o = 0; o < 2; o += 1) p[2 * i + o] = 2 * t.cornerDestination[i]! + (o ^ t.cornerTwist[i]!);
      }
      t.edgeDestination.forEach((d, i) => (p[12 + i] = 12 + d));
      t.centreADestination.forEach((d, i) => (p[24 + i] = 24 + d));
      t.centreBDestination.forEach((d, i) => (p[36 + i] = 36 + d));
      return p;
    };
    const theirPoints = (face: string): number[] => {
      const turn = CUBINGJS_FTO_TURNS[face]!;
      const p: number[] = [];
      let base = 0;
      for (const orbit of ['corners', 'edges', 'centres'] as const) {
        const n = ORIENTATIONS[orbit];
        const { permutation } = turn[orbit];
        const delta = orbit === 'centres' ? permutation.map(() => 0) : turn[orbit].orientationDelta;
        permutation.forEach((from, to) => {
          for (let o = 0; o < n; o += 1) p[base + from * n + o] = base + to * n + ((o + delta[to]!) % n);
        });
        base += permutation.length * n;
      }
      return p;
    };
    const order = (perm: readonly number[]): number => {
      const seen = new Array<boolean>(perm.length).fill(false);
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
      let lcm = 1;
      for (let i = 0; i < perm.length; i += 1) {
        let length = 0;
        for (let j = i; !seen[j]; j = perm[j]!) {
          seen[j] = true;
          length += 1;
        }
        if (length > 0) lcm = (lcm * length) / gcd(lcm, length);
      }
      return lcm;
    };
    const wordOrder = (word: readonly string[], points: (face: string) => number[]): number => {
      let acc = points('U').map((_, i) => i);
      for (const token of word) {
        const once = points(token.replace("'", ''));
        const turn = token.endsWith("'") ? once.map((x) => once[x]!) : once;
        acc = acc.map((x) => turn[x]!);
      }
      return order(acc);
    };

    const moves = allMovesFto().map(ftoMoveToString);
    const random = createRandomSource('fto-cubingjs-orders');
    for (let w = 0; w < 600; w += 1) {
      const word = Array.from({ length: 1 + randomInt(random, 25) }, () => moves[randomInt(random, 16)]!);
      expect(wordOrder(word, ourPoints), word.join(' ')).toBe(wordOrder(word, theirPoints));
    }
  });

  it('reads every cubing.js scramble as valid FTO notation, in exactly our sixteen tokens', () => {
    const ours = new Set(allMovesFto().map(ftoMoveToString));
    for (const scramble of CUBINGJS_FTO_SCRAMBLES) {
      expect(validateScramble('fto', scramble), scramble).toEqual({ valid: true, notation: 'fto' });
      for (const token of scramble.split(' ')) expect(ours.has(token), token).toBe(true);
      expect(parseFtoScramble(scramble).length).toBe(scramble.split(' ').length);
    }
  });
});
