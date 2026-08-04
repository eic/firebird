import json
import os
import tempfile
import pytest
from click.testing import CliRunner
from pyrobird.cli.merge import merge, merge_event_pieces, create_merged_header
from pyrobird.dex_utils import is_valid_dex_file


def box_hit_piece(name, pos, dim):
    """One-hit BoxHit piece in DEX v1 columnar layout."""
    return {
        "name": name,
        "type": "BoxHit",
        "version": "1.0",
        "origin": {"type": "edm4eic::TrackerHitData"},
        "count": 1,
        "columns": {"pos": pos, "dim": dim, "time": [0], "edep": [0.001]},
    }


# Sample Firebird DEX JSON data for testing
SAMPLE_DEX_1 = {
    "type": "firebird-dex-json",
    "version": "1.0",
    "origin": {
        "file": "sample1.root",
        "entries_count": 2
    },
    "events": [
        {
            "id": "event_0",
            "pieces": [box_hit_piece("BarrelVertexHits", [1, 2, 3], [0.1, 0.1, 0.1])]
        },
        {
            "id": "event_1",
            "pieces": [
                {
                    "name": "BarrelTracks",
                    "type": "PointTrajectory",
                    "version": "1.0",
                    "origin": {"type": "edm4eic::TrackSegmentData"},
                    "count": 0,
                    "columns": {},
                    "pointColumns": ["x", "y", "z", "t"],
                    "points": []
                }
            ]
        }
    ]
}

SAMPLE_DEX_2 = {
    "type": "firebird-dex-json",
    "version": "1.0",
    "origin": {
        "file": "sample2.root",
        "entries_count": 2
    },
    "events": [
        {
            "id": "event_0",
            "pieces": [box_hit_piece("EndcapVertexHits", [10, 20, 30], [0.2, 0.2, 0.2])]
        },
        {
            "id": "event_2",
            "pieces": [
                {
                    "name": "EndcapTracks",
                    "type": "PointTrajectory",
                    "version": "1.0",
                    "origin": {"type": "edm4eic::TrackSegmentData"},
                    "count": 0,
                    "columns": {},
                    "pointColumns": ["x", "y", "z", "t"],
                    "points": []
                }
            ]
        }
    ]
}

# Sample with conflicting piece names
SAMPLE_DEX_CONFLICT = {
    "type": "firebird-dex-json",
    "version": "1.0",
    "events": [
        {
            "id": "event_0",
            # Same piece name as in SAMPLE_DEX_1
            "pieces": [box_hit_piece("BarrelVertexHits", [100, 200, 300], [1, 1, 1])]
        }
    ]
}

# Invalid DEX format (missing required fields)
INVALID_DEX = {
    "version": "1.0",
    "events": [
        {
            "id": "event_0",
            # Missing "pieces" field
        }
    ]
}


@pytest.fixture
def temp_dex_files():
    """Create temporary DEX files for testing."""
    with tempfile.TemporaryDirectory() as tmpdirname:
        file1_path = os.path.join(tmpdirname, "sample1.firebird.json")
        file2_path = os.path.join(tmpdirname, "sample2.firebird.json")
        conflict_path = os.path.join(tmpdirname, "conflict.firebird.json")
        invalid_path = os.path.join(tmpdirname, "invalid.firebird.json")
        output_path = os.path.join(tmpdirname, "output.firebird.json")

        with open(file1_path, 'w') as f:
            json.dump(SAMPLE_DEX_1, f)

        with open(file2_path, 'w') as f:
            json.dump(SAMPLE_DEX_2, f)

        with open(conflict_path, 'w') as f:
            json.dump(SAMPLE_DEX_CONFLICT, f)

        with open(invalid_path, 'w') as f:
            json.dump(INVALID_DEX, f)

        yield {
            "file1": file1_path,
            "file2": file2_path,
            "conflict": conflict_path,
            "invalid": invalid_path,
            "output": output_path
        }


