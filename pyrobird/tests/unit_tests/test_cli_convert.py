# test_convert.py

import pytest
import shutil
from unittest.mock import patch
from click.testing import CliRunner
from pyrobird.cli.convert import convert  # Import your convert function
import os
import json
import zipfile
from pyrobird.cli.convert import guess_output_name
from pyrobird.dex_utils import read_dex_json

# Assuming the small ROOT file is named 'test_data.root' and is placed in the 'tests' directory
TEST_ROOT_FILE = os.path.join(os.path.dirname(__file__), 'data', 'reco_2024-09_craterlake_2evt.edm4eic.root')
TEST_EDM4HEP_FILE = os.path.join(os.path.dirname(__file__), 'data', 'k_lambda_10x100_2evt.edm4hep.root')


@pytest.fixture
def runner():
    return CliRunner()


@pytest.fixture
def work_dir(tmp_path, monkeypatch):
    """Runs the test in an empty temporary directory that holds a copy of the test ROOT file."""
    monkeypatch.chdir(tmp_path)
    shutil.copy(TEST_ROOT_FILE, tmp_path / 'test_data.root')
    return tmp_path


def test_convert_default_output(runner, work_dir):
    test_root_file = 'test_data.root'

    # Run the convert command without specifying output (default behavior)
    result = runner.invoke(convert, [test_root_file])

    assert result.exit_code == 0, f"Command failed with exit code {result.exit_code}"

    # Check that the output file was created
    expected_output_file = 'test_data.firebird.json'
    assert os.path.exists(expected_output_file), "Output file was not created"

    # Optionally, check the content of the output file
    with open(expected_output_file, 'r') as f:
        data = json.load(f)
        assert isinstance(data, dict), "Output JSON is not a dictionary"
        # Add more assertions based on expected content


def test_convert_specified_output(runner, work_dir):
    test_root_file = 'test_data.root'

    # Specify an output file name
    output_file = 'custom_output.json'
    result = runner.invoke(convert, [test_root_file, '--output', output_file])

    assert result.exit_code == 0, f"Command failed with exit code {result.exit_code}"
    assert os.path.exists(output_file), "Specified output file was not created"


def test_convert_output_to_stdout(runner, work_dir):
    test_root_file = 'test_data.root'

    # Output to stdout
    result = runner.invoke(convert, [test_root_file, '--output', '-'])

    assert result.exit_code == 0, f"Command failed with exit code {result.exit_code}"
    # The output should be the JSON data
    assert result.output.strip().startswith('{'), "Output is not JSON data"
    # Optionally, parse the JSON and perform assertions
    data = json.loads(result.output)
    assert isinstance(data, dict), "Output JSON is not a dictionary"
    # Add more assertions based on expected content


def test_convert_invalid_entry(runner, work_dir):
    test_root_file = 'test_data.root'

    # Test file doesn't have event 1000
    result = runner.invoke(convert, [test_root_file, '--output', '-', '-e', '1000'])

    assert result.exit_code == 1, f"Command failed with exit code {result.exit_code}"
    assert isinstance(result.exception, ValueError)
    assert "Event 1000 is out of range: the file holds 2 events (0..1)" in str(result.exception)


def test_convert_huge_entry_range_is_clamped_without_expanding(runner, work_dir, caplog):
    """Entries past the end of the file are dropped with one warning, computed from the range bounds."""
    with caplog.at_level('WARNING'):
        result = runner.invoke(convert, ['test_data.root', '--output', '-', '-e', '0-1000000000000'])

    assert result.exit_code == 0, result.exception
    assert [event['id'] for event in json.loads(result.output)['events']] == [0, 1]
    warnings = [record.getMessage() for record in caplog.records if record.levelname == 'WARNING']
    assert warnings == ["Entries provided as: '0-1000000000000': Event 2-1000000000000 is out of range: "
                        "the file holds 2 events (0..1); converting 0-1"]


def test_convert_bad_entry_format_fails_before_reading(runner, work_dir):
    with patch('uproot.open') as uproot_open:
        result = runner.invoke(convert, ['test_data.root', '-e', 'abc'])
    assert isinstance(result.exception, ValueError)
    uproot_open.assert_not_called()


