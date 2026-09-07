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
 * - `open`/`convert` delegate to @firebird/root2dex, whose only concern is
 *   producing DEX.
 *
 * The file stays OPEN between conversions: opening reads the key directory, the
 * streamer info and the TTree metadata, and paying that once per file is what
 * makes "show event 7, now show event 12" fast. Only the baskets of the
 * requested entries are read, so a multi-GB file never lands in the browser.
 *
 * Keeping this in a worker also keeps jsroot out of the main bundle: the chunk
 * is fetched when the first file is opened, not at page load.
 */

import { openFile } from 'jsroot';
import {
  Root2DexConverter,
  collectionGroupsFor,
  parseEntryNumbers,
  type DexDocument,
  type PodioModel,
} from '@firebird/root2dex';
import type { ContentEntry, FileContentProbe } from '@firebird/core/loaders';

/** What to open: a file the user picked/dropped, or a URL. */
export type RootFileSource =
  | { kind: 'file'; file: File }
  | { kind: 'url'; url: string };

export interface RootFileProbeRequest {
  type: 'probe';
  requestId: string;
  source: RootFileSource;
}

export interface RootFileOpenRequest {
  type: 'open';
  requestId: string;
  source: RootFileSource;
}

export interface RootFileConvertRequest {
  type: 'convert';
  requestId: string;
  /** Entry numbers as typed by the user: '1', '0,2,4-5'. */
  entries: string;
  /**
   * Collection groups to convert (names from the open response's
   * `collectionGroups`). Absent or empty means all groups.
   */
  collections?: string[];
}

export interface RootFileCloseRequest {
  type: 'close';
  requestId: string;
}

export type RootFileRequest =
  | RootFileProbeRequest
  | RootFileOpenRequest
  | RootFileConvertRequest
  | RootFileCloseRequest;

export interface RootFileProbed {
  type: 'probed';
  requestId: string;
  probe: FileContentProbe;
}

export interface RootFileOpened {
  type: 'opened';
  requestId: string;
  sourceName: string;
  model: PodioModel;
  entryCount: number;
  /** The collection groups this model's conversion knows (checkbox choices). */
  collectionGroups: string[];
}

export interface RootFileConverted {
  type: 'converted';
  requestId: string;
  entries: number[];
  dex: DexDocument;
  /** Converter warnings collected during this conversion, in order. */
  warnings: string[];
  /** [load-timing] How long the conversion took in the worker. */
  convertMs: number;
  /**
   * [load-timing] Wall-clock (Date.now(), shared with the main thread) right
   * before postMessage — the receiver's Date.now() minus this is the
   * serialize + queue + deserialize cost of shipping the document.
   */
  postedAtMs: number;
}

export interface RootFileClosed {
  type: 'closed';
  requestId: string;
}

export interface RootFileError {
  type: 'error';
  requestId: string;
  error: string;
}

export type RootFileResponse =
  | RootFileProbed
  | RootFileOpened
  | RootFileConverted
  | RootFileClosed
  | RootFileError;

/** The currently open file. One at a time: opening a new one replaces it. */
let converter: Root2DexConverter | null = null;

function post(message: RootFileResponse): void {
  postMessage(message);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sourceOf(source: RootFileSource): File | string {
  return source.kind === 'file' ? source.file : source.url;
}

function nameOf(source: RootFileSource): string {
  return source.kind === 'file' ? source.file.name : source.url;
}

/**
 * Lists the file's top-level keys. No interpretation: a detector geometry comes
 * back as `{name: 'Default', className: 'TGeoManager'}` and event data as
 * `{name: 'events', className: 'TTree'}`, and the caller decides what that means.
 */
async function handleProbe(request: RootFileProbeRequest): Promise<void> {
  const file = (await openFile(sourceOf(request.source) as never)) as {
    fKeys?: Array<{ fName: string; fClassName: string }>;
  };
  const entries: ContentEntry[] = (file.fKeys ?? []).map(key => ({
    name: key.fName,
    className: key.fClassName,
  }));
  post({
    type: 'probed',
    requestId: request.requestId,
    probe: { name: nameOf(request.source), entries },
  });
}

async function handleOpen(request: RootFileOpenRequest): Promise<void> {
  converter = await Root2DexConverter.open(sourceOf(request.source));
  post({
    type: 'opened',
    requestId: request.requestId,
    sourceName: converter.sourceName,
    model: converter.model,
    entryCount: converter.entryCount,
    collectionGroups: collectionGroupsFor(converter.model),
  });
}

async function handleConvert(request: RootFileConvertRequest): Promise<void> {
  if (!converter) throw new Error('No ROOT file is open');
  const entries = parseEntryNumbers(request.entries);
  const last = converter.entryCount - 1;
  const outOfRange = entries.filter(entry => entry < 0 || entry > last);
  if (outOfRange.length) {
    throw new Error(
      `Event ${outOfRange.join(', ')} is out of range: the file holds ` +
        `${converter.entryCount} events (0..${last})`,
    );
  }
  const warnings: string[] = [];
  const convertStart = performance.now();
  const dex = await converter.convert(entries, {
    collections: request.collections?.length ? request.collections : undefined,
    onWarning: message => warnings.push(message),
  });
  const convertMs = performance.now() - convertStart;
  post({
    type: 'converted',
    requestId: request.requestId,
    entries,
    dex,
    warnings,
    convertMs,
    postedAtMs: Date.now(),
  });
}

addEventListener('message', ({ data }: MessageEvent<RootFileRequest>) => {
  const run = async () => {
    switch (data.type) {
      case 'probe':
        return handleProbe(data);
      case 'open':
        return handleOpen(data);
      case 'convert':
        return handleConvert(data);
      case 'close':
        converter = null;
        post({ type: 'closed', requestId: data.requestId });
        return;
    }
  };

  run().catch(error => {
    post({ type: 'error', requestId: data.requestId, error: errorText(error) });
  });
});
