import json
import os
import tempfile
import pytest
from click.testing import CliRunner
from pyrobird.cli.merge import merge, is_valid_dex_file, merge_dex_files, merge_entries, merge_entry_components, create_merged_header

# Sample Firebird DEX JSON data for testing
SAMPLE_DEX_1 = {
    "type": "firebird-dex-json",
    "version": "0.02",
    "origin": {
        "file": "sample1.root",
        "entries_count": 2
    },
    "entries": [
        {
            "id": "event_0",
            "components": [
                {
                    "name": "BarrelVertexHits",
                    "type": "BoxTrackerHit",
                    "originType": "edm4eic::TrackerHitData",
                    "hits": [
                        {
                            "pos": [1, 2, 3],
                            "dim": [0.1, 0.1, 0.1],
                            "t": [0, 0],
                            "ed": [0.001, 0]
                        }
                    ]
                }
            ]
        },
        {
            "id": "event_1",
            "components": [
                {
                    "name": "BarrelTracks",
                    "type": "TrackerLinePointTrajectory",
                    "originType": "edm4eic::TrackSegmentData",
                    "lines": []
                }
            ]
        }
    ]
}

SAMPLE_DEX_2 = {
    "type": "firebird-dex-json",
    "version": "0.01",
    "origin": {
        "file": "sample2.root",
        "entries_count": 2
    },
    "entries": [
        {
            "id": "event_0",
            "components": [
                {
                    "name": "EndcapVertexHits",
                    "type": "BoxTrackerHit",
                    "originType": "edm4eic::TrackerHitData",
                    "hits": [
                        {
                            "pos": [10, 20, 30],
                            "dim": [0.2, 0.2, 0.2],
                            "t": [1, 0],
                            "ed": [0.002, 0]
                        }
                    ]
                }
            ]
        },
        {
            "id": "event_2",
            "components": [
                {
                    "name": "EndcapTracks",
                    "type": "TrackerLinePointTrajectory",
                    "originType": "edm4eic::TrackSegmentData",
                    "lines": []
                }
            ]
        }
    ]
}

# Sample with conflicting component names
SAMPLE_DEX_CONFLICT = {
    "version": "0.03",
    "entries": [
        {
            "id": "event_0",
            "components": [
                {
                    "name": "BarrelVertexHits",  # Same name as in SAMPLE_DEX_1
                    "type": "BoxTrackerHit",
                    "originType": "edm4eic::TrackerHitData",
                    "hits": [
                        {
                            "pos": [100, 200, 300],
                            "dim": [1, 1, 1],
                            "t": [10, 1],
                            "ed": [0.01, 0.001]
                        }
                    ]
                }
            ]
        }
    ]
}

