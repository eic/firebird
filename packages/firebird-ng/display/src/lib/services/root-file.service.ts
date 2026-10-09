/**
 * The app's facility for ROOT files the user points Firebird at: report what a
 * file holds, and convert podio events to DEX. Both run in a worker.
 *
 * Scope: this service moves BYTES and FACTS. It never decides what a file is
 * for - `probe()` returns the file's top-level keys and the routing control
 * (FileOpenRouterService) asks the registered loaders what to do with them. The
 * DEX conversion itself belongs to @dexvis/root2dex; this is only its
 * transport.
 *
 * Files are opened under handles (`createHandle()`): each client keeps its own
 * file open across conversions, so the "pick a file, then step through events"
 * loop pays the tree-metadata read once, and one client opening a file never
 * replaces another client's. Nothing here reads the whole file: a multi-GB
 * file is fine, only the baskets of the requested events cross the wire.
 *
 * Bundle note: the worker is created on the first use, so jsroot and the
 * converter are fetched when a user actually opens a file.
 */

import { Injectable, inject, signal } from '@angular/core';
import type { FileContentProbe } from '@dexvis/firebird-core';
import type {
  RootConvertOptions,
  RootFileRequest,
  RootFileResponse,
  RootFileSource,
} from '@dexvis/firebird-ng/workers/root-file';
import { FIREBIRD_WORKERS, UrlService } from '@dexvis/firebird-ng/api';

/** What was learned about a file when it was opened. */
export interface OpenedRootFile {
  sourceName: string;
  model: string;
  entryCount: number;
  /**
   * The collection groups the model's conversion knows — what a UI offers as
   * conversion checkboxes. Names match `pyrobird convert --collections`.
   */
  collectionGroups: string[];
}

/** Converted events, plus whatever the converter complained about. */
export interface ConvertedEvents {
  entries: number[];
  dex: unknown;
  warnings: string[];
}

interface PendingRequest {
  resolve: (value: never) => void;
  reject: (error: Error) => void;
  /** The handle the request belongs to; undefined for handle-free requests (probe). */
  handle?: number;
}

/**
 * One client's view of the worker: a file opened under its own handle id, so
 * that the data selector's picker and the display's loads never replace each
 * other's open file. Close it when done; closing releases only this handle's
 * file, and the handle can open another file afterwards.
 */
export class RootFileHandle {
  /** The file currently open under this handle, or null. */
  readonly openedFile = signal<OpenedRootFile | null>(null);
  /** True while an open or a conversion of this handle is in flight. */
  readonly busy = signal(false);

  private inFlight = 0;
  /** Bumped by every open and by close: only the latest open sets `openedFile`. */
  private openToken = 0;

  constructor(
    readonly id: number,
    private readonly service: RootFileService,
  ) {}

  /**
   * Opens a ROOT file and reads its tree metadata, replacing what this handle
   * had open. When opens overlap, only the latest one sets `openedFile`.
   */
  async open(source: File | string): Promise<OpenedRootFile> {
    const token = ++this.openToken;
    this.openedFile.set(null);
    const opened = await this.track(this.service.request<OpenedRootFile>(this.id, requestId => ({
      type: 'open',
      requestId,
      handle: this.id,
      source: this.service.sourceOf(source),
    })));
    const file: OpenedRootFile = {
      sourceName: opened.sourceName,
      model: opened.model,
      entryCount: opened.entryCount,
      collectionGroups: opened.collectionGroups,
    };
    if (token === this.openToken) this.openedFile.set(file);
    return file;
  }

  /**
   * Converts events of this handle's open file to one DEX document.
   *
   * @param entries Entry numbers as typed by the user: '1', '0,2,4-5'.
   *   Entries outside the file are dropped with one warning in
   *   `warnings`; a selection with no entry in the file is rejected.
   * @param options Collection groups to convert (names from the opened
   *   file's `collectionGroups`; absent or empty means all groups) and the
   *   sim hit collections kept out of MC-truth trajectories.
   */
  async convert(entries: string, options: RootConvertOptions = {}): Promise<ConvertedEvents> {
    const { collections, trajectoryExcludedCollections } = options;
    const result = await this.track(this.service.request<{ entries: number[]; dex: unknown; warnings: string[] }>(
      this.id,
      requestId => ({ type: 'convert', requestId, handle: this.id, entries, collections, trajectoryExcludedCollections }),
    ));
    return { entries: result.entries, dex: result.dex, warnings: result.warnings };
  }

