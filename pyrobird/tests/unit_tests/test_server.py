# test_open_edm4eic.py

import pytest
import os
import json
import shutil
from unittest.mock import patch
from flask import Flask
from flask.testing import FlaskClient
from pyrobird.server import flask_app  # Import your Flask app
from pyrobird.server import open_edm4eic_file  # Import the function to test
from pyrobird.edm4eic import edm4eic_entry_to_dict  # Import the function used within the route


# Path to the test ROOT file (adjust the path as needed)
TEST_ROOT_FILE = os.path.join(os.path.dirname(__file__), 'data', 'reco_2024-09_craterlake_2evt.edm4eic.root')
TEST_ROOT_DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')


@pytest.fixture
def client():
    # flask_app is a module-level singleton: restore its config after each test
    saved_config = dict(flask_app.config)

    # Configure the Flask app for testing
    flask_app.config['TESTING'] = True
    # Set the PYROBIRD_DOWNLOAD_PATH to the 'data' directory where test files are located
    flask_app.config['PYROBIRD_DOWNLOAD_PATH'] = os.path.abspath(TEST_ROOT_DATA_DIR)
    # Ensure downloads are allowed
    flask_app.config['PYROBIRD_DOWNLOAD_IS_DISABLED'] = False
    flask_app.config['PYROBIRD_DOWNLOAD_IS_UNRESTRICTED'] = False

    yield flask_app.test_client()

    flask_app.config.clear()
    flask_app.config.update(saved_config)


def test_open_edm4eic_file_local_allowed(client):
    # Test accessing a permitted local file
    filename = TEST_ROOT_FILE
    event_number = 0
    response = client.get(f'/api/v1/convert/edm4eic/{event_number}?f={filename}')

    assert response.status_code == 200
    data = response.get_json()
    assert data is not None
    assert 'events' in data
    assert 'pieces' in data['events'][0]
    assert data['events'][0]["id"] == event_number


def test_open_edm4hep_file(client):
    # file_type=edm4hep must route to the edm4hep reader
    filename = 'k_lambda_10x100_2evt.edm4hep.root'
    response = client.get(f'/api/v1/convert/edm4hep/0?f={filename}')

    assert response.status_code == 200
    data = response.get_json()
    piece_types = {piece['type'] for piece in data['events'][0]['pieces']}
    assert piece_types == {'BoxHit', 'PointTrajectory'}


def test_open_file_auto_type(client):
    # file_type=auto detects the model from branch types
    filename = 'k_lambda_10x100_2evt.edm4hep.root'
    response = client.get(f'/api/v1/convert/auto/0?f={filename}')

    assert response.status_code == 200
    data = response.get_json()
    assert len(data['events'][0]['pieces']) > 0


def test_open_file_unsupported_type(client):
    filename = 'k_lambda_10x100_2evt.edm4hep.root'
    response = client.get(f'/api/v1/convert/wrongtype/0?f={filename}')

    assert response.status_code == 400


def test_open_edm4eic_file_local_not_allowed(client):
    from urllib.parse import quote
    # Test accessing a local file outside of PYROBIRD_DOWNLOAD_PATH
    filename = '/etc/passwd'  # A file outside the allowed path
    event_number = 0
    encoded_filename = quote(filename, safe='')
    response = client.get(f'/api/v1/convert/edm4eic/{event_number}?f={encoded_filename}')

    assert response.status_code == 403


def test_open_dangerous(client, tmp_path):
    # With PYROBIRD_DOWNLOAD_IS_UNRESTRICTED a file outside PYROBIRD_DOWNLOAD_PATH is served
    outside = tmp_path / "outside.txt"
    outside.write_text("outside")
    flask_app.config['PYROBIRD_DOWNLOAD_IS_UNRESTRICTED'] = True
    flask_app.config['PYROBIRD_DOWNLOAD_IS_DISABLED'] = False
    response = client.get('/api/v1/download', query_string={'filename': str(outside)})
    assert response.status_code == 200
    assert response.data == b"outside"

    # The same request in the default restricted mode is forbidden
    flask_app.config['PYROBIRD_DOWNLOAD_IS_UNRESTRICTED'] = False
    response = client.get('/api/v1/download', query_string={'filename': str(outside)})
    assert response.status_code == 403


