# This file is part of Firebird Event Display and is licensed under GPL-3.0-or-later.
# See the LICENSE file in the project root for full license information.
"""Entry-number selections such as '3', '1-5' or '1,2-5,8'.

The parser keeps ranges as (start, end) pairs, so a request like '0-20000000'
costs nothing until its size and bounds are checked. Expand a selection only
through `select_entries`, which checks the size and clamps the ranges to the
file first.
"""
from typing import List, NamedTuple, Optional, Sequence, Tuple

EntryRange = Tuple[int, int]

# How many offending entries an out-of-range message lists before it truncates.
MAX_LISTED_RANGES = 5


class EntrySelectionError(ValueError):
    """A selection names entries that the file does not hold, or too many entries."""


def _invalid_format(value) -> ValueError:
    return ValueError(f"Invalid entry format: '{value}'. Expected integers or ranges like '1-5'.")


def _parse_range(text: str) -> EntryRange:
    """Parses 'a-b' into (a, b). Raises ValueError for anything else or for a > b."""
    start, end = map(int, text.split('-'))
    if start > end:
        raise ValueError(f"Invalid range '{text}': start must be <= end.")
    return start, end


def parse_entry_ranges(value: str) -> List[EntryRange]:
    """Parses an entry selection string into inclusive (start, end) ranges.

    Accepts the grammar of `pyrobird convert --entries`: a single integer
    ('3'), a range ('1-5'), or a comma-separated list of both ('1,2-5,8').
    A single entry becomes (n, n). Nothing is expanded.

    Parameters
    ----------
    value : str
        The selection as typed by the user.

    Returns
    -------
    list of tuple of int
        Inclusive ranges in the order given.

    Raises
    ------
    ValueError
        If the string does not follow the grammar, or a range has start > end.
    """
    try:
        # A bare range, e.g. "1-5"
        if '-' in value and ',' not in value:
            return [_parse_range(value)]

        # A comma-separated list, e.g. "1,2-5,8"
        if ',' in value:
            ranges = []
            for part in value.split(','):
                part = part.strip()
                if '-' in part:
                    ranges.append(_parse_range(part))
                else:
                    number = int(part)
                    ranges.append((number, number))
            return ranges

        # A single integer
        number = int(value)
        return [(number, number)]
    except ValueError:
        raise _invalid_format(value) from None


def count_entries(ranges: Sequence[EntryRange]) -> int:
    """Returns how many entries the ranges name, counting repeats, without expanding them."""
    return sum(end - start + 1 for start, end in ranges)


def shorten(text: str, limit: int = 60) -> str:
    """Cuts `text` to `limit` characters for messages that echo user input."""
    text = str(text)
    return text if len(text) <= limit else text[:limit] + "..."


def format_ranges(ranges: Sequence[EntryRange], limit: int = MAX_LISTED_RANGES) -> str:
    """Formats ranges as '3, 7-9, 12'; lists at most `limit` items, then '(and N more)'."""
    items = [str(start) if start == end else f"{start}-{end}" for start, end in ranges]
    if len(items) > limit:
        return ", ".join(items[:limit]) + f" (and {len(items) - limit} more)"
    return ", ".join(items)


def out_of_range_parts(ranges: Sequence[EntryRange], num_entries: int) -> List[EntryRange]:
    """Returns the parts of `ranges` that fall outside 0..num_entries-1, without expanding."""
    last = num_entries - 1
    outside = []
    for start, end in ranges:
        if start < 0:
            outside.append((start, min(end, -1)))
        if end > last:
            outside.append((max(start, last + 1, 0), end))
    return outside


def clamp_ranges(ranges: Sequence[EntryRange], num_entries: int) -> List[EntryRange]:
    """Returns the parts of `ranges` inside 0..num_entries-1, in the order given, without expanding."""
    last = num_entries - 1
    inside = []
    for start, end in ranges:
        start, end = max(start, 0), min(end, last)
        if start <= end:
            inside.append((start, end))
    return inside


class EntrySelection(NamedTuple):
    """The entries a selection converts, and the warning about entries the file does not hold."""

    entries: List[int]
    """Entry indexes in the order requested, repeats included."""

    warning: Optional[str]
    """One summary of the requested entries outside the file, or None when all exist."""


def select_entries(ranges: Sequence[EntryRange], num_entries: int,
                   max_count: Optional[int] = None) -> EntrySelection:
    """Checks ranges against a file, clamps them to its entries and expands them.

    Applies one policy, the same one the in-browser converter uses: requested
    entries outside 0..num_entries-1 are dropped, and one warning lists them
    with what remains. A selection with no entry in the file is an error that
    names the file's entry count. The size limit applies to the selection as
    requested, before clamping, so an oversized request fails before anything
    is read or expanded.

    Parameters
    ----------
    ranges : sequence of tuple of int
        Inclusive ranges, as returned by `parse_entry_ranges`.
    num_entries : int
        Number of entries the file holds.
    max_count : int, optional
        Upper bound on the number of requested entries. None means no bound.

    Returns
    -------
    EntrySelection
        The entry indexes in the order requested, and the warning when some
        requested entries are outside the file.

    Raises
    ------
    EntrySelectionError
        If the selection names more than `max_count` entries, or no entry
        inside the file.
    """
    count = count_entries(ranges)
    if max_count is not None and count > max_count:
        raise EntrySelectionError(
            f"The selection names {count} entries; at most {max_count} are allowed per request.")

    outside = out_of_range_parts(ranges, num_entries)
    inside = clamp_ranges(ranges, num_entries)
    holds = (f"the file holds {num_entries} events (0..{num_entries - 1})"
             if num_entries > 0 else "the file holds no events")
    if outside and not inside:
        raise EntrySelectionError(f"Event {format_ranges(outside)} is out of range: {holds}")

    warning = None
    if outside:
        warning = f"Event {format_ranges(outside)} is out of range: {holds}; converting {format_ranges(inside)}"

    entries: List[int] = []
    for start, end in inside:
        entries.extend(range(start, end + 1))
    return EntrySelection(entries, warning)
