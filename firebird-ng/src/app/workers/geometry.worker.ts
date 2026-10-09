/// <reference lib="webworker" />

// The flagship's ROOT geometry worker (started by withWorkers in app.config.ts).
// The code ships in @dexvis/firebird-ng; this entry exists so that the Angular
// build bundles the worker.
import { runGeometryWorker } from '@dexvis/firebird-ng/workers/geometry';

runGeometryWorker(self);