def test_open_edm4eic_file_invalid_event_number(client):
    # Test accessing an invalid event number
    filename = 'reco_2024-09_craterlake_2evt.edm4eic.root'
    event_number = 100  # Assuming the file has less than 100 events
    response = client.get(f'/api/v1/convert/edm4eic/{event_number}?f={filename}')

    assert response.status_code == 400  # Bad Request


def test_open_edm4eic_file_nonexistent_file(client):
    # Test accessing a file that does not exist
    filename = 'nonexistent_file.edm4eic.root'
    event_number = 0
    response = client.get(f'/api/v1/convert/edm4eic/{event_number}?f={filename}')

    assert response.status_code == 404  # Not Found


def test_open_edm4eic_file_PYROBIRD_DOWNLOAD_IS_DISABLEDd(client):
    # Test accessing a file when downloads are disabled
    flask_app.config['PYROBIRD_DOWNLOAD_IS_DISABLED'] = True

    filename = 'reco_2024-09_craterlake_2evt.edm4eic.root'
    event_number = 0
    response = client.get(f'/api/v1/convert/edm4eic/{event_number}?f={filename}')

    assert response.status_code == 403  # Forbidden

    # Re-enable downloads for other tests
    flask_app.config['PYROBIRD_DOWNLOAD_IS_DISABLED'] = False


def test_asset_config_startup_commands_passthrough(client):
    """PYROBIRD_STARTUP_COMMANDS lands in config.jsonc as startupCommands (frontend command bus)."""
    flask_app.config['PYROBIRD_STARTUP_COMMANDS'] = 'open-dex:file.firebird.zip;show-event:2'
    try:
        response = client.get('/assets/config.jsonc')
        assert response.status_code == 200
        data = response.get_json()
        assert data['startupCommands'] == ['open-dex:file.firebird.zip;show-event:2']
        assert data['servedByPyrobird'] is True
    finally:
        flask_app.config['PYROBIRD_STARTUP_COMMANDS'] = None


def test_asset_config_no_startup_commands(client):
    """Without the setting, startupCommands is absent (or whatever the static file carries)."""
    flask_app.config['PYROBIRD_STARTUP_COMMANDS'] = None
    response = client.get('/assets/config.jsonc')
    assert response.status_code == 200
    data = response.get_json()
    assert 'startupCommands' not in data or isinstance(data['startupCommands'], list)


def test_open_edm4eic_file_invalid_file(client):
    # Test accessing a file that is not a valid ROOT file
    # Create an invalid file in the data directory
    invalid_filename = 'invalid_file.root'
    invalid_file_path = os.path.join(flask_app.config['PYROBIRD_DOWNLOAD_PATH'], invalid_filename)
    with open(invalid_file_path, 'w') as f:
        f.write('This is not a valid ROOT file.')

    event_number = 0
    response = client.get(f'/api/v1/convert/edm4eic/{event_number}?f={invalid_filename}')

    assert response.status_code == 500  # Internal Server Error

    # Clean up the invalid file
    try:
        os.remove(invalid_file_path)
    except PermissionError as ex:
        print(f"Can't delete {invalid_file_path} probably is locked or no rights: {ex}. "
              f"Continue as is, consider this message as warning")


# ---------------------------------------------------------------------------
# Work path containment: restricted mode, sibling directories and symlinks
# ---------------------------------------------------------------------------

@pytest.fixture
def work_tree(tmp_path):
    """<base>/work is the work path; <base>/work-secret shares its name as a prefix."""
    work = tmp_path / "work"
    secret = tmp_path / "work-secret"
    work.mkdir()
    secret.mkdir()
    (work / "inside.txt").write_text("inside")
    (secret / "key.txt").write_text("secret")
    shutil.copy(TEST_ROOT_FILE, work / "inside.edm4eic.root")
    shutil.copy(TEST_ROOT_FILE, secret / "secret.edm4eic.root")
    os.symlink(secret / "key.txt", work / "escape.txt")
    os.symlink(secret / "secret.edm4eic.root", work / "escape.edm4eic.root")
    os.symlink(work / "inside.txt", work / "alias.txt")
    flask_app.config['PYROBIRD_DOWNLOAD_PATH'] = str(work)
    return work, secret


