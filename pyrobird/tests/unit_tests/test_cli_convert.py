# test_convert.py

import pytest
from click.testing import CliRunner
from pyrobird.cli.convert import convert  # Import your convert function
import os
import json
from pyrobird.cli.convert import guess_output_name

# Assuming the small ROOT file is named 'test_data.root' and is placed in the 'tests' directory
TEST_ROOT_FILE = os.path.join(os.path.dirname(__file__), 'data', 'reco_2024-09_craterlake_2evt.edm4eic.root')


@pytest.fixture
def runner():
    return CliRunner()


def test_convert_default_output(runner, tmp_path):
    # Use a temporary directory for the output file
    with runner.isolated_filesystem():
        # Copy the test ROOT file into the isolated filesystem
        test_root_file = 'test_data.root'
        with open(TEST_ROOT_FILE, 'rb') as src_file:
            with open(test_root_file, 'wb') as dst_file:
                dst_file.write(src_file.read())

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


def test_convert_specified_output(runner):
    with runner.isolated_filesystem():
        # Copy the test ROOT file
        test_root_file = 'test_data.root'
        with open(TEST_ROOT_FILE, 'rb') as src_file:
            with open(test_root_file, 'wb') as dst_file:
                dst_file.write(src_file.read())

        # Specify an output file name
        output_file = 'custom_output.json'
        result = runner.invoke(convert, [test_root_file, '--output', output_file])

        assert result.exit_code == 0, f"Command failed with exit code {result.exit_code}"
        assert os.path.exists(output_file), "Specified output file was not created"


def test_convert_output_to_stdout(runner):
    with runner.isolated_filesystem():
        # Copy the test ROOT file
        test_root_file = 'test_data.root'
        with open(TEST_ROOT_FILE, 'rb') as src_file:
            with open(test_root_file, 'wb') as dst_file:
                dst_file.write(src_file.read())

        # Output to stdout
        result = runner.invoke(convert, [test_root_file, '--output', '-'])

        assert result.exit_code == 0, f"Command failed with exit code {result.exit_code}"
        # The output should be the JSON data
        assert result.output.strip().startswith('{'), "Output is not JSON data"
        # Optionally, parse the JSON and perform assertions
        data = json.loads(result.output)
        assert isinstance(data, dict), "Output JSON is not a dictionary"
        # Add more assertions based on expected content


def test_convert_invalid_entry(runner):
    with runner.isolated_filesystem():
        # Copy the test ROOT file
        test_root_file = 'test_data.root'
        with open(TEST_ROOT_FILE, 'rb') as src_file:
            with open(test_root_file, 'wb') as dst_file:
                dst_file.write(src_file.read())

        # Test file doesn't have event 1000
        result = runner.invoke(convert, [test_root_file, '--output', '-', '-e', '1000'])

        assert result.exit_code == 1, f"Command failed with exit code {result.exit_code}"
        # The output should be the JSON data
        assert isinstance(result.exception, ValueError)


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
        ('C://path/to/filename.ext', 'path/to/filename.firebird.json', '.firebird.json'),
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
