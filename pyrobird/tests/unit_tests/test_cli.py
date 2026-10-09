# Created by: Dmitry Romanov, 2024
# This file is part of Firebird Event Display and is licensed under GPL-3.0-or-later.
# See the LICENSE file in the project root for full license information.

import pytest
from unittest.mock import patch
from click.testing import CliRunner

import pyrobird.server
from pyrobird.cli.serve import get_default_host, serve, non_loopback_bind_warning


def raises_value_error():
    raise ValueError("Invalid value")


def test_raises_value_error():
    with pytest.raises(ValueError, match="Invalid value"):
        raises_value_error()


def test_import_pyrobird_cli():
    """Test if the pyrobird.cli module can be imported."""
    try:
        from pyrobird import cli
    except ImportError as e:
        assert False, f"Failed to import pyrobird.cli: {e}"


@pytest.mark.parametrize("runtime, expected", [
    ('docker', '0.0.0.0'),
    ('kubernetes', '0.0.0.0'),
    # Apptainer and Singularity share the host network: loopback reaches the host browser
    ('apptainer', None),
    ('singularity', None),
    (None, None),
])
def test_get_default_host(runtime, expected):
    """Bind all interfaces only where the container has its own network."""
    with patch('pyrobird.cli.serve.container_runtime', return_value=runtime):
        assert get_default_host() == expected


def _invoke_serve(args, runtime=None):
    with patch('pyrobird.cli.serve.container_runtime', return_value=runtime), \
            patch.object(pyrobird.server, 'run') as run:
        result = CliRunner().invoke(serve, args)
    assert result.exit_code == 0, result.output
    return result, run


def test_serve_default_bind_has_no_warning():
    result, run = _invoke_serve([])
    assert run.call_args.kwargs['host'] is None
    assert run.call_args.kwargs['port'] == 5454
    assert 'WARNING' not in result.output


def test_serve_apptainer_binds_loopback():
    result, run = _invoke_serve([], runtime='apptainer')
    assert run.call_args.kwargs['host'] is None
    assert 'WARNING' not in result.output


def test_serve_docker_binds_all_and_warns(tmp_path):
    result, run = _invoke_serve(['--work-path', str(tmp_path)], runtime='docker')
    assert run.call_args.kwargs['host'] == '0.0.0.0'
    assert 'WARNING' in result.output
    assert str(tmp_path) in result.output


def test_serve_explicit_public_host_warns_about_any_file():
    result, run = _invoke_serve(['--host', '0.0.0.0', '--allow-any-file'])
    assert run.call_args.kwargs['host'] == '0.0.0.0'
    assert '--allow-any-file is on' in result.output


def test_serve_explicit_loopback_host_has_no_warning():
    result, run = _invoke_serve(['--host', '127.0.0.1', '--port', '5470'])
    assert run.call_args.kwargs['port'] == 5470
    assert 'WARNING' not in result.output


def test_serve_passes_remote_hosts():
    result, run = _invoke_serve(['--remote-hosts', '.jlab.org,example.org'])
    assert run.call_args.kwargs['config']['PYROBIRD_REMOTE_HOSTS'] == '.jlab.org,example.org'


def test_non_loopback_bind_warning_disabled_files():
    message = non_loopback_bind_warning('0.0.0.0', 5454, '', False, True)
    assert 'File access is disabled' in message
    assert non_loopback_bind_warning('localhost', 5454, '', True, False) is None
