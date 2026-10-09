/**
 * `@dexvis/firebird-ng/workers/geometry`: the ROOT geometry worker and the
 * messages GeometryService exchanges with it.
 *
 * The application owns the worker entry module, so that its bundler builds
 * the worker (a library cannot ship a worker the application's bundler
 * sees); `withWorkers()` starts it. The entry is one call:
 *
 * ```ts
 * // geometry.worker.ts
 * import { runGeometryWorker } from '@dexvis/firebird-ng/workers/geometry';
 * runGeometryWorker(self);
 * ```
 *
 * An entry of its own: a worker bundle holds the code of one worker only.
 */

export { runGeometryWorker } from './lib/geometry-worker';
export type {
  GeometryLoadRequest,
  GeometryCancelRequest,
  WorkerResponse,
  SubdetectorInfo,
} from './lib/geometry-worker';
