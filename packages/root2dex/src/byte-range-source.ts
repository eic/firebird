/**
 * A ROOT source built from nothing but "give me bytes [pos, pos+len)".
 *
 * `PodioEventFile` already handles local files and http(s) URLs directly. This
 * is the seam for everything else: an XRootD proxy endpoint, a service worker
 * cache, a test double that counts how much was read. Implement
 * `ByteRangeReader` and hand the result to `PodioEventFile.open` /
 * `Root2DexConverter.open`.
 *
 * Implement the optional `readRanges` when the transport can answer several
 * ranges in one round trip - JSROOT asks for all the baskets of one entry at
 * once, and a proxy that batches them turns an event into a single request.
 */

import { FileProxy } from 'jsroot/io';
import type { RootSource } from './podio-file';

/** What a byte-range transport has to provide. */
export interface ByteRangeReader {
  /** File name, used for messages and for JSROOT's file-name checks. */
  readonly name: string;
  /** Total size in bytes; JSROOT seeks relative to it. */
  readonly size: number;
  /** Reads one range. */
  readRange(position: number, length: number): Promise<ArrayBuffer | DataView>;
  /** Optional batched form: all ranges of one request in one round trip. */
  readRanges?(ranges: Array<[position: number, length: number]>): Promise<DataView[]>;
  close?(): void;
}

function toDataView(data: ArrayBuffer | DataView): DataView {
  return data instanceof DataView ? data : new DataView(data);
}

/**
 * Wraps a `ByteRangeReader` into the object JSROOT's `openFile` accepts.
 *
 * `FileProxy` is a JSROOT base class and `openFile` checks the instance type,
 * so the subclass is created here rather than declared at module scope.
 */
export function createByteRangeSource(reader: ByteRangeReader): RootSource {
  class ReaderProxy extends FileProxy {
    async openFile(): Promise<boolean> {
      return true;
    }
    getFileName(): string {
      return reader.name;
    }
    getFileSize(): number {
      return reader.size;
    }
    async readBuffer(position: number, length: number): Promise<DataView> {
      return toDataView(await reader.readRange(position, length));
    }
    closeFile(): void {
      reader.close?.();
    }
  }

  const proxy = new ReaderProxy() as ReaderProxy & {
    readBuffers?: (place: number[]) => Promise<DataView[]>;
  };

  if (reader.readRanges) {
    // JSROOT passes places as a flat [pos, len, pos, len, ...] array
    proxy.readBuffers = async (place: number[]) => {
      const ranges: Array<[number, number]> = [];
      for (let i = 0; i < place.length; i += 2) ranges.push([place[i], place[i + 1]]);
      return reader.readRanges!(ranges);
    };
  }

  return proxy;
}
