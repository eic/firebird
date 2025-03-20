# test_edm4eic.py

import pytest
import os
import json
import uproot
import numpy as np
import awkward as ak
from pyrobird.edm4eic import edm4eic_entry_to_dict
# Helper function to import tracker_hits_to_box_hits
from pyrobird.edm4eic import tracker_hits_to_box_hits

import pytest
from pyrobird.edm4eic import parse_entry_numbers


# Path to the test ROOT file
TEST_ROOT_FILE = os.path.join(os.path.dirname(__file__), 'data', 'reco_2024-09_craterlake_2evt.edm4eic.root')

def test_edm4eic_to_dict_structure():
    # Open the ROOT file
    file = uproot.open(TEST_ROOT_FILE)
    tree = file['events']

    # Convert the first event
    event = edm4eic_entry_to_dict(tree, entry_index=0)

    # Check that the event is a dictionary
    assert isinstance(event, dict), "Event should be a dictionary"

    # Check that the event has 'id' and 'components' keys
    assert 'id' in event, "'id' key missing in event dictionary"
    assert 'components' in event, "'components' key missing in event dictionary"

    # Check that 'components' is a list
    assert isinstance(event['components'], list), "'components' should be a list"

    # Check that each item in 'components' is a dictionary with expected keys
    for component in event['components']:
        assert isinstance(component, dict), "Each component should be a dictionary"
        assert 'name' in component, "'name' key missing in component"
        assert 'type' in component, "'type' key missing in component"
        assert 'originType' in component, "'originType' key missing in component"

        # Check for appropriate data key based on component type
        component_type = component['type']
        if component_type == 'BoxTrackerHit' or 'Hit' in component_type:
            assert 'hits' in component, f"'hits' key missing in component of type {component_type}"
        elif component_type == 'TrackerLinePointTrajectory' or 'Track' in component_type:
            assert 'lines' in component, f"'lines' key missing in component of type {component_type}"
        else:
            # If new component types are added, you might need to add more conditions
            # For now, we'll ensure at least one valid data key exists
            valid_data_keys = ['hits', 'lines', 'particles', 'clusters', 'points']
            assert any(key in component for key in valid_data_keys), \
                f"No valid data key found in component of type {component_type}"

def test_edm4eic_to_dict_values():
    # Open the ROOT file
    file = uproot.open(TEST_ROOT_FILE)
    tree = file['events']

    # Convert the first event
    event = edm4eic_entry_to_dict(tree, entry_index=0)

    # Ensure there is at least one group with hits
    assert len(event['components']) > 0, "No data groups found in event"

    # Get the first group
    group = event['components'][0]
    hits = group['hits']
    assert len(hits) > 0, "No hits found in the first group"

    # Get the first hit
    hit = hits[0]

    # Uncomment and set the expected values based on your data
    assert abs(hit['pos'][0]) > 0
    assert len(hit['pos']) == 3
    assert abs(hit['dim'][0]) > 0
    assert len(hit['dim']) == 3
    assert hit['t'][0] > 0
    assert len(hit['t']) == 2
    assert hit['ed'][0] > 0
    assert len(hit['ed']) == 2


def test_edm4eic_to_dict_multiple_entries():
    # Open the ROOT file
    file = uproot.open(TEST_ROOT_FILE)
    tree = file['events']

    # Loop over events in the ROOT file (assuming there are at least 2 events)
    for entry in range(2):
        event = edm4eic_entry_to_dict(tree, entry_index=entry)

        # Check that the event number matches
        assert event['id'] == entry, f"Event name does not match entry number: {event['id']} != {entry}"

        # Perform the same checks as in the previous test
        assert 'components' in event, "'components' key missing in event dictionary"
        assert isinstance(event['components'], list), "'data' should be a list"
        assert len(event['components']) > 0, "No data groups found in event"

        # Optionally, perform additional checks for each event


def test_tracker_hits_to_box_hits():
    # Open the ROOT file
    file = uproot.open(TEST_ROOT_FILE)
    tree = file['events']

    # Get the list of tracker branches
    tracker_branches = tree.typenames(recursive=False, full_paths=True, filter_typename="vector<edm4eic::TrackerHitData>")

    # Check that there are tracker branches
    assert len(tracker_branches) > 0, "No tracker branches of type vector<edm4eic::TrackerHitData> found"

    # Test the conversion for each tracker branch
    for branch_name in tracker_branches.keys():
        group = tracker_hits_to_box_hits(tree, branch_name, entry_start=0)

        # Check that the group has expected keys
        assert isinstance(group, dict), "Group should be a dictionary"
        assert 'name' in group, "'name' key missing in group"
        assert 'type' in group, "'type' key missing in group"
        assert 'originType' in group, "'originType' key missing in group"
        assert 'hits' in group, "'hits' key missing in group"

        # Check that 'hits' is a list
        assert isinstance(group['hits'], list), "'hits' should be a list"

        # Optionally, check the first hit
        if len(group['hits']) > 0:
            hit = group['hits'][0]
            assert isinstance(hit, dict), "Each hit should be a dictionary"
            # Perform the same checks as before


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
