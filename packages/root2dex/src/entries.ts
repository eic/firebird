/**
 * Entry-number selections such as '3', '1-5' or '1,2-5,8'.
 *
 * The parser keeps ranges as [start, end] pairs, so a request like
 * '0-20000000' costs nothing until its size and bounds are checked. Expand a
 * selection only after `selectEntries()` has validated it. The rules and the
 * messages match `pyrobird/entries.py`, so the browser converter and the
 * pyrobird convert endpoint reject the same selections with the same words.
 */

/** An inclusive range of entry numbers. */
export type EntryRange = readonly [start: number, end: number];

/** How many offending ranges an out-of-range message lists before it truncates. */
export const MAX_LISTED_RANGES = 5;

/** The most entries one conversion may name; pyrobird's default cap too. */
export const DEFAULT_MAX_ENTRIES = 1000;

/** A selection names entries that the file does not hold, or too many entries. */
export class EntrySelectionError extends RangeError {
  override name = 'EntrySelectionError';
}

function invalidFormat(value: string): Error {
  return new Error(`Invalid entry format: '${value}'. Expected integers or ranges like '1-5'.`);
}

/**
 * Parses entry numbers written as '3', '1-5', or '1,2-5,8' into inclusive
 * ranges, in the order given. A single entry becomes [n, n]. Nothing is
 * expanded.
 *
 * @throws Error when the text does not follow the grammar, or a range has
 *   start > end.
 */
export function parseEntryRanges(value: string): EntryRange[] {
  const parseInteger = (text: string): number => {
    const trimmed = text.trim();
    if (!/^[+-]?\d+$/.test(trimmed)) throw invalidFormat(value);
    return Number(trimmed);
  };

  const ranges: EntryRange[] = [];
  for (const part of value.split(',')) {
    const text = part.trim();
    if (!text) continue;
    // A hyphen after the first character is a range separator; a leading one is a sign
    const separator = text.indexOf('-', 1);
    if (separator > 0) {
      const start = parseInteger(text.slice(0, separator));
      const end = parseInteger(text.slice(separator + 1));
      if (start > end) throw new Error(`Invalid range '${text}': start must be <= end.`);
      ranges.push([start, end]);
    } else {
      const entry = parseInteger(text);
      ranges.push([entry, entry]);
    }
  }
  if (ranges.length === 0) throw invalidFormat(value);
  return ranges;
}

/** How many entries the ranges name, counting repeats, without expanding them. */
export function countEntries(ranges: readonly EntryRange[]): number {
  return ranges.reduce((sum, [start, end]) => sum + end - start + 1, 0);
}

/** Formats ranges as '3, 7-9, 12'; lists at most `limit` items, then '(and N more)'. */
export function formatRanges(ranges: readonly EntryRange[], limit = MAX_LISTED_RANGES): string {
  const items = ranges.map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`));
  if (items.length > limit) {
    return `${items.slice(0, limit).join(', ')} (and ${items.length - limit} more)`;
  }
  return items.join(', ');
}

/** The parts of `ranges` outside 0..entryCount-1, without expanding. */
export function outOfRangeParts(ranges: readonly EntryRange[], entryCount: number): EntryRange[] {
  const last = entryCount - 1;
  const outside: EntryRange[] = [];
  for (const [start, end] of ranges) {
    if (start < 0) outside.push([start, Math.min(end, -1)]);
    if (end > last) outside.push([Math.max(start, last + 1, 0), end]);
  }
  return outside;
}

/**
 * Validates ranges against a file and expands them into entry numbers.
 *
 * When the selection names more than `maxCount` entries, or any entry
 * outside 0..entryCount-1, the whole selection is rejected before anything
 * is expanded, and the message lists the offending entries.
 *
 * @param ranges Inclusive ranges, as returned by `parseEntryRanges()`.
 * @param entryCount Number of entries the file holds.
 * @param maxCount Upper bound on the number of entries; undefined means none.
 * @returns The entry numbers in the order requested.
 * @throws EntrySelectionError when the selection is too large or out of range.
 */
export function selectEntries(
  ranges: readonly EntryRange[],
  entryCount: number,
  maxCount?: number,
): number[] {
  const count = countEntries(ranges);
  if (maxCount !== undefined && count > maxCount) {
    throw new EntrySelectionError(
      `The selection names ${count} entries; at most ${maxCount} are allowed per request.`,
    );
  }
  const outside = outOfRangeParts(ranges, entryCount);
  if (outside.length) {
    const holds = entryCount > 0
      ? `the file holds ${entryCount} events (0..${entryCount - 1})`
      : 'the file holds no events';
    throw new EntrySelectionError(`Event ${formatRanges(outside)} is out of range: ${holds}`);
  }
  const entries: number[] = [];
  for (const [start, end] of ranges) {
    for (let entry = start; entry <= end; entry++) entries.push(entry);
  }
  return entries;
}
