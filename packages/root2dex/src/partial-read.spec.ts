/**
 * The other half of the contract: converting one event must read a small
 * fraction of the file, not all of it. Event files are routinely multi-GB, and
 * the whole point of going through JSROOT is that the browser never sees more
 * than the baskets covering the requested entry.
 *
 * The test counts bytes through a ByteRangeReader - the same seam a future
 * XRootD proxy plugs into.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createByteRangeSource, type ByteRangeReader } from './byte-range-source';
import { Root2DexConverter } from './convert';
import { PodioEventFile } from './podio-file';

const ROOT_DATA = resolve(__dirname, '../../../pyrobird/tests/unit_tests/data');
const EIC_FILE = resolve(ROOT_DATA, 'reco_2024-09_craterlake_2evt.edm4eic.root');

/** A ByteRangeReader over a local file that records what it was asked for. */
class CountingFileReader implements ByteRangeReader {
  readonly name: string;
  readonly size: number;
  bytesRead = 0;
  requests = 0;

  private constructor(
    private readonly handle: FileHandle,
    path: string,
    size: number,
  ) {
    this.name = path;
    this.size = size;
  }

  static async open(path: string): Promise<CountingFileReader> {
    return new CountingFileReader(await open(path, 'r'), path, statSync(path).size);
  }

  async readRange(position: number, length: number): Promise<ArrayBuffer> {
    this.requests++;
    this.bytesRead += length;
    const buffer = new Uint8Array(length);
    await this.handle.read(buffer, 0, length, position);
    return buffer.buffer;
  }

  async close(): Promise<void> {
    await this.handle.close();
  }
}

describe('partial reading', () => {
  it.runIf(existsSync(EIC_FILE))(
    'reads a fraction of the file to convert one event',
    async () => {
      const reader = await CountingFileReader.open(EIC_FILE);
      try {
        const converter = await Root2DexConverter.open(createByteRangeSource(reader));
        const afterOpen = reader.bytesRead;

        const event = await converter.convertEntry(0);
        const afterConvert = reader.bytesRead;

        expect(event.pieces.length).toBeGreaterThan(0);
        // Opening reads the key directory, the streamer info and the TTree
        // metadata - podio trees are branch-heavy, but still a small part of
        // the file, and the cost is paid once per file, not per event
        expect(afterOpen).toBeLessThan(reader.size * 0.5);
        // Converting one event reads only the baskets of the branches that
        // event needs
        expect(afterConvert - afterOpen).toBeLessThan(reader.size * 0.25);
        expect(reader.requests).toBeGreaterThan(0);
      } finally {
        await reader.close();
      }
    },
  );

  it.runIf(existsSync(EIC_FILE))('converts a second event without reopening', async () => {
    const reader = await CountingFileReader.open(EIC_FILE);
    try {
      const converter = await Root2DexConverter.open(createByteRangeSource(reader));
      await converter.convertEntry(0);
      const afterFirst = reader.bytesRead;
      await converter.convertEntry(1);
      const secondEventBytes = reader.bytesRead - afterFirst;

      // The second event costs at most what the first one did: the tree
      // metadata is already in hand, and both entries of this two-event file
      // often share the very same baskets
      expect(secondEventBytes).toBeLessThanOrEqual(afterFirst);
    } finally {
      await reader.close();
    }
  });

  it.runIf(existsSync(EIC_FILE))('rejects entries outside the tree', async () => {
    const file = await PodioEventFile.open(EIC_FILE);
    await expect(file.readEntry(['CentralTrackSegments.points_begin'], 99)).rejects.toThrow(
      /outside of the tree/,
    );
  });
});
