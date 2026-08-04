/**
 * The only source of randomness every puzzle scrambler is allowed to touch
 * directly — never `Math.random()` inline, so a seed always makes generation
 * fully reproducible. A minimal surface (one method) keeps it trivial to
 * mock in tests and to implement for either the seeded or unseeded path.
 */
export interface RandomSource {
  /** A uniformly random unsigned 32-bit integer, `[0, 2^32)`. */
  nextUint32(): number;
}

/**
 * mulberry32 — a tiny, public-domain-style 32-bit PRNG (Tommy Ettinger).
 * Not cryptographically secure and not intended to be; it exists purely so
 * a given seed always reproduces the exact same scramble, which is the
 * entire point of accepting a seed at all.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** FNV-1a 32-bit — deterministically folds an arbitrary string seed into the integer mulberry32 needs. */
function hashStringToUint32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seedToUint32(seed: string | number): number {
  if (typeof seed === 'string') return hashStringToUint32(seed);
  return Math.floor(seed) >>> 0;
}

function createSeededSource(seed: string | number): RandomSource {
  const next = mulberry32(seedToUint32(seed));
  return { nextUint32: next };
}

/** The one method needed from the Web Crypto API — declared locally so this package never needs the DOM `lib`. */
interface MinimalCrypto {
  getRandomValues(array: Uint32Array): Uint32Array;
}

/**
 * `crypto.getRandomValues` is available in Node ≥19, Bun, and every
 * browser via the standard `globalThis.crypto` — never `window.crypto`, so
 * this works identically server- and client-side. Falls back to
 * `Math.random` only on a runtime that truly lacks the Web Crypto API.
 */
function createCryptoSource(): RandomSource {
  const cryptoObj = (globalThis as { crypto?: MinimalCrypto }).crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    return {
      nextUint32: () => {
        const buffer = new Uint32Array(1);
        cryptoObj.getRandomValues(buffer);
        return buffer[0]!;
      },
    };
  }
  return {
    nextUint32: () => Math.floor(Math.random() * 0x1_0000_0000),
  };
}

/** Deterministic (mulberry32) when `seed` is given; cryptographically random otherwise. */
export function createRandomSource(seed?: string | number): RandomSource {
  if (seed !== undefined) return createSeededSource(seed);
  return createCryptoSource();
}