def test_basic_merge(temp_dex_files):
    """Test basic merging of two compatible DEX files."""
    runner = CliRunner()
    result = runner.invoke(merge, [temp_dex_files["file1"], temp_dex_files["file2"], "-o", temp_dex_files["output"]])

    assert result.exit_code == 0

    # Check that the output file exists
    assert os.path.exists(temp_dex_files["output"])

    # Load and verify the merged content
    with open(temp_dex_files["output"], 'r') as f:
        merged_data = json.load(f)

    # Verify the header structure
    assert merged_data["type"] == "firebird-dex-json"
    assert merged_data["version"] == "1.0"

    # Check origin metadata
    assert "origin" in merged_data
    assert "merged_from" in merged_data["origin"]
    assert len(merged_data["origin"]["merged_from"]) == 2
    assert merged_data["origin"]["entries_count"] == 4  # Total from both files

    # Verify merged events
    assert len(merged_data["events"]) == 3  # All events from both files

    # Check that the events have been properly merged
    event_ids = [event["id"] for event in merged_data["events"]]
    assert "event_0" in event_ids
    assert "event_1" in event_ids
    assert "event_2" in event_ids

    # Check the pieces in the first event (which exists in both files)
    for event in merged_data["events"]:
        if event["id"] == "event_0":
            # This event should have pieces from both files
            piece_names = [piece["name"] for piece in event["pieces"]]
            assert "BarrelVertexHits" in piece_names
            assert "EndcapVertexHits" in piece_names
            assert len(event["pieces"]) == 2


def test_reset_id_flag(temp_dex_files):
    """Test merging with reset-id flag."""
    runner = CliRunner()
    result = runner.invoke(merge, ["--reset-id", temp_dex_files["file1"], temp_dex_files["file2"], "-o", temp_dex_files["output"]])

    assert result.exit_code == 0

    # Load and verify the merged content
    with open(temp_dex_files["output"], 'r') as f:
        merged_data = json.load(f)

    # With reset-id, events should have been merged by position
    assert len(merged_data["events"]) == 2  # File1.event0 + File2.event0, File1.event1 + File2.event1

    # First event should have pieces from both first events
    first_event = merged_data["events"][0]
    piece_names = [piece["name"] for piece in first_event["pieces"]]
    assert "BarrelVertexHits" in piece_names
    assert "EndcapVertexHits" in piece_names

    # Second event should have pieces from both second events
    second_event = merged_data["events"][1]
    piece_names = [piece["name"] for piece in second_event["pieces"]]
    assert "BarrelTracks" in piece_names
    assert "EndcapTracks" in piece_names


def test_conflict_detection(temp_dex_files):
    """Test detection of conflicting piece names."""
    runner = CliRunner()
    # In this case, we want to let the exception be raised but still test it
    try:
        runner.invoke(merge, [temp_dex_files["file1"], temp_dex_files["conflict"]], catch_exceptions=False)
        # If we get here, the command didn't raise an exception, which is a failure
        assert False, "Expected a ValueError but no exception was raised"
    except ValueError as e:
        # The error message should be about duplicate pieces
        error_msg = str(e).lower()
        assert any(phrase in error_msg for phrase in [
            "duplicate piece",
            "duplicate name",
            "already exists"
        ]), f"Expected error about duplicate pieces, got: {error_msg}"


def test_ignore_flag(temp_dex_files):
    """Test the ignore flag for conflicting piece names."""
    runner = CliRunner()
    result = runner.invoke(
        merge,
        ["--ignore", temp_dex_files["file1"], temp_dex_files["conflict"], "-o", temp_dex_files["output"]]
    )

    assert result.exit_code == 0

    # Load and verify the merged content
    with open(temp_dex_files["output"], 'r') as f:
        merged_data = json.load(f)

    # Find the event with ID "event_0"
    for event in merged_data["events"]:
        if event["id"] == "event_0":
            # Check that we have the BarrelVertexHits piece from file1 (not from conflict)
            for piece in event["pieces"]:
                if piece["name"] == "BarrelVertexHits":
                    # Verify it's the one from file1, not from conflict
                    assert piece["columns"]["pos"] == [1, 2, 3]  # Values from SAMPLE_DEX_1
                    assert piece["columns"]["dim"] == [0.1, 0.1, 0.1]  # Values from SAMPLE_DEX_1


