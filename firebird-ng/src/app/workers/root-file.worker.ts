/// <reference lib="webworker" />

// The flagship's ROOT file worker (started by withWorkers in app.config.ts):
// probing and in-browser conversion of ROOT event files. The code ships in
// @dexvis/firebird-ng; this entry exists so that the Angular build bundles
// the worker.
import { runRootFileWorker } from '@dexvis/firebird-ng/workers/root-file';

runRootFileWorker(self);
