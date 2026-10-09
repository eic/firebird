/**
 * Entry selections: the browser converter must treat selections the way the
 * pyrobird convert endpoint does (clamp to the file with one warning, reject
 * an oversized request or one with no entry in the file), with the same
 * messages, and must never expand a selection before its size is checked and
 * its ranges are clamped.
 */

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_MAX_ENTRIES,
  EntrySelectionError,
  clampRanges,
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

  it('clamps a huge selection to the file without expanding it, also with no cap', () => {
    const started = performance.now();
    expect(selectEntries(parseEntryRanges('0-1000000000000'), 3)).toEqual({
      entries: [0, 1, 2],
      warning: 'Event 3-1000000000000 is out of range: the file holds 3 events (0..2); converting 0-2',
    });
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('counts the request before the clamp: an oversized request stays rejected', () => {
    expect(() => selectEntries(parseEntryRanges('0-1999'), 10, DEFAULT_MAX_ENTRIES))
      .toThrow('The selection names 2000 entries; at most 1000 are allowed per request.');
  });

  it('drops the entries outside the file with one warning, as pyrobird does', () => {
    expect(selectEntries(parseEntryRanges('0-5'), 2)).toEqual({
      entries: [0, 1],
      warning: 'Event 2-5 is out of range: the file holds 2 events (0..1); converting 0-1',
    });
    expect(selectEntries(parseEntryRanges('-2-1'), 2)).toEqual({
      entries: [0, 1],
      warning: 'Event -2--1 is out of range: the file holds 2 events (0..1); converting 0-1',
    });
    expect(selectEntries(parseEntryRanges('4,9,1-2,1'), 5)).toEqual({
      entries: [4, 1, 2, 1],
      warning: 'Event 9 is out of range: the file holds 5 events (0..4); converting 4, 1-2, 1',
    });
  });

  it('rejects a selection with no entry in the file, naming the entry count', () => {
    expect(() => selectEntries(parseEntryRanges('50-60'), 10))
      .toThrow('Event 50-60 is out of range: the file holds 10 events (0..9)');
    expect(() => selectEntries(parseEntryRanges('0'), 0))
      .toThrow('Event 0 is out of range: the file holds no events');
    expect(() => selectEntries(parseEntryRanges('9'), 2)).toThrow(EntrySelectionError);
  });

  it('selects nothing from an empty selection, without a warning', () => {
    expect(selectEntries([], 5)).toEqual({ entries: [], warning: null });
  });

  it('clamps ranges to the file in the order given', () => {
    expect(clampRanges([[-2, 1], [3, 9], [7, 8]], 5)).toEqual([[0, 1], [3, 4]]);
    expect(clampRanges([[5, 9]], 5)).toEqual([]);
  });

  it('lists at most five offending ranges', () => {
    const ranges = parseEntryRanges('10,11,12,13,14,15,16');
    expect(formatRanges(outOfRangeParts(ranges, 2)))
      .toBe('10, 11, 12, 13, 14 (and 2 more)');
  });

  it('expands an in-range selection in the requested order, repeats included', () => {
    const ranges = parseEntryRanges('3,0-1,3');
    expect(countEntries(ranges)).toBe(4);
    expect(selectEntries(ranges, 4, DEFAULT_MAX_ENTRIES)).toEqual({ entries: [3, 0, 1, 3], warning: null });
  });
});

describe('convertRootToDex', () => {
  it.runIf(existsSync(EIC_FILE))('converts the entries the file holds and warns once about the rest', async () => {
    const warnings: string[] = [];
    const dex = await convertRootToDex(EIC_FILE, '0-5', { onWarning: message => warnings.push(message) });
    expect(dex.events.map(event => event.id)).toEqual([0, 1]);
    expect(warnings).toEqual(['Event 2-5 is out of range: the file holds 2 events (0..1); converting 0-1']);
  });

  it.runIf(existsSync(EIC_FILE))('rejects a selection with no entry in the file before converting', async () => {
    await expect(convertRootToDex(EIC_FILE, '50-60'))
      .rejects.toThrow('Event 50-60 is out of range: the file holds 2 events (0..1)');
  });
});