def test_overwrite_flag(temp_dex_files):
    """Test the overwrite flag for conflicting piece names."""
    runner = CliRunner()
    result = runner.invoke(
        merge,
        ["--overwrite", temp_dex_files["file1"], temp_dex_files["conflict"], "-o", temp_dex_files["output"]]
    )

    assert result.exit_code == 0

    # Load and verify the merged content
    with open(temp_dex_files["output"], 'r') as f:
        merged_data = json.load(f)

    # Find the event with ID "event_0"
    for event in merged_data["events"]:
        if event["id"] == "event_0":
            # Check that we have the BarrelVertexHits piece from conflict (not from file1)
            for piece in event["pieces"]:
                if piece["name"] == "BarrelVertexHits":
                    # Verify it's the one from conflict, not from file1
                    assert piece["columns"]["pos"] == [100, 200, 300]  # Values from SAMPLE_DEX_CONFLICT
                    assert piece["columns"]["dim"] == [1, 1, 1]  # Values from SAMPLE_DEX_CONFLICT


def test_invalid_file(temp_dex_files):
    """Test handling of invalid DEX files."""
    runner = CliRunner()
    result = runner.invoke(merge, [temp_dex_files["file1"], temp_dex_files["invalid"]], catch_exceptions=False)

    # Should fail due to invalid file format
    assert result.exit_code != 0
    assert "not a valid Firebird DEX file" in result.output or "valid firebird dex" in result.output.lower()


def test_conflict_between_flags(temp_dex_files):
    """Test that ignore and overwrite flags cannot be used together."""
    runner = CliRunner()
    result = runner.invoke(
        merge,
        ["--ignore", "--overwrite", temp_dex_files["file1"], temp_dex_files["conflict"]],
        catch_exceptions=False
    )

    # Should fail due to conflicting flags
    assert result.exit_code != 0
    assert "--ignore and --overwrite flags cannot be used together" in result.output or "ignore and overwrite" in result.output.lower()


def test_missing_files():
    """Test handling of missing input files."""
    runner = CliRunner()
    result = runner.invoke(merge, ["nonexistent1.json", "nonexistent2.json"], catch_exceptions=False)

    # Should fail due to missing files
    assert result.exit_code != 0
    assert any(text in result.output.lower() for text in ["no such file", "not found", "error opening", "could not open"])


def test_stdout_output(temp_dex_files):
    """Test output to stdout when no output file is specified."""
    runner = CliRunner()
    result = runner.invoke(merge, [temp_dex_files["file1"], temp_dex_files["file2"]])

    assert result.exit_code == 0
    # Verify that the merged JSON is in the stdout output
    assert "BarrelVertexHits" in result.output
    assert "EndcapVertexHits" in result.output
    assert "firebird-dex-json" in result.output


def test_merge_more_than_two_files(temp_dex_files):
    """Test merging more than two files."""
    # Create a third file with a unique event
    sample_dex_3 = {
        "type": "firebird-dex-json",
        "version": "1.0",
        "origin": {
            "file": "sample3.root",
            "entries_count": 1
        },
        "events": [
            {
                "id": "event_3",
                "pieces": [
                    {
                        "name": "CalorHits",
                        "type": "BoxHit",
                        "version": "1.0",
                        "origin": {"type": "edm4eic::TrackerHitData"},
                        "count": 0,
                        "columns": {"pos": [], "dim": []}
                    }
                ]
            }
        ]
    }

    file3_path = os.path.join(os.path.dirname(temp_dex_files["file1"]), "sample3.firebird.json")
    with open(file3_path, 'w') as f:
        json.dump(sample_dex_3, f)

    runner = CliRunner()
    result = runner.invoke(
        merge,
        [temp_dex_files["file1"], temp_dex_files["file2"], file3_path, "-o", temp_dex_files["output"]]
    )

    assert result.exit_code == 0

    # Load and verify the merged content
    with open(temp_dex_files["output"], 'r') as f:
        merged_data = json.load(f)

    # Verify header
    assert merged_data["version"] == "1.0"
    assert len(merged_data["origin"]["merged_from"]) == 3
    assert merged_data["origin"]["entries_count"] == 5  # Total from all files

    # Verify merged events - should have all events from all three files
    assert len(merged_data["events"]) == 4  # 2 from file1 + 1 from file2 + 1 from file3

    # Check that all expected event IDs are present
    event_ids = [event["id"] for event in merged_data["events"]]
    assert "event_0" in event_ids
    assert "event_1" in event_ids
    assert "event_2" in event_ids
    assert "event_3" in event_ids


