/**
 * The ROOT file worker's message protocol and its request handling, kept apart
 * from the worker entry point so that the handling runs in unit tests without
 * jsroot.
 *
 * Files are opened under HANDLES: each client (the display's loads, the data
 * selector's picker) works on its own handle id, so opening a file for one
 * never replaces the file another one is converting.
 */

import type { ContentEntry, FileContentProbe } from '@dexvis/firebird-core/loaders';
import type { DexDocument, PodioModel } from '@dexvis/root2dex';
import { DEFAULT_MAX_ENTRIES, parseEntryRanges, selectEntries } from '@dexvis/root2dex/entries';

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
  /** The handle the file opens under; replaces what that handle had open. */
  handle: number;
  source: RootFileSource;
}

export interface RootFileConvertRequest {
  type: 'convert';
  requestId: string;
  /** The handle whose open file is converted. */
  handle: number;
  /**
   * Entry numbers as typed by the user: '1', '0,2,4-5'. A selection with any
   * entry outside the file, or more than DEFAULT_MAX_ENTRIES entries, is
   * rejected before anything is expanded (the pyrobird convert endpoint
   * applies the same rule).
   */
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
  /** The handle to release; other handles keep their files. */
  handle: number;
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

/** An open file as the session needs it: what Root2DexConverter offers. */
export interface OpenedConverter {
  readonly sourceName: string;
  readonly model: PodioModel;
  readonly entryCount: number;
  convert(
    entries: number[],
    options: { collections?: string[]; onWarning?: (message: string) => void },
  ): Promise<DexDocument>;
}

/** What the session reads files with; the worker passes jsroot and root2dex. */
export interface RootFileBackend {
  /** Lists a file's top-level keys with their class names. */
  listKeys(source: File | string): Promise<ContentEntry[]>;
  /** Opens a podio file for conversion. */
  open(source: File | string): Promise<OpenedConverter>;
  /** The collection groups a model's conversion knows. */
  collectionGroups(model: PodioModel): string[];
}

/** Answers RootFileRequests: one session per worker. */
export class RootFileSession {
  /** Open files by handle. */
  private readonly converters = new Map<number, OpenedConverter>();
  /** The latest open request per handle: an older open that finishes later is not kept. */
  private readonly latestOpen = new Map<number, string>();

  constructor(
    private readonly backend: RootFileBackend,
    private readonly post: (message: RootFileResponse) => void,
  ) {}

  /** Handles one request; the answer, or an error, goes out through `post`. */
  async handle(request: RootFileRequest): Promise<void> {
    try {
      switch (request.type) {
        case 'probe':
          return await this.probe(request);
        case 'open':
          return await this.open(request);
        case 'convert':
          return await this.convert(request);
        case 'close':
          this.converters.delete(request.handle);
          this.latestOpen.delete(request.handle);
          this.post({ type: 'closed', requestId: request.requestId });
          return;
      }
    } catch (error) {
      this.post({
        type: 'error',
        requestId: request.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Lists the file's top-level keys. No interpretation: a detector geometry
   * comes back as `{name: 'Default', className: 'TGeoManager'}` and event data
   * as `{name: 'events', className: 'TTree'}`, and the caller decides what
   * that means.
   */
  private async probe(request: RootFileProbeRequest): Promise<void> {
    const entries = await this.backend.listKeys(sourceOf(request.source));
    const probe: FileContentProbe = { name: nameOf(request.source), entries };
    this.post({ type: 'probed', requestId: request.requestId, probe });
  }

  private async open(request: RootFileOpenRequest): Promise<void> {
    this.latestOpen.set(request.handle, request.requestId);
    const converter = await this.backend.open(sourceOf(request.source));
    if (this.latestOpen.get(request.handle) === request.requestId) {
      this.converters.set(request.handle, converter);
    }
    this.post({
      type: 'opened',
      requestId: request.requestId,
      sourceName: converter.sourceName,
      model: converter.model,
      entryCount: converter.entryCount,
      collectionGroups: this.backend.collectionGroups(converter.model),
    });
  }

  private async convert(request: RootFileConvertRequest): Promise<void> {
    const converter = this.converters.get(request.handle);
    if (!converter) throw new Error('No ROOT file is open');
    // Size and bounds are checked before the selection is expanded
    const entries = selectEntries(parseEntryRanges(request.entries), converter.entryCount, DEFAULT_MAX_ENTRIES);
    const warnings: string[] = [];
    const convertStart = performance.now();
    const dex = await converter.convert(entries, {
      collections: request.collections?.length ? request.collections : undefined,
      onWarning: message => warnings.push(message),
    });
    const convertMs = performance.now() - convertStart;
    this.post({
      type: 'converted',
      requestId: request.requestId,
      entries,
      dex,
      warnings,
      convertMs,
      postedAtMs: Date.now(),
    });
  }
}

function sourceOf(source: RootFileSource): File | string {
  return source.kind === 'file' ? source.file : source.url;
}

function nameOf(source: RootFileSource): string {
  return source.kind === 'file' ? source.file.name : source.url;
}
