# test_dex.py - DEX v1 upgrade, validation, and the upgrade CLI command

import json
import os
import zipfile

import pytest
from click.testing import CliRunner

from pyrobird.cli.upgrade import upgrade
from pyrobird.dex import (
    collect_dex_problems,
    make_dex,
    upgrade_dex,
    validate_dex,
    UnknownPieceTypeError,
)

# A small but complete 0.04 document covering both known group types
SAMPLE_004 = {
    "type": "firebird-dex-json",
    "version": "0.04",
    "origin": {"file": "sample.root"},
    "events": [
        {
            "id": "event_0",
            "groups": [
                {
                    "name": "BarrelHits",
                    "type": "BoxHit",
                    "origin": {"type": "edm4eic::TrackerHitData"},
                    "hits": [
                        {"pos": [1, 2, 3], "dim": [0.1, 0.2, 0.3], "t": [4, 0.5], "ed": [0.001, 0.0001]},
                        {"pos": [7, 8, 9], "dim": [1, 1, 1], "t": [5, 0], "ed": [0.002, 0]},
                    ],
                },
                {
                    "name": "CentralTracks",
                    "type": "PointTrajectory",
                    "paramColumns": ["theta", "phi"],
                    "pointColumns": ["x", "y", "z", "t"],
                    "trajectories": [
                        {"points": [[0, 0, 0, 0], [1, 1, 1, 1]], "params": [0.5, 1.5]},
                        {"points": [[2, 2, 2, 2]], "params": [0.7, 2.5]},
                    ],
                },
            ],
        }
    ],
}


def test_upgrade_box_hits():
    result = upgrade_dex(SAMPLE_004)
    validate_dex(result)

    assert result["version"] == "1.0"
    event = result["events"][0]
    assert event["id"] == "event_0"

    hits = next(p for p in event["pieces"] if p["name"] == "BarrelHits")
    assert hits["type"] == "BoxHit"
    assert hits["count"] == 2
    # hit 0 and hit 1 keep their order: id == index
    assert hits["columns"]["pos"] == [1, 2, 3, 7, 8, 9]
    assert hits["columns"]["dim"] == [0.1, 0.2, 0.3, 1, 1, 1]
    assert hits["columns"]["time"] == [4, 5]
    assert hits["columns"]["timeError"] == [0.5, 0]
    assert hits["columns"]["edep"] == [0.001, 0.002]
    assert hits["columns"]["edepError"] == [0.0001, 0]
    assert hits["origin"] == {"type": "edm4eic::TrackerHitData"}


def test_upgrade_trajectories():
    result = upgrade_dex(SAMPLE_004)
    tracks = next(p for p in result["events"][0]["pieces"] if p["name"] == "CentralTracks")

    assert tracks["type"] == "PointTrajectory"
    assert tracks["count"] == 2
    # per-trajectory params became per-name columns, same index
    assert tracks["columns"]["theta"] == [0.5, 0.7]
    assert tracks["columns"]["phi"] == [1.5, 2.5]
    assert tracks["pointColumns"] == ["x", "y", "z", "t"]
    assert tracks["points"][0] == [[0, 0, 0, 0], [1, 1, 1, 1]]
    assert tracks["points"][1] == [[2, 2, 2, 2]]


def test_upgrade_old_tracker_line_type_name():
    # The pre-0.04 type name and its "lines" container map to PointTrajectory
    old = {
        "version": "0.03",
        "events": [{
            "id": 0,
            "groups": [{
                "name": "Tracks",
                "type": "TrackerLinePointTrajectory",
                "paramColumns": [],
                "pointColumns": ["x", "y", "z"],
                "lines": [{"points": [[1, 2, 3]], "params": []}],
            }],
        }],
    }
    result = upgrade_dex(old)
    validate_dex(result)
    piece = result["events"][0]["pieces"][0]
    assert piece["type"] == "PointTrajectory"
    assert piece["count"] == 1
    assert piece["points"] == [[[1, 2, 3]]]


def test_upgrade_unknown_type_fails_by_default():
    doc = {
        "version": "0.04",
        "events": [{"id": 0, "groups": [{"name": "X", "type": "custom.Unknown", "stuff": []}]}],
    }
    with pytest.raises(UnknownPieceTypeError):
        upgrade_dex(doc)

    # skip_unknown drops the group and produces a valid (empty) event
    result = upgrade_dex(doc, skip_unknown=True)
    validate_dex(result)
    assert result["events"][0]["pieces"] == []


