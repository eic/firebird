/**
 * The ROOT file worker: `runRootFileWorker(self)` in a worker entry module of
 * the application (see `withWorkers()`). It reports what a ROOT file holds,
 * and converts podio events to Firebird DEX off the main thread.
 *
 * Two jobs, deliberately separate:
 *
 * - `probe` reports NEUTRAL FACTS - the file's top-level keys with their ROOT
 *   class names. It does not decide what the file is for. Deciding is the
 *   routing control's job, which asks the DI-registered loaders (each knows
 *   what its own format looks like).
 * - `open`/`convert` delegate to @dexvis/root2dex, whose only concern is
 *   producing DEX.
 *
 * A file stays OPEN under its handle between conversions (see
 * root-file.protocol.ts): opening reads the key directory, the streamer info
 * and the TTree metadata, and paying that once per file is what makes "show
 * event 7, now show event 12" fast. Only the baskets of the requested entries
 * are read, so a multi-GB file never lands in the browser.
 *
 * Keeping this in a worker also keeps jsroot out of the main bundle: the chunk
 * is fetched when the first file is opened, not at page load.
 */

// jsroot declares its subpath modules (jsroot/io) in the types
// of its main entry; the reference loads them without importing the main
// entry, whose module graph is several times the size of the io entry.
/// <reference types="jsroot" />
import { openFile } from 'jsroot/io';
import { Root2DexConverter, collectionGroupsFor } from '@dexvis/root2dex';
import { RootFileSession, type RootFileRequest } from './root-file.protocol';
import type { WorkerScope } from '@dexvis/firebird-ng/api';

/**
 * Runs the ROOT file worker in `scope`, the global scope of a worker entry
 * module (`self`): answers the probe, open, convert and close requests of
 * RootFileService.
 *
 * ```ts
 * // root-file.worker.ts, the module withWorkers({ rootFile }) starts
 * import { runRootFileWorker } from '@dexvis/firebird-ng/workers/root-file';
 * runRootFileWorker(self);
 * ```
 */
export function runRootFileWorker(scope: WorkerScope): void {
  const session = new RootFileSession(
    {
      async listKeys(source) {
        const file = (await openFile(source as never)) as {
          fKeys?: Array<{ fName: string; fClassName: string }>;
        };
        return (file.fKeys ?? []).map(key => ({ name: key.fName, className: key.fClassName }));
      },
      open: source => Root2DexConverter.open(source),
      collectionGroups: collectionGroupsFor,
    },
    message => scope.postMessage(message),
  );
  scope.addEventListener('message', ({ data }: MessageEvent<RootFileRequest>) => void session.handle(data));
}
