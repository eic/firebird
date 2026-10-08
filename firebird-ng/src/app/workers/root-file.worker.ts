/// <reference lib="webworker" />

/**
 * Web Worker for ROOT files the user points Firebird at: it reports what a file
 * holds, and converts podio events to Firebird DEX off the main thread.
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

import { openFile } from 'jsroot';
import { Root2DexConverter, collectionGroupsFor } from '@dexvis/root2dex';
import { RootFileSession, type RootFileRequest } from './root-file.protocol';

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
  message => postMessage(message),
);

addEventListener('message', ({ data }: MessageEvent<RootFileRequest>) => void session.handle(data));