def test_convert_remote_url_default_output_in_cwd(runner, work_dir):
    """A URL without -o writes <basename>.firebird.json in the current directory."""
    import uproot
    real_open = uproot.open
    url = 'root://dtn-eic.example.org//volatile/eic/run_42.edm4eic.root'

    with patch('uproot.open', side_effect=lambda *_args, **_kw: real_open(TEST_ROOT_FILE)) as uproot_open:
        result = runner.invoke(convert, [url])

    assert result.exit_code == 0, result.output
    uproot_open.assert_called_once_with(url)
    assert (work_dir / 'run_42.edm4eic.firebird.json').is_file()
    # No directory named after the host
    assert not (work_dir / 'dtn-eic.example.org').exists()


@pytest.mark.parametrize("type_args", [["-t", "edm4hep"], []])  # explicit type and auto-detection
def test_convert_edm4hep(runner, type_args):
    result = runner.invoke(convert, [TEST_EDM4HEP_FILE, '--output', '-'] + type_args)

    assert result.exit_code == 0, f"Command failed with exit code {result.exit_code}"
    data = json.loads(result.output)
    assert data['origin']['file_type'] == 'edm4hep'
    piece_types = {piece['type'] for piece in data['events'][0]['pieces']}
    assert piece_types == {'BoxHit', 'PointTrajectory'}


def test_convert_edm4eic_auto_detected(runner):
    # eicrecon/edm4eic files also contain sim hits; auto-detection must pick edm4eic
    result = runner.invoke(convert, [TEST_ROOT_FILE, '--output', '-'])

    assert result.exit_code == 0, f"Command failed with exit code {result.exit_code}"
    data = json.loads(result.output)
    assert data['origin']['file_type'] == 'edm4eic'


def test_convert_missing_file(runner):
    # Attempt to convert a non-existent file
    result = runner.invoke(convert, ['nonexistent.root'])
    assert result.exit_code != 0, "Command should fail with non-existent file"
    assert isinstance(result.exception, FileNotFoundError)


@pytest.mark.parametrize(
    "input_entry, expected_output, output_extension",
    [
        # Test cases with default output_extension
        ('filename.txt', 'filename.firebird.json', '.firebird.json'),
        ('filename', 'filename.firebird.json', '.firebird.json'),
        ('root://filename.txt', 'filename.firebird.json', '.firebird.json'),
        ('http://filename', 'filename.firebird.json', '.firebird.json'),
        ('protocol1://protocol2://filename.ext', 'filename.firebird.json', '.firebird.json'),
        # A URL gives its file name only: the output lands in the current directory
        ('root://dtn-eic.jlab.org//volatile/eic/run.edm4eic.root', 'run.edm4eic.firebird.json', '.firebird.json'),
        ('https://example.org/data/run.root?token=abc#frag', 'run.firebird.json', '.firebird.json'),
        ('https://example.org/data/', 'data.firebird.json', '.firebird.json'),
        # A local path keeps its directory; a one-letter scheme is a Windows drive
        ('data/run.root', 'data/run.firebird.json', '.firebird.json'),
        ('C://path/to/filename.ext', 'C://path/to/filename.firebird.json', '.firebird.json'),
        ('', '.firebird.json', '.firebird.json'),

        # Test cases with custom output_extension
        ('filename.dat', 'filename.custom', '.custom'),
        ('ftp://filename.bin', 'filename.custom', '.custom'),
    ]
)
def test_guess_output_name(input_entry, expected_output, output_extension):
    assert guess_output_name(input_entry, output_extension) == expected_output


def test_guess_output_name_none_input():
    with pytest.raises(TypeError):
        guess_output_name(None)


def test_convert_zip_output_is_a_zip_archive(runner, work_dir):
    """An output name ending in .zip writes an archive that pyrobird and the frontend read back."""
    result = runner.invoke(convert, ['test_data.root', '-e', '0-1', '-o', 'reco.v1.firebird.zip'])

    assert result.exit_code == 0, result.exception
    assert zipfile.is_zipfile('reco.v1.firebird.zip')
    assert [event['id'] for event in read_dex_json('reco.v1.firebird.zip')['events']] == [0, 1]