def test_is_path_inside(tmp_path):
    from pyrobird.server import is_path_inside
    work = tmp_path / "work"
    work.mkdir()
    assert is_path_inside(str(work / "a" / "b.txt"), str(work))
    assert is_path_inside(str(work), str(work))
    assert not is_path_inside(str(tmp_path / "work-secret" / "key.txt"), str(work))
    assert not is_path_inside(str(work / ".." / "work-secret"), str(work))


@pytest.mark.parametrize("name", ["../work-secret/key.txt", "escape.txt"])
def test_download_restricted_rejects_sibling(client, work_tree, name):
    response = client.get('/api/v1/download', query_string={'f': name})
    assert response.status_code == 403


def test_download_restricted_rejects_absolute_sibling(client, work_tree):
    work, secret = work_tree
    response = client.get('/api/v1/download', query_string={'f': str(secret / "key.txt")})
    assert response.status_code == 403


@pytest.mark.parametrize("name", ["inside.txt", "alias.txt"])
def test_download_restricted_serves_in_tree_file(client, work_tree, name):
    response = client.get('/api/v1/download', query_string={'f': name})
    assert response.status_code == 200
    assert response.data == b"inside"
    # The download keeps the requested name, not the symlink target's
    assert name in response.headers['Content-Disposition']


def test_download_absolute_in_tree_file(client, work_tree):
    work, _ = work_tree
    response = client.get('/api/v1/download', query_string={'f': str(work / "inside.txt")})
    assert response.status_code == 200


@pytest.mark.parametrize("name", ["../work-secret/secret.edm4eic.root", "escape.edm4eic.root"])
def test_convert_restricted_rejects_sibling(client, work_tree, name):
    with patch('uproot.open') as uproot_open:
        response = client.get('/api/v1/convert/edm4eic/0', query_string={'f': name})
    assert response.status_code == 403
    uproot_open.assert_not_called()


def test_convert_restricted_rejects_absolute_sibling(client, work_tree):
    work, secret = work_tree
    with patch('uproot.open') as uproot_open:
        response = client.get('/api/v1/convert/edm4eic/0',
                              query_string={'f': str(secret / "secret.edm4eic.root")})
    assert response.status_code == 403
    uproot_open.assert_not_called()


def test_convert_restricted_serves_in_tree_file(client, work_tree):
    response = client.get('/api/v1/convert/edm4eic/0', query_string={'f': 'inside.edm4eic.root'})
    assert response.status_code == 200


@pytest.mark.parametrize("value", ['true', 'True', '1'])
def test_download_disabled_flag_as_string(client, value):
    """A string such as 'true' from a WSGI config or the environment disables downloads."""
    flask_app.config['PYROBIRD_DOWNLOAD_IS_DISABLED'] = value
    response = client.get('/api/v1/download', query_string={'f': 'reco_2024-09_craterlake_2evt.edm4eic.root'})
    assert response.status_code == 403


def test_unrestricted_flag_false_string_stays_restricted(client):
    flask_app.config['PYROBIRD_DOWNLOAD_IS_UNRESTRICTED'] = 'false'
    response = client.get('/api/v1/download', query_string={'f': '/etc/hostname'})
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# The /shutdown endpoint is gone
# ---------------------------------------------------------------------------

def test_shutdown_route_is_removed(client):
    rules = {rule.rule for rule in flask_app.url_map.iter_rules()}
    assert '/shutdown' not in rules

    with patch('os._exit', side_effect=AssertionError("os._exit called")) as os_exit:
        post_response = client.post('/shutdown')
        get_response = client.get('/shutdown')

    os_exit.assert_not_called()
    # POST reaches no route; GET falls through to the frontend's catch-all route
    assert post_response.status_code == 405
    assert get_response.status_code in (200, 404)
    assert b'shutting down' not in get_response.data


# ---------------------------------------------------------------------------
# Entry selections: bounded before expansion, one out-of-range policy
# ---------------------------------------------------------------------------

