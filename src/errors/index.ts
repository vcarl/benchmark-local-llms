/**
 * Error re-export surface (requirements §3.1). Importers pull typed error
 * classes from `src/errors` rather than reaching into individual domain files.
 *
 * Note: `CutoffTripped` is deliberately absent — cutoff trips are expected
 * terminations returned as values, not failures (§3.1 comment).
 */
export * from "./config.js";
export * from "./game.js";
export * from "./io.js";
export * from "./llm.js";
export * from "./scorer.js";
export * from "./server.js";
export * from "./sse.js";