# Invalid DEX format (missing required fields)
INVALID_DEX = {
    "version": "0.01",
    "entries": [
        {
            "id": "event_0",
            # Missing "components" field
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
    assert "type" in merged_data
    assert merged_data["type"] == "firebird-dex-json"
    assert "version" in merged_data
    assert merged_data["version"] in ["0.02", "0.03"]  # Should use the highest version

    # Check origin metadata
    assert "origin" in merged_data
    assert "merged_from" in merged_data["origin"]
    assert len(merged_data["origin"]["merged_from"]) == 2
    assert "entries_count" in merged_data["origin"]
    assert merged_data["origin"]["entries_count"] == 4  # Total from both files

    # Verify merged entries
    assert len(merged_data["entries"]) == 3  # All entries from both files

    # Check that the entries have been properly merged
    entry_ids = [entry["id"] for entry in merged_data["entries"]]
    assert "event_0" in entry_ids
    assert "event_1" in entry_ids
    assert "event_2" in entry_ids

    # Check the components in the first entry (which exists in both files)
    for entry in merged_data["entries"]:
        if entry["id"] == "event_0":
            # This entry should have components from both files
            component_names = [comp["name"] for comp in entry["components"]]
            assert "BarrelVertexHits" in component_names
            assert "EndcapVertexHits" in component_names
            assert len(entry["components"]) == 2


def test_reset_id_flag(temp_dex_files):
    """Test merging with reset-id flag."""
    runner = CliRunner()
    result = runner.invoke(merge, ["--reset-id", temp_dex_files["file1"], temp_dex_files["file2"], "-o", temp_dex_files["output"]])

    assert result.exit_code == 0

    # Load and verify the merged content
    with open(temp_dex_files["output"], 'r') as f:
        merged_data = json.load(f)

    # With reset-id, entries should have been merged by position
    assert len(merged_data["entries"]) == 2  # File1.entry0 + File2.entry0, File1.entry1 + File2.entry1

    # First entry should have components from both first entries
    first_entry = merged_data["entries"][0]
    component_names = [comp["name"] for comp in first_entry["components"]]
    assert "BarrelVertexHits" in component_names
    assert "EndcapVertexHits" in component_names

    # Second entry should have components from both second entries
    second_entry = merged_data["entries"][1]
    component_names = [comp["name"] for comp in second_entry["components"]]
    assert "BarrelTracks" in component_names
    assert "EndcapTracks" in component_names


def test_conflict_detection(temp_dex_files):
    """Test detection of conflicting component names."""
    runner = CliRunner()
    result = runner.invoke(merge, [temp_dex_files["file1"], temp_dex_files["conflict"]], catch_exceptions=False)

    # Should fail due to duplicate component names
    assert result.exit_code != 0
    assert "Duplicate component name" in result.output or "duplicate component" in result.output.lower()


def test_ignore_flag(temp_dex_files):
    """Test the ignore flag for conflicting component names."""
    runner = CliRunner()
    result = runner.invoke(
        merge,
        ["--ignore", temp_dex_files["file1"], temp_dex_files["conflict"], "-o", temp_dex_files["output"]]
    )

    assert result.exit_code == 0

    # Load and verify the merged content
    with open(temp_dex_files["output"], 'r') as f:
        merged_data = json.load(f)

    # Find the entry with ID "event_0"
    for entry in merged_data["entries"]:
        if entry["id"] == "event_0":
            # Check that we have the BarrelVertexHits component from file1 (not from conflict)
            for comp in entry["components"]:
                if comp["name"] == "BarrelVertexHits":
                    # Verify it's the one from file1, not from conflict
                    assert comp["hits"][0]["pos"] == [1, 2, 3]  # Values from SAMPLE_DEX_1
                    assert comp["hits"][0]["dim"] == [0.1, 0.1, 0.1]  # Values from SAMPLE_DEX_1


def test_overwrite_flag(temp_dex_files):
    """Test the overwrite flag for conflicting component names."""
    runner = CliRunner()
    result = runner.invoke(
        merge,
        ["--overwrite", temp_dex_files["file1"], temp_dex_files["conflict"], "-o", temp_dex_files["output"]]
    )

    assert result.exit_code == 0

    # Load and verify the merged content
    with open(temp_dex_files["output"], 'r') as f:
        merged_data = json.load(f)

    # Find the entry with ID "event_0"
    for entry in merged_data["entries"]:
        if entry["id"] == "event_0":
            # Check that we have the BarrelVertexHits component from conflict (not from file1)
            for comp in entry["components"]:
                if comp["name"] == "BarrelVertexHits":
                    # Verify it's the one from conflict, not from file1
                    assert comp["hits"][0]["pos"] == [100, 200, 300]  # Values from SAMPLE_DEX_CONFLICT
                    assert comp["hits"][0]["dim"] == [1, 1, 1]  # Values from SAMPLE_DEX_CONFLICT


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
    # Create a third file with a unique entry
    sample_dex_3 = {
        "type": "firebird-dex-json",
        "version": "0.03",
        "origin": {
            "file": "sample3.root",
            "entries_count": 1
        },
        "entries": [
            {
                "id": "event_3",
                "components": [
                    {
                        "name": "CalorHits",
                        "type": "BoxTrackerHit",
                        "originType": "edm4eic::TrackerHitData",
                        "hits": []
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
    assert merged_data["version"] == "0.03"  # Should use the highest version
    assert len(merged_data["origin"]["merged_from"]) == 3
    assert merged_data["origin"]["entries_count"] == 5  # Total from all files

    # Verify merged entries - should have all entries from all three files
    assert len(merged_data["entries"]) == 4  # 2 from file1 + 1 from file2 + 1 from file3

    # Check that all expected entry IDs are present
    entry_ids = [entry["id"] for entry in merged_data["entries"]]
    assert "event_0" in entry_ids
    assert "event_1" in entry_ids
    assert "event_2" in entry_ids
    assert "event_3" in entry_ids


def test_is_valid_dex_file():
    """Test the is_valid_dex_file function."""
    # Valid DEX file
    assert is_valid_dex_file(SAMPLE_DEX_1)

    # Invalid cases
    assert not is_valid_dex_file({})  # Empty dict
    assert not is_valid_dex_file({"entries": "not a list"})  # entries not a list
    assert not is_valid_dex_file({"version": "0.01"})  # Missing entries

    # Invalid entry
    invalid_entry = {
        "version": "0.01",
        "entries": [{"not_id": "event_0"}]  # Missing id
    }
    assert not is_valid_dex_file(invalid_entry)

    # Invalid component
    invalid_component = {
        "version": "0.01",
        "entries": [{
            "id": "event_0",
            "components": [{"not_name": "BarrelVertexHits"}]  # Missing name
        }]
    }
    assert not is_valid_dex_file(invalid_component)


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
    assert header["version"] == "0.03"  # Should use the highest version
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


def test_merge_entry_components():
    """Test the merge_entry_components function."""
    # Set up test entries
    entry1 = {
        "id": "test_entry",
        "components": [
            {"name": "comp1", "type": "type1", "data": [1, 2, 3]},
            {"name": "comp2", "type": "type2", "data": [4, 5, 6]}
        ]
    }

    entry2 = {
        "id": "test_entry",
        "components": [
            {"name": "comp3", "type": "type3", "data": [7, 8, 9]},
            {"name": "comp1", "type": "type1", "data": [10, 11, 12]}  # Conflict with entry1
        ]
    }

    entries_with_id = [
        ("file1.json", entry1),
        ("file2.json", entry2)
    ]

    # Test normal merge (should raise ValueError due to conflict)
    with pytest.raises(ValueError):
        merged_entry = merge_entry_components("test_entry", entries_with_id)

    # Test with ignore flag
    merged_entry = merge_entry_components("test_entry", entries_with_id, ignore=True)
    component_names = [comp["name"] for comp in merged_entry["components"]]
    assert "comp1" in component_names
    assert "comp2" in component_names
    assert "comp3" in component_names

    # Verify that comp1 from file1 was kept
    for comp in merged_entry["components"]:
        if comp["name"] == "comp1":
            assert comp["data"] == [1, 2, 3]  # From entry1, not entry2

    # Test with overwrite flag
    merged_entry = merge_entry_components("test_entry", entries_with_id, overwrite=True)
    component_names = [comp["name"] for comp in merged_entry["components"]]
    assert "comp1" in component_names
    assert "comp2" in component_names
    assert "comp3" in component_names

    # Verify that comp1 from file2 overwrote the one from file1
    for comp in merged_entry["components"]:
        if comp["name"] == "comp1":
            assert comp["data"] == [10, 11, 12]  # From entry2, not entry1