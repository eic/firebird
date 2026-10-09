/**
 * Entry-number selections such as '3', '1-5' or '1,2-5,8'.
 *
 * The parser keeps ranges as [start, end] pairs, so a request like
 * '0-20000000' costs nothing until its size and bounds are checked. Expand a
 * selection only through `selectEntries()`, which checks the size and clamps
 * the ranges to the file first. The rules and the messages match
 * `pyrobird/entries.py`, so the browser converter and the pyrobird convert
 * endpoint treat the same selections the same way, with the same words.
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

/** The parts of `ranges` inside 0..entryCount-1, in the order given, without expanding. */
export function clampRanges(ranges: readonly EntryRange[], entryCount: number): EntryRange[] {
  const inside: EntryRange[] = [];
  for (const [start, end] of ranges) {
    const clampedStart = Math.max(start, 0);
    const clampedEnd = Math.min(end, entryCount - 1);
    if (clampedStart <= clampedEnd) inside.push([clampedStart, clampedEnd]);
  }
  return inside;
}

/** The entries a selection converts, and the warning about entries the file does not hold. */
export interface EntrySelection {
  /** Entry numbers in the order requested, repeats included. */
  entries: number[];
  /** One summary of the requested entries outside the file, or null when all exist. */
  warning: string | null;
}

/**
 * Checks ranges against a file, clamps them to its entries and expands them.
 *
 * Requested entries outside 0..entryCount-1 are dropped, and one warning
 * lists them with what remains. A selection with no entry in the file is an
 * error that names the file's entry count. `maxCount` applies to the
 * selection as requested, before clamping, so an oversized request fails
 * before anything is expanded.
 *
 * @param ranges Inclusive ranges, as returned by `parseEntryRanges()`.
 * @param entryCount Number of entries the file holds.
 * @param maxCount Upper bound on the number of requested entries; undefined means none.
 * @returns The entry numbers in the order requested, and the warning when
 *   some requested entries are outside the file.
 * @throws EntrySelectionError when the selection is too large or names no
 *   entry in the file.
 */
export function selectEntries(
  ranges: readonly EntryRange[],
  entryCount: number,
  maxCount?: number,
): EntrySelection {
  const count = countEntries(ranges);
  if (maxCount !== undefined && count > maxCount) {
    throw new EntrySelectionError(
      `The selection names ${count} entries; at most ${maxCount} are allowed per request.`,
    );
  }
  const outside = outOfRangeParts(ranges, entryCount);
  const inside = clampRanges(ranges, entryCount);
  const holds = entryCount > 0
    ? `the file holds ${entryCount} events (0..${entryCount - 1})`
    : 'the file holds no events';
  if (outside.length && inside.length === 0) {
    throw new EntrySelectionError(`Event ${formatRanges(outside)} is out of range: ${holds}`);
  }
  const warning = outside.length
    ? `Event ${formatRanges(outside)} is out of range: ${holds}; converting ${formatRanges(inside)}`
    : null;
  const entries: number[] = [];
  for (const [start, end] of inside) {
    for (let entry = start; entry <= end; entry++) entries.push(entry);
  }
  return { entries, warning };
}
