/**
 * The `@dexvis/firebird-core/model` subpath: the event model and DEX io,
 * without painters. Plain TypeScript with no three.js import, so a module in
 * an application's initial bundle imports it without pulling three.js into
 * startup (the package root re-exports the painters, which do).
 */
export * from './event';
export * from './event-piece';
export * from './box-hit.piece';
export * from './point-trajectory.piece';
export * from './data-exchange';
// Explicit registration entry point for no-DI contexts (workers, scripts).
// There are no import side effects anywhere in core.
export * from './default-piece-init';