  /** Releases this handle's file in the worker; its in-flight requests reject. */
  close(): void {
    this.openToken++;
    this.openedFile.set(null);
    this.service.release(this.id);
  }

  private async track<T>(request: Promise<T>): Promise<T> {
    this.inFlight++;
    this.busy.set(true);
    try {
      return await request;
    } finally {
      this.inFlight--;
      this.busy.set(this.inFlight > 0);
    }
  }
}

@Injectable({ providedIn: 'root' })
export class RootFileService {
  private readonly urls = inject(UrlService);
  /** The worker factories of the application (withWorkers). */
  private readonly workers = inject(FIREBIRD_WORKERS, { optional: true });

  private worker: Worker | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private handleCounter = 0;

  /** True when this browser can run the converter at all. */
  get isSupported(): boolean {
    return typeof Worker !== 'undefined';
  }

  /** A new handle: one client's open file in the worker. */
  createHandle(): RootFileHandle {
    return new RootFileHandle(++this.handleCounter, this);
  }

  /**
   * Reports the file's top-level keys with their ROOT class names. Cheap: only
   * the key directory is read, no event data and no geometry.
   */
  async probe(source: File | string): Promise<FileContentProbe> {
    const result = await this.request<{ probe: FileContentProbe }>(undefined, requestId => ({
      type: 'probe',
      requestId,
      source: this.sourceOf(source),
    }));
    return result.probe;
  }

  /**
   * URL aliases (`asset://`, pack aliases) and server-relative paths are resolved
   * here, on the main thread: the worker's jsroot reader fetches whatever URL
   * it is handed and knows nothing about Firebird's schemes.
   */
  sourceOf(source: File | string): RootFileSource {
    return typeof source === 'string'
      ? { kind: 'url', url: this.urls.resolveDownloadUrl(source) }
      : { kind: 'file', file: source };
  }

  /** Sends one request to the worker; `handle` ties it to a RootFileHandle. */
  request<T>(handle: number | undefined, build: (requestId: string) => RootFileRequest): Promise<T> {
    const worker = this.ensureWorker();
    const requestId = `root-file-${++this.requestCounter}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: resolve as (value: never) => void,
        reject,
        handle,
      });
      worker.postMessage(build(requestId));
    });
  }

  /** Drops a handle's file in the worker and rejects its in-flight requests. */
  release(handle: number): void {
    for (const [requestId, request] of this.pending) {
      if (request.handle !== handle) continue;
      this.pending.delete(requestId);
      request.reject(new Error('The ROOT file was closed'));
    }
    if (!this.worker) return;
    const requestId = `root-file-${++this.requestCounter}`;
    this.worker.postMessage({ type: 'close', requestId, handle } satisfies RootFileRequest);
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    if (!this.isSupported) {
      throw new Error('Web Workers are not available, cannot read ROOT files in this browser');
    }
    if (!this.workers) {
      throw new Error('No ROOT file worker: add withWorkers({ geometry, rootFile }) to provideFirebird()');
    }
    const worker = this.workers.rootFile();
    worker.onmessage = ({ data }: MessageEvent<RootFileResponse>) => this.onMessage(data);
    worker.onerror = error => {
      const message = `ROOT file worker error: ${error.message}`;
      console.error(`[RootFileService]: ${message}`);
      for (const request of this.pending.values()) request.reject(new Error(message));
      this.pending.clear();
      // A broken worker is dropped; the next request starts a fresh one
      worker.terminate();
      if (this.worker === worker) this.worker = null;
    };
    this.worker = worker;
    return worker;
  }

  private onMessage(data: RootFileResponse): void {
    const request = this.pending.get(data.requestId);
    if (!request) return;
    this.pending.delete(data.requestId);
    if (data.type === 'error') {
      request.reject(new Error(data.error));
      return;
    }
    if (data.type === 'converted') {
      // The transfer delta is the structured-clone serialize + queue +
      // deserialize cost of shipping the DEX document out of the worker
      const transferMs = Date.now() - data.postedAtMs;
      if (data.convertMs > 100 || transferMs > 100) {
        console.log(`[load-timing] root worker: convert ${data.convertMs.toFixed(1)} ms, ` +
          `worker->main transfer ${transferMs} ms`);
      }
    }
    request.resolve(data as never);
  }
}
