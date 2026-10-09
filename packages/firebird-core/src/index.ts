/**
 * @dexvis/firebird-core - the worker-safe core of the Firebird event display:
 * event model, DEX io, loader contracts, data catalog types and painters.
 *
 * The root imports three.js (through the painters). Code that must stay
 * light, such as modules in an application's initial bundle, imports the
 * subpaths instead: `@dexvis/firebird-core/model`, `/loaders` and
 * `/data-catalog` import no three.js.
 */

// Event model and DEX io
export * from './model';

// Loader contracts (implementations are contributed via DI in the Angular layer)
export * from './loaders';
export * from './data-catalog';

// Painters (time-aware rendering of event data into a three.js scene)
export * from './painters/event-piece-painter';
export * from './painters/data-model-painter';
export * from './painters/default-painters';
export * from './painters/box-hit-simple.painter';
export * from './painters/trajectory.painter';
export * from './painters/batched-trajectory.painter';
