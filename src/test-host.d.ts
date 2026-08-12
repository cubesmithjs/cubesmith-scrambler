/**
 * The handful of host APIs the **tests** use, declared locally.
 *
 * Same reasoning as `raw-text.d.ts`: this package has no Node types and touches no
 * filesystem, deliberately, because it has to run in a browser as readily as in Node.
 * Adding `@types/node` to make `node:fs` type-check would put every Node global in
 * scope for *shipped* code too, which is exactly the boundary the package keeps — a
 * `readFileSync` reachable from `src/puzzles/` is a mistake nobody would notice until
 * a browser build failed.
 *
 * So the three tests that genuinely need a host — the two that read the **built**
 * bundles and the golden-fixture file, and the timing assertions in
 * `prepare-event.test.ts` — get these narrow declarations instead. Each is the
 * smallest surface that call site uses, so the file stays a statement of what the
 * tests touch rather than a shim that could grow into a dependency.
 *
 * 🔴 Nothing under `src/core/`, `src/puzzles/`, `src/notation/` or `src/draw/` (test
 * files aside) may use any of these. The package's independence claim in `README.md`
 * is exactly that.
 */

declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
  export function readFileSync(path: string | URL): { length: number };
  export function writeFileSync(path: string | URL, data: string): void;
  export function existsSync(path: string | URL): boolean;
}

declare module 'node:zlib' {
  export function gzipSync(data: { length: number }): { length: number };
}

/** `performance.now()` — a monotonic millisecond clock, in Node ≥16 and every browser. */
declare const performance: { now(): number };

/** Used only by `src/draw/__fixtures__/generate.ts`, a developer script. */
declare const console: { log(...args: unknown[]): void };

declare class URL {
  constructor(url: string, base?: string | URL);
  readonly pathname: string;
  readonly href: string;
}

interface ImportMeta {
  readonly url: string;
}