def test_upgrade_is_a_noop_on_v1():
    v1 = make_dex([{"id": 0, "pieces": []}])
    assert upgrade_dex(v1) is v1


def test_validate_catches_column_length_mismatch():
    doc = make_dex([{
        "id": 0,
        "pieces": [{
            "name": "Hits", "type": "BoxHit", "version": "1.0",
            "count": 2,
            "columns": {"pos": [1, 2, 3], "dim": [1, 1, 1, 2, 2, 2]},  # pos too short
        }],
    }])
    problems = collect_dex_problems(doc)
    assert any("pos" in p for p in problems)
    with pytest.raises(ValueError):
        validate_dex(doc)


def test_validate_catches_bad_refs():
    doc = make_dex([{
        "id": 0,
        "pieces": [
            {
                "name": "Particles", "type": "custom.Particle", "version": "1.0",
                "count": 2,
                "columns": {"pdg": [11, 22], "parent": [-1, 0]},
                "refs": {"parent": "Particles"},
            },
            {
                "name": "Broken", "type": "custom.Thing", "version": "1.0",
                "count": 1,
                "columns": {"particle": [5]},  # out of range for Particles (count=2)
                "refs": {"particle": "Particles"},
            },
            {
                "name": "AlsoBroken", "type": "custom.Thing2", "version": "1.0",
                "count": 1,
                "columns": {},
                "refs": {"missing": "Nowhere"},  # no such column, no such piece
            },
        ],
    }])
    problems = collect_dex_problems(doc)
    assert any("not a valid index" in p for p in problems)
    assert any("no such column" in p for p in problems)

    # the self-referencing Particles piece alone is valid
    solo = make_dex([{"id": 0, "pieces": [doc["events"][0]["pieces"][0]]}])
    validate_dex(solo)


def test_validate_catches_ragged_points_mismatch():
    doc = make_dex([{
        "id": 0,
        "pieces": [{
            "name": "Tracks", "type": "PointTrajectory", "version": "1.0",
            "count": 2,
            "columns": {},
            "pointColumns": ["x", "y", "z"],
            "points": [[[1, 2, 3]]],  # only one entity, count says 2
        }],
    }])
    problems = collect_dex_problems(doc)
    assert any("points" in p for p in problems)


def test_upgrade_cli_json_roundtrip(tmp_path):
    input_file = tmp_path / "old.firebird.json"
    output_file = tmp_path / "new.firebird.json"
    input_file.write_text(json.dumps(SAMPLE_004))

    runner = CliRunner()
    result = runner.invoke(upgrade, [str(input_file), str(output_file)])
    assert result.exit_code == 0, result.output

    upgraded = json.loads(output_file.read_text())
    validate_dex(upgraded)
    assert upgraded["version"] == "1.0"


def test_upgrade_cli_zip_roundtrip(tmp_path):
    input_file = tmp_path / "old.firebird.zip"
    output_file = tmp_path / "new.firebird.zip"
    with zipfile.ZipFile(input_file, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("old.firebird.json", json.dumps(SAMPLE_004))

    runner = CliRunner()
    result = runner.invoke(upgrade, [str(input_file), str(output_file)])
    assert result.exit_code == 0, result.output

    with zipfile.ZipFile(output_file) as zf:
        member = [n for n in zf.namelist() if n.endswith(".json")][0]
        upgraded = json.loads(zf.read(member))
    validate_dex(upgraded)
    assert upgraded["version"] == "1.0"


def test_upgrade_cli_default_output_name(tmp_path):
    input_file = tmp_path / "sample.firebird.json"
    input_file.write_text(json.dumps(SAMPLE_004))

    runner = CliRunner()
    result = runner.invoke(upgrade, [str(input_file)])
    assert result.exit_code == 0, result.output

    expected = tmp_path / "sample.v1.firebird.json"
    assert expected.exists()
    validate_dex(json.loads(expected.read_text()))


def test_upgrade_cli_unknown_type(tmp_path):
    doc = {
        "version": "0.04",
        "events": [{"id": 0, "groups": [{"name": "X", "type": "custom.Unknown"}]}],
    }
    input_file = tmp_path / "custom.firebird.json"
    input_file.write_text(json.dumps(doc))

    runner = CliRunner()
    result = runner.invoke(upgrade, [str(input_file)])
    assert result.exit_code != 0
    assert "custom.Unknown" in result.output

    result = runner.invoke(upgrade, ["--skip-unknown", str(input_file)])
    assert result.exit_code == 0, result.output