def test_convert_huge_range_rejected_before_file_access(client):
    with patch('uproot.open') as uproot_open:
        response = client.get('/api/v1/convert/edm4eic/0-20000000?f=nonexistent.root')
    assert response.status_code == 400
    assert "20000001 entries" in response.get_json()['error']
    uproot_open.assert_not_called()


def test_convert_huge_range_checked_before_access_gate(client):
    """The size check needs no file, so it answers before the 403 for a forbidden path."""
    response = client.get('/api/v1/convert/edm4eic/0-20000000?f=/etc/passwd')
    assert response.status_code == 400


def test_convert_max_entries_configurable(client):
    flask_app.config['PYROBIRD_CONVERT_MAX_ENTRIES'] = 1
    response = client.get('/api/v1/convert/edm4eic/0-1?f=reco_2024-09_craterlake_2evt.edm4eic.root')
    assert response.status_code == 400
    assert "at most 1" in response.get_json()['error']


def test_convert_partly_out_of_range_rejected(client, caplog):
    """Out-of-range entries reject the request, as in the browser converter; one warning is logged."""
    with caplog.at_level('WARNING', logger='pyrobird.server'):
        response = client.get('/api/v1/convert/edm4eic/0-5?f=reco_2024-09_craterlake_2evt.edm4eic.root')
    assert response.status_code == 400
    assert response.get_json()['error'] == (
        "For entries='0-5': Event 2-5 is out of range: the file holds 2 events (0..1)")
    warnings = [r for r in caplog.records if r.name == 'pyrobird.server' and r.levelname == 'WARNING']
    assert len(warnings) == 1


def test_convert_out_of_range_listing_truncated(client):
    response = client.get('/api/v1/convert/edm4eic/0,3,5,7,9,11,13,15?f=reco_2024-09_craterlake_2evt.edm4eic.root')
    assert response.status_code == 400
    assert "(and 2 more)" in response.get_json()['error']


def test_convert_invalid_entry_format(client):
    response = client.get('/api/v1/convert/edm4eic/abc?f=reco_2024-09_craterlake_2evt.edm4eic.root')
    assert response.status_code == 400
    assert "Invalid entry format" in response.get_json()['error']


def test_convert_entry_range_in_file(client):
    response = client.get('/api/v1/convert/edm4eic/0-1?f=reco_2024-09_craterlake_2evt.edm4eic.root')
    assert response.status_code == 200
    assert [event['id'] for event in response.get_json()['events']] == [0, 1]


# ---------------------------------------------------------------------------
# Remote sources: --disable-files and the host allow-list
# ---------------------------------------------------------------------------

REMOTE_URL = 'root://dtn-eic.jlab.org//volatile/eic/run.edm4eic.root'


def test_remote_convert_blocked_when_files_disabled(client):
    flask_app.config['PYROBIRD_DOWNLOAD_IS_DISABLED'] = True
    with patch('uproot.open') as uproot_open:
        response = client.get('/api/v1/convert/edm4eic/0', query_string={'f': REMOTE_URL})
    assert response.status_code == 403
    uproot_open.assert_not_called()


@pytest.mark.parametrize("allowed", ['example.org', ['example.org', 'jlab.org']])
def test_remote_convert_blocked_for_unlisted_host(client, allowed):
    flask_app.config['PYROBIRD_REMOTE_HOSTS'] = allowed
    with patch('uproot.open') as uproot_open:
        response = client.get('/api/v1/convert/edm4eic/0', query_string={'f': REMOTE_URL})
    assert response.status_code == 403
    uproot_open.assert_not_called()


@pytest.mark.parametrize("allowed", [None, '', 'dtn-eic.jlab.org', 'example.org, DTN-EIC.jlab.org', '.jlab.org'])
def test_remote_convert_allowed_host_reaches_reader(client, allowed):
    flask_app.config['PYROBIRD_REMOTE_HOSTS'] = allowed
    with patch('uproot.open', side_effect=OSError("no network in tests")) as uproot_open:
        response = client.get('/api/v1/convert/edm4eic/0', query_string={'f': REMOTE_URL})
    # Past the gate: the reader is called and fails
    uproot_open.assert_called_once_with(REMOTE_URL)
    assert response.status_code == 500


