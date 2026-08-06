/**
 * Text imports, for tests that check documentation against the code.
 *
 * The package itself has no Node types and touches no filesystem — that is
 * deliberate, since it has to run in a browser as readily as in Node — so a test
 * cannot simply `readFileSync` the README. Vite's `?raw` suffix hands the file
 * over as a string at build time instead, which needs only this declaration and
 * no dependency.
 */
declare module '*?raw' {
  const content: string;
  export default content;
}
