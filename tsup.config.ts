import { defineConfig } from 'tsup';

export default defineConfig({
  // Two entry points since 0.13.0. `./draw` is separate so a consumer that only
  // scrambles — a practice timer, a results page — never bundles the drawing
  // layer. `splitting: false` keeps each entry a self-contained file, which is
  // what makes "the drawing layer is absent from dist/index.js" a fact a test can
  // read off one file rather than a chunk graph it has to walk. The cost is that a
  // consumer importing *both* entries carries two copies of the puzzle state
  // models; that consumer wants the drawing anyway, and a duplicated model is
  // dead weight rather than a correctness problem — every drawer builds its state
  // from the scramble text, so there is no shared mutable state to split.
  //
  // Four since 0.15.0: `./unofficial` and `./unofficial/draw` serve the non-WCA
  // events, split for the same two reasons. A WCA-only consumer bundles none of
  // their code, and the shape-mod geometry engine stays out of every scrambling
  // entry.
  entry: ['src/index.ts', 'src/draw/index.ts', 'src/unofficial/index.ts', 'src/unofficial/draw/index.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
});
