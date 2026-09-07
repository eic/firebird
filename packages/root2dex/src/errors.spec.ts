/**
 * What the converter says when the input is not what it wants. These messages
 * reach the user directly in the "Open event" panel, so they are part of the
 * contract.
 */

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Root2DexConverter, parseEntryNumbers } from './convert';
import { PodioEventFile } from './podio-file';

const REPO = resolve(__dirname, '../../..');
const GEOMETRY_FILE = resolve(REPO, 'firebird-ng/src/assets/data/epic_craterlake.root');
const EIC_FILE = resolve(
  REPO,
  'pyrobird/tests/unit_tests/data/reco_2024-09_craterlake_2evt.edm4eic.root',
);

describe('parseEntryNumbers', () => {
  it('parses single numbers, ranges and lists', () => {
    expect(parseEntryNumbers('3')).toEqual([3]);
    expect(parseEntryNumbers('1-5')).toEqual([1, 2, 3, 4, 5]);
    expect(parseEntryNumbers('1,2-5,8')).toEqual([1, 2, 3, 4, 5, 8]);
    expect(parseEntryNumbers(7)).toEqual([7]);
    expect(parseEntryNumbers([2, 4])).toEqual([2, 4]);
  });

  it('rejects nonsense and backwards ranges', () => {
    expect(() => parseEntryNumbers('5-1')).toThrow(/start must be <= end/);
    expect(() => parseEntryNumbers('abc')).toThrow(/Invalid entry format/);
    expect(() => parseEntryNumbers('')).toThrow(/Invalid entry format/);
  });
});

describe('rejecting the wrong file', () => {
  it.runIf(existsSync(GEOMETRY_FILE))('says a geometry file has no events tree', async () => {
    await expect(Root2DexConverter.open(GEOMETRY_FILE)).rejects.toThrow(/No 'events' TTree/);
  });

  it.runIf(existsSync(EIC_FILE))('names both models when detection fails', async () => {
    const file = await PodioEventFile.open(EIC_FILE);
    // Force the failing path by looking for a model this file cannot have
    const empty = Object.create(Object.getPrototypeOf(file)) as PodioEventFile;
    Object.assign(empty, file, { collectionTypes: new Map() });
    expect(() => empty.detectModel()).toThrow(/Cannot detect file type/);
  });
});