@pytest.mark.parametrize("host, patterns, expected", [
    ('dtn-eic.jlab.org', ['dtn-eic.jlab.org'], True),
    ('DTN-EIC.JLAB.ORG', ['dtn-eic.jlab.org'], True),
    ('dtn-eic.jlab.org', ['.jlab.org'], True),
    ('jlab.org', ['.jlab.org'], True),
    ('evil-jlab.org', ['.jlab.org'], False),
    ('jlab.org.evil.com', ['jlab.org'], False),
    ('169.254.169.254', ['jlab.org'], False),
    (None, ['jlab.org'], False),
])
def test_is_host_allowed(host, patterns, expected):
    from pyrobird.server import is_host_allowed
    assert is_host_allowed(host, patterns) is expected


# ---------------------------------------------------------------------------
# config.jsonc served by pyrobird
# ---------------------------------------------------------------------------

@pytest.fixture
def custom_config(tmp_path):
    path = tmp_path / "config.jsonc"
    path.write_text('{\n  // comment\n  "userConfigs": {"a": 1, "keep": "file"},\n  "logLevel": "info"\n}\n')
    flask_app.config['PYROBIRD_FIREBIRD_CONFIG_PATH'] = str(path)
    return path


def test_asset_config_merges_user_configs(client, custom_config):
    flask_app.config['PYROBIRD_USER_CONFIGS'] = {"a": 3, "b": 2}
    data = client.get('/assets/config.jsonc').get_json()
    assert data['userConfigs'] == {"a": 3, "b": 2, "keep": "file"}
    assert data['logLevel'] == 'info'


def test_asset_config_user_configs_json_string(client, custom_config):
    flask_app.config['PYROBIRD_USER_CONFIGS'] = '{"b": true}'
    data = client.get('/assets/config.jsonc').get_json()
    assert data['userConfigs'] == {"a": 1, "keep": "file", "b": True}


def test_asset_config_keeps_file_user_configs(client, custom_config):
    data = client.get('/assets/config.jsonc').get_json()
    assert data['userConfigs'] == {"a": 1, "keep": "file"}
    assert 'experiment.haha' not in data['userConfigs']


@pytest.mark.parametrize("base_url, api_base_url, host, port", [
    ('http://localhost', 'http://localhost', 'localhost', 80),
    ('http://localhost:5454', 'http://localhost:5454', 'localhost', 5454),
    ('http://[::1]:5454', 'http://[::1]:5454', '::1', 5454),
    ('https://example.org', 'https://example.org', 'example.org', 443),
    ('https://example.org:8443', 'https://example.org:8443', 'example.org', 8443),
])
def test_asset_config_api_base_url(client, base_url, api_base_url, host, port):
    response = client.get('/assets/config.jsonc', base_url=base_url)
    assert response.status_code == 200
    data = response.get_json()
    assert data['apiBaseUrl'] == api_base_url
    assert data['serverHost'] == host
    assert data['serverPort'] == port


def test_asset_config_api_url_override(client):
    flask_app.config['PYROBIRD_API_BASE_URL'] = 'https://my-server:1234/'
    data = client.get('/assets/config.jsonc').get_json()
    assert data['apiBaseUrl'] == 'https://my-server:1234'


# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------

def test_missing_asset_is_404(client):
    response = client.get('/assets/data/no-such-file.firebird.json')
    assert response.status_code == 404


@pytest.mark.skipif(not os.path.isfile(os.path.join(flask_app.static_folder or '', 'index.html')),
                    reason="the frontend is not built into pyrobird/server/static")
def test_spa_route_serves_index(client):
    response = client.get('/display')
    assert response.status_code == 200
    assert b'<html' in response.data.lower()


@pytest.mark.skipif(not os.path.isfile(os.path.join(flask_app.static_folder or '', 'assets', 'data',
                                                    'example-cherenkov.firebird.json')),
                    reason="the frontend is not built into pyrobird/server/static")
def test_existing_asset_is_served(client):
    response = client.get('/assets/data/example-cherenkov.firebird.json')
    assert response.status_code == 200
