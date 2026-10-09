/**
 * `@dexvis/firebird-ng/workers/root-file`: the ROOT file worker (probing,
 * in-browser conversion of podio event files) and the messages
 * RootFileService exchanges with it.
 *
 * The application owns the worker entry module, so that its bundler builds
 * the worker (a library cannot ship a worker the application's bundler
 * sees); `withWorkers()` starts it. The entry is one call:
 *
 * ```ts
 * // root-file.worker.ts
 * import { runRootFileWorker } from '@dexvis/firebird-ng/workers/root-file';
 * runRootFileWorker(self);
 * ```
 *
 * An entry of its own: a worker bundle holds the code of one worker only.
 */

export { runRootFileWorker } from './lib/root-file-worker';
export * from './lib/root-file.protocol';