def test_is_valid_dex_file():
    """Test the is_valid_dex_file function."""
    # Valid DEX file
    assert is_valid_dex_file(SAMPLE_DEX_1)

    # Invalid cases
    assert not is_valid_dex_file({})  # Empty dict
    assert not is_valid_dex_file({"events": "not a list"})  # events not a list
    assert not is_valid_dex_file({"version": "1.0"})  # Missing events

    # Invalid event
    invalid_event = {
        "version": "1.0",
        "events": [{"not_id": "event_0"}]  # Missing id
    }
    assert not is_valid_dex_file(invalid_event)

    # Invalid piece
    invalid_piece = {
        "version": "1.0",
        "events": [{
            "id": "event_0",
            "pieces": [{"not_name": "BarrelVertexHits"}]  # Missing name
        }]
    }
    assert not is_valid_dex_file(invalid_piece)


def test_create_merged_header():
    """Test the create_merged_header function."""
    dex_files = [
        ("file1.json", SAMPLE_DEX_1),
        ("file2.json", SAMPLE_DEX_2),
        ("file3.json", SAMPLE_DEX_CONFLICT)
    ]

    header = create_merged_header(dex_files)

    # Check basic structure
    assert header["type"] == "firebird-dex-json"
    assert header["version"] == "1.0"
    assert "origin" in header
    assert "merged_from" in header["origin"]
    assert "entries_count" in header["origin"]

    # Check merged_from list
    merged_from = header["origin"]["merged_from"]
    assert len(merged_from) == 3
    assert merged_from[0]["file"] == "file1.json"
    assert merged_from[1]["file"] == "file2.json"
    assert merged_from[2]["file"] == "file3.json"

    # Check entries_count
    assert header["origin"]["entries_count"] == 4  # 2 from file1 + 2 from file2


def test_merge_event_pieces():
    """Test the merge_event_pieces function."""
    # Set up test events
    event1 = {
        "id": "test_event",
        "pieces": [
            {"name": "piece1", "type": "type1", "origin": {"type": "TypeA"}, "data": [1, 2, 3]},
            {"name": "piece2", "type": "type2", "origin": {"type": "TypeB"}, "data": [4, 5, 6]}
        ]
    }

    event2 = {
        "id": "test_event",
        "pieces": [
            {"name": "piece3", "type": "type3", "origin": {"type": "TypeC"}, "data": [7, 8, 9]},
            {"name": "piece1", "type": "type1", "origin": {"type": "TypeA"}, "data": [10, 11, 12]}  # Conflict with event1
        ]
    }

    events_with_id = [
        ("file1.json", event1),
        ("file2.json", event2)
    ]

    # Test normal merge (should raise ValueError due to conflict)
    with pytest.raises(ValueError):
        merge_event_pieces("test_event", events_with_id)

    # Test with ignore flag
    merged_event = merge_event_pieces("test_event", events_with_id, ignore=True)
    piece_names = [piece["name"] for piece in merged_event["pieces"]]
    assert "piece1" in piece_names
    assert "piece2" in piece_names
    assert "piece3" in piece_names

    # Verify that piece1 from file1 was kept
    for piece in merged_event["pieces"]:
        if piece["name"] == "piece1":
            assert piece["data"] == [1, 2, 3]  # From event1, not event2

    # Test with overwrite flag
    merged_event = merge_event_pieces("test_event", events_with_id, overwrite=True)
    piece_names = [piece["name"] for piece in merged_event["pieces"]]
    assert "piece1" in piece_names
    assert "piece2" in piece_names
    assert "piece3" in piece_names

    # Verify that piece1 from file2 overwrote the one from file1
    for piece in merged_event["pieces"]:
        if piece["name"] == "piece1":
            assert piece["data"] == [10, 11, 12]  # From event2, not event1
