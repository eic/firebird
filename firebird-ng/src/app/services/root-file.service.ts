/**
 * The app's facility for ROOT files the user points Firebird at: report what a
 * file holds, and convert podio events to DEX. Both run in a worker.
 *
 * Scope: this service moves BYTES and FACTS. It never decides what a file is
 * for - `probe()` returns the file's top-level keys and the routing control
 * (FileOpenRouterService) asks the registered loaders what to do with them. The
 * DEX conversion itself belongs to @firebird/root2dex; this is only its
 * transport.
 *
 * The file stays open across conversions, so the "pick a file, then step
 * through events" loop pays the tree-metadata read once. Nothing here reads the
 * whole file: a multi-GB file is fine, only the baskets of the requested events
 * cross the wire.
 *
 * Bundle note: the worker is created on the first use, so jsroot and the
 * converter are fetched when a user actually opens a file.
 */

import { Injectable, signal } from '@angular/core';
import type { FileContentProbe } from '@firebird/core';
import type {
  RootFileRequest,
  RootFileResponse,
  RootFileSource,
} from '../workers/root-file.worker';

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
}

@Injectable({ providedIn: 'root' })
export class RootFileService {
  /** The file currently open in the worker, or null. */
  readonly openedFile = signal<OpenedRootFile | null>(null);
  /** True while a probe, an open or a conversion is in flight. */
  readonly busy = signal(false);

  private worker: Worker | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private requestCounter = 0;

  /** True when this browser can run the converter at all. */
  get isSupported(): boolean {
    return typeof Worker !== 'undefined';
  }

  /**
   * Reports the file's top-level keys with their ROOT class names. Cheap: only
   * the key directory is read, no event data and no geometry.
   */
  async probe(source: File | string): Promise<FileContentProbe> {
    const result = await this.send<{ probe: FileContentProbe }>(requestId => ({
      type: 'probe',
      requestId,
      source: this.sourceOf(source),
    }));
    return result.probe;
  }

  /**
   * Opens a ROOT file and reads its tree metadata. Replaces whatever file was
   * open before.
   */
  async open(source: File | string): Promise<OpenedRootFile> {
    this.openedFile.set(null);
    const opened = await this.send<OpenedRootFile>(requestId => ({
      type: 'open',
      requestId,
      source: this.sourceOf(source),
    }));
    const file: OpenedRootFile = {
      sourceName: opened.sourceName,
      model: opened.model,
      entryCount: opened.entryCount,
      collectionGroups: opened.collectionGroups,
    };
    this.openedFile.set(file);
    return file;
  }

  /**
   * Converts events of the open file to one DEX document.
   *
   * @param entries Entry numbers as typed by the user: '1', '0,2,4-5'.
   * @param collections Collection groups to convert (names from the opened
   *   file's `collectionGroups`); absent or empty means all groups.
   */
  async convert(entries: string, collections?: string[]): Promise<ConvertedEvents> {
    const result = await this.send<{ entries: number[]; dex: unknown; warnings: string[] }>(
      requestId => ({ type: 'convert', requestId, entries, collections }),
    );
    return { entries: result.entries, dex: result.dex, warnings: result.warnings };
  }

  /** Closes the open file and releases the worker. */
  close(): void {
    this.openedFile.set(null);
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    for (const request of this.pending.values()) {
      request.reject(new Error('ROOT file service was closed'));
    }
    this.pending.clear();
    this.busy.set(false);
  }

  private sourceOf(source: File | string): RootFileSource {
    return typeof source === 'string' ? { kind: 'url', url: source } : { kind: 'file', file: source };
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    if (!this.isSupported) {
      throw new Error('Web Workers are not available, cannot read ROOT files in this browser');
    }
    const worker = new Worker(new URL('../workers/root-file.worker', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = ({ data }: MessageEvent<RootFileResponse>) => this.onMessage(data);
    worker.onerror = error => {
      const message = `ROOT file worker error: ${error.message}`;
      console.error(`[RootFileService]: ${message}`);
      for (const request of this.pending.values()) request.reject(new Error(message));
      this.pending.clear();
      this.busy.set(false);
    };
    this.worker = worker;
    return worker;
  }

  private onMessage(data: RootFileResponse): void {
    const request = this.pending.get(data.requestId);
    if (!request) return;
    this.pending.delete(data.requestId);
    this.busy.set(this.pending.size > 0);
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

  private send<T>(build: (requestId: string) => RootFileRequest): Promise<T> {
    const worker = this.ensureWorker();
    const requestId = `root-file-${++this.requestCounter}`;
    this.busy.set(true);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: resolve as (value: never) => void,
        reject,
      });
      worker.postMessage(build(requestId));
    });
  }
}
