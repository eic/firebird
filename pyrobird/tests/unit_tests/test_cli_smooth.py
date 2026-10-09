"""pyrobird smooth: point columns found by name, a size guard before the
interpolation, and archives that read back."""

import json
import zipfile

import pytest
from click.testing import CliRunner

from pyrobird.cli.smooth import smooth, apply_smoothing, count_interpolated_points, add_time_interpolation, \
    SmoothingTooLargeError
from pyrobird.dex_utils import read_dex_json


def trajectory_dex(point_columns, points):
    """A DEX 1.0 document with one event holding one PointTrajectory piece."""
    return {
        "type": "firebird-dex-json",
        "version": "1.0",
        "events": [{
            "id": 0,
            "pieces": [{
                "name": "Tracks",
                "type": "PointTrajectory",
                "version": "1.0",
                "count": len(points),
                "columns": {},
                "pointColumns": point_columns,
                "points": points,
            }],
        }],
    }


def write_json(path, document):
    path.write_text(json.dumps(document))
    return str(path)


def test_time_column_found_by_name(tmp_path):
    """With t first, points are sorted and interpolated by column 0, and the cut reads x, y, z by name."""
    dex = trajectory_dex(["t", "x", "y", "z"], [[
        [1.0, 10.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 0.0],
    ]])
    smoothed = apply_smoothing(dex, step_time=0.25)
    points = smoothed["events"][0]["pieces"][0]["points"][0]
    assert [point[0] for point in points] == [0.0, 0.25, 0.5, 0.75, 1.0]
    assert [point[1] for point in points] == [0.0, 2.5, 5.0, 7.5, 10.0]


def test_piece_without_time_column_is_cut_but_not_interpolated():
    dex = trajectory_dex(["x", "y", "z"], [[
        [0.0, 0.0, 0.0],
        [0.0, 0.0, 100.0],
        [9000.0, 0.0, 0.0],   # r = 9 m: outside every cut volume, the cut starts here
        [0.0, 0.0, 200.0],
    ]])
    points = apply_smoothing(dex, step_time=0.1)["events"][0]["pieces"][0]["points"][0]
    assert points == [[0.0, 0.0, 0.0], [0.0, 0.0, 100.0]]


def test_predicted_count_matches_interpolation():
    points = [[0, 0, 0, 0.0], [0, 0, 1, 1.0], [0, 0, 2, 1.1], [0, 0, 3, 5.0]]
    predicted = count_interpolated_points(points, 0.2, 3)
    built = add_time_interpolation(points, 0.2, 3)
    assert abs(len(points) + predicted - len(built)) <= 2   # at most one point per gap


def test_oversized_result_is_refused_before_it_is_built(tmp_path):
    dex = trajectory_dex(["x", "y", "z", "t"], [[[0, 0, 0, 0.0], [0, 0, 10, 1.0e6]]])
    with pytest.raises(SmoothingTooLargeError, match=r"grow 2 trajectory points to about 5000001"):
        apply_smoothing(dex, step_time=0.2, max_points=1000)
    # Nothing was changed
    assert dex["events"][0]["pieces"][0]["points"][0] == [[0, 0, 0, 0.0], [0, 0, 10, 1.0e6]]


def test_cli_refuses_an_oversized_result_and_writes_nothing(tmp_path):
    source = write_json(tmp_path / "in.firebird.json",
                        trajectory_dex(["x", "y", "z", "t"], [[[0, 0, 0, 0.0], [0, 0, 10, 1000.0]]]))
    output = tmp_path / "out.firebird.json"
    result = CliRunner().invoke(smooth, [source, "-o", str(output), "--step-time", "0.25", "--max-points", "100"])
    assert result.exit_code == 1
    assert "more than --max-points=100" in result.output
    assert not output.exists()

    # 0 disables the check
    result = CliRunner().invoke(smooth, [source, "-o", str(output), "--step-time", "0.25", "--max-points", "0"])
    assert result.exit_code == 0, result.output
    assert len(read_dex_json(str(output))["events"][0]["pieces"][0]["points"][0]) == 4001


def test_cli_writes_a_zip_archive_that_reads_back(tmp_path):
    source = write_json(tmp_path / "in.firebird.json",
                        trajectory_dex(["x", "y", "z", "t"], [[[0, 0, 0, 0.0], [0, 0, 10, 1.0]]]))
    output = tmp_path / "out.firebird.zip"
    result = CliRunner().invoke(smooth, [source, "-o", str(output)])
    assert result.exit_code == 0, result.output
    assert zipfile.is_zipfile(output)
    assert len(read_dex_json(str(output))["events"][0]["pieces"][0]["points"][0]) == 6


def test_cli_names_the_upgrade_for_a_dex_004_file(tmp_path):
    old = {"type": "firebird-dex-json", "version": "0.04",
           "events": [{"id": "event_0", "groups": [{"name": "Tracks", "type": "PointTrajectory"}]}]}
    source = write_json(tmp_path / "old.firebird.json", old)
    result = CliRunner().invoke(smooth, [source, "-o", str(tmp_path / "out.json")])
    assert result.exit_code != 0
    assert f"DEX version 0.04 file. Convert it once with: pyrobird upgrade {source}" in result.output
