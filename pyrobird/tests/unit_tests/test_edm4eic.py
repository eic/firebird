# test_edm4eic.py

import os

import pytest
import uproot

from pyrobird.dex import validate_dex
from pyrobird.edm4eic import (
    edm4eic_entry_to_dict,
    edm4eic_to_dex_dict,
    parse_entry_numbers,
    tracker_hits_to_box_hits,
)

# Path to the test ROOT file
TEST_ROOT_FILE = os.path.join(os.path.dirname(__file__), 'data', 'reco_2024-09_craterlake_2evt.edm4eic.root')


def open_events_tree():
    return uproot.open(TEST_ROOT_FILE)['events']


def test_edm4eic_to_dict_structure():
    tree = open_events_tree()
    event = edm4eic_entry_to_dict(tree, entry_index=0)

    assert isinstance(event, dict)
    assert 'id' in event
    assert isinstance(event['pieces'], list)

    for piece in event['pieces']:
        assert isinstance(piece, dict)
        assert isinstance(piece['name'], str)
        assert isinstance(piece['type'], str)
        assert isinstance(piece['version'], str)
        assert 'origin' in piece
        assert isinstance(piece['count'], int)
        assert isinstance(piece['columns'], dict)

        if piece['type'] == 'BoxHit':
            columns = piece['columns']
            # pos/dim are flat xyz triplets, scalar columns hold count values
            assert len(columns['pos']) == 3 * piece['count']
            assert len(columns['dim']) == 3 * piece['count']
            for scalar in ('time', 'timeError', 'edep', 'edepError'):
                assert len(columns[scalar]) == piece['count']

        if piece['type'] == 'PointTrajectory':
            assert piece['pointColumns'] == ['x', 'y', 'z', 't', 'dx', 'dy', 'dz', 'dt']
            assert len(piece['points']) == piece['count']
            for column in piece['columns'].values():
                assert len(column) == piece['count']


def test_edm4eic_to_dict_values():
    tree = open_events_tree()
    event = edm4eic_entry_to_dict(tree, entry_index=0)

    assert len(event['pieces']) > 0

    box_piece = next(p for p in event['pieces'] if p['type'] == 'BoxHit' and p['count'] > 0)
    columns = box_piece['columns']
    # First hit: id 0 == index 0 in every column
    assert abs(columns['pos'][0]) > 0
    assert abs(columns['dim'][0]) > 0
    assert columns['time'][0] > 0
    assert columns['edep'][0] > 0


def test_edm4eic_to_dict_multiple_entries():
    tree = open_events_tree()

    for entry in range(2):
        event = edm4eic_entry_to_dict(tree, entry_index=entry)
        assert event['id'] == entry
        assert isinstance(event['pieces'], list)
        assert len(event['pieces']) > 0


def test_edm4eic_to_dex_dict_validates():
    tree = open_events_tree()
    result = edm4eic_to_dex_dict(tree, [0, 1], origin_info={'file': 'test'})

    assert result['type'] == 'firebird-dex-json'
    assert result['version'] == '1.0'
    assert result['origin'] == {'file': 'test'}
    assert len(result['events']) == 2
    # raises on structural problems (column lengths, refs, ragged sizes)
    validate_dex(result)


def test_tracker_hits_to_box_hits():
    tree = open_events_tree()
    tracker_branches = tree.typenames(recursive=False, full_paths=True, filter_typename="vector<edm4eic::TrackerHitData>")
    assert len(tracker_branches) > 0

    for branch_name in tracker_branches.keys():
        piece = tracker_hits_to_box_hits(tree, branch_name, entry_start=0)
        assert piece['name'] == branch_name
        assert piece['type'] == 'BoxHit'
        assert piece['origin']['type'] == 'edm4eic::TrackerHitData'
        assert len(piece['columns']['pos']) == 3 * piece['count']


@pytest.mark.parametrize("input_value, expected", [
    ('3', [3]),
    ('1-5', [1, 2, 3, 4, 5]),
    ('1,2,3', [1, 2, 3]),
    ('1,2-5,8', [1, 2, 3, 4, 5, 8]),
    ([1, 2, 3], [1, 2, 3]),
    ((1, 2, 3), [1, 2, 3]),
    ({1, 2, 3}, [1, 2, 3]),
])
def test_parse_entry_numbers_valid_inputs(input_value, expected):
    assert parse_entry_numbers(input_value) == expected


@pytest.mark.parametrize("input_value", [
    ('5-1'),
    ('abc'),
    ('1,a,3'),
])
def test_parse_entry_numbers_invalid_inputs(input_value):
    with pytest.raises(ValueError):
        parse_entry_numbers(input_value)
