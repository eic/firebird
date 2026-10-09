import time

import pytest

from pyrobird.edm4eic import parse_entry_numbers
from pyrobird.entries import (parse_entry_ranges, count_entries, format_ranges, out_of_range_parts,
                              clamp_ranges, select_entries, shorten, EntrySelectionError)


@pytest.mark.parametrize("value, expected", [
    ('3', [(3, 3)]),
    ('1-5', [(1, 5)]),
    ('1,2,3', [(1, 1), (2, 2), (3, 3)]),
    ('1,2-5,8', [(1, 1), (2, 5), (8, 8)]),
    (' 1 - 3 ', [(1, 3)]),
])
def test_parse_entry_ranges(value, expected):
    assert parse_entry_ranges(value) == expected


@pytest.mark.parametrize("value", ['5-1', 'abc', '1,a,3', '', '1,,2', '-1', '1-2-3'])
def test_parse_entry_ranges_invalid(value):
    with pytest.raises(ValueError, match="Invalid entry format"):
        parse_entry_ranges(value)


@pytest.mark.parametrize("value", ['3', '1-5', '1,2,3', '1,2-5,8', '0', '7-7', '0,0'])
def test_parse_entry_numbers_matches_ranges(value):
    """parse_entry_numbers is the expansion of parse_entry_ranges: one grammar."""
    expanded = []
    for start, end in parse_entry_ranges(value):
        expanded.extend(range(start, end + 1))
    assert parse_entry_numbers(value) == expanded


def test_huge_range_is_not_expanded():
    started = time.perf_counter()
    ranges = parse_entry_ranges('0-1000000000000')
    assert count_entries(ranges) == 1000000000001
    assert out_of_range_parts(ranges, 10) == [(10, 1000000000000)]
    with pytest.raises(EntrySelectionError, match="1000000000001 entries; at most 1000"):
        select_entries(ranges, 10, max_count=1000)
    assert time.perf_counter() - started < 1.0


def test_select_entries_in_range():
    assert select_entries(parse_entry_ranges('0,2-3'), 5) == ([0, 2, 3], None)


def test_select_entries_clamps_to_the_file_with_one_warning():
    """Entries outside the file are dropped and summarized once, as the browser converter does."""
    selection = select_entries(parse_entry_ranges('0-5'), 2)
    assert selection.entries == [0, 1]
    assert selection.warning == "Event 2-5 is out of range: the file holds 2 events (0..1); converting 0-1"


def test_select_entries_clamps_huge_range_without_expanding_it():
    started = time.perf_counter()
    selection = select_entries(parse_entry_ranges('3-1000000000000'), 5)
    assert selection.entries == [3, 4]
    assert "Event 5-1000000000000 is out of range" in selection.warning
    assert time.perf_counter() - started < 1.0


def test_select_entries_keeps_requested_order_and_repeats():
    selection = select_entries(parse_entry_ranges('4,9,1-2,1'), 5)
    assert selection.entries == [4, 1, 2, 1]
    assert selection.warning == "Event 9 is out of range: the file holds 5 events (0..4); converting 4, 1-2, 1"


def test_select_entries_with_no_entry_in_the_file_is_an_error():
    with pytest.raises(EntrySelectionError) as info:
        select_entries(parse_entry_ranges('50-60'), 10)
    assert str(info.value) == "Event 50-60 is out of range: the file holds 10 events (0..9)"


def test_select_entries_empty_file():
    with pytest.raises(EntrySelectionError, match="the file holds no events"):
        select_entries(parse_entry_ranges('0'), 0)


def test_size_limit_counts_the_request_before_the_clamp():
    """The cap guards the request itself: '0-1999' on a 10-entry file stays rejected."""
    with pytest.raises(EntrySelectionError, match="2000 entries; at most 1000"):
        select_entries(parse_entry_ranges('0-1999'), 10, max_count=1000)


def test_select_entries_of_an_empty_selection_is_empty():
    assert select_entries([], 5) == ([], None)


def test_clamp_ranges():
    assert clamp_ranges([(-2, 1), (3, 9), (7, 8)], 5) == [(0, 1), (3, 4)]
    assert clamp_ranges([(5, 9)], 5) == []


def test_out_of_range_parts_negative_and_high():
    assert out_of_range_parts([(-2, 10)], 5) == [(-2, -1), (5, 10)]
    assert out_of_range_parts([(1, 3)], 5) == []


def test_error_listing_is_truncated():
    ranges = parse_entry_ranges('10,12,14,16,18,20,22,24')
    with pytest.raises(EntrySelectionError) as info:
        select_entries(ranges, 5)
    assert "Event 10, 12, 14, 16, 18 (and 3 more) is out of range" in str(info.value)


def test_warning_listing_is_truncated():
    selection = select_entries(parse_entry_ranges('0,10,12,14,16,18,20,22,24'), 5)
    assert selection.entries == [0]
    assert selection.warning.startswith("Event 10, 12, 14, 16, 18 (and 3 more) is out of range")


def test_format_ranges():
    assert format_ranges([(1, 1), (3, 5)]) == "1, 3-5"


def test_shorten():
    assert shorten('abc', 5) == 'abc'
    assert shorten('a' * 10, 5) == 'aaaaa...'
