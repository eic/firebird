/**
 * Entry selections: the browser converter must reject the same selections as
 * the pyrobird convert endpoint, with the same message, and must never expand
 * a selection before its size and bounds are checked.
 */

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_MAX_ENTRIES,
  EntrySelectionError,
  countEntries,
  formatRanges,
  outOfRangeParts,
  parseEntryRanges,
  selectEntries,
} from './entries';
import { convertRootToDex, parseEntryNumbers } from './convert';

const REPO = resolve(__dirname, '../../..');
const EIC_FILE = resolve(
  REPO,
  'pyrobird/tests/unit_tests/data/reco_2024-09_craterlake_2evt.edm4eic.root',
);

describe('parseEntryRanges', () => {
  it('keeps ranges as pairs; parseEntryNumbers is their expansion', () => {
    expect(parseEntryRanges('1,2-5,8')).toEqual([[1, 1], [2, 5], [8, 8]]);
    expect(parseEntryNumbers('1,2-5,8')).toEqual([1, 2, 3, 4, 5, 8]);
    expect(parseEntryRanges('0-20000000')).toEqual([[0, 20000000]]);
  });

  it('rejects text outside the grammar', () => {
    expect(() => parseEntryRanges('a-b')).toThrow(/Invalid entry format/);
    expect(() => parseEntryRanges('5-1')).toThrow(/start must be <= end/);
  });
});

describe('selectEntries', () => {
  it('rejects a huge selection by its size before expanding it', () => {
    const started = performance.now();
    expect(() => selectEntries(parseEntryRanges('0-1000000000000'), 3, DEFAULT_MAX_ENTRIES))
      .toThrow('The selection names 1000000000001 entries; at most 1000 are allowed per request.');
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('rejects a huge out-of-range selection without expanding it, also with no cap', () => {
    const started = performance.now();
    expect(() => selectEntries(parseEntryRanges('0-1000000000000'), 3))
      .toThrow('Event 3-1000000000000 is out of range: the file holds 3 events (0..2)');
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('rejects the whole selection when any entry is outside the file, as pyrobird does', () => {
    expect(() => selectEntries(parseEntryRanges('0-5'), 2))
      .toThrow('Event 2-5 is out of range: the file holds 2 events (0..1)');
    expect(() => selectEntries(parseEntryRanges('-2-1'), 2))
      .toThrow('Event -2--1 is out of range: the file holds 2 events (0..1)');
    expect(() => selectEntries(parseEntryRanges('0'), 0))
      .toThrow('Event 0 is out of range: the file holds no events');
    expect(() => selectEntries(parseEntryRanges('9'), 2)).toThrow(EntrySelectionError);
  });

  it('lists at most five offending ranges', () => {
    const ranges = parseEntryRanges('10,11,12,13,14,15,16');
    expect(formatRanges(outOfRangeParts(ranges, 2)))
      .toBe('10, 11, 12, 13, 14 (and 2 more)');
  });

  it('expands an in-range selection in the requested order, repeats included', () => {
    const ranges = parseEntryRanges('3,0-1,3');
    expect(countEntries(ranges)).toBe(4);
    expect(selectEntries(ranges, 4, DEFAULT_MAX_ENTRIES)).toEqual([3, 0, 1, 3]);
  });
});

describe('convertRootToDex', () => {
  it.runIf(existsSync(EIC_FILE))('rejects entries outside the file before converting', async () => {
    await expect(convertRootToDex(EIC_FILE, '0-5'))
      .rejects.toThrow('Event 2-5 is out of range: the file holds 2 events (0..1)');
  });
});
