# test_open_edm4eic.py

import pytest
import os
import json
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
    # Configure the Flask app for testing
    flask_app.config['TESTING'] = True
    # Set the PYROBIRD_DOWNLOAD_PATH to the 'data' directory where test files are located
    flask_app.config['PYROBIRD_DOWNLOAD_PATH'] = os.path.abspath(TEST_ROOT_DATA_DIR)
    # Ensure downloads are allowed
    flask_app.config['PYROBIRD_DOWNLOAD_IS_DISABLED'] = False
    flask_app.config['PYROBIRD_DOWNLOAD_IS_UNRESTRICTED'] = False

    return flask_app.test_client()


def test_open_edm4eic_file_local_allowed(client):
    # Test accessing a permitted local file
    filename = TEST_ROOT_FILE
    event_number = 0
    response = client.get(f'/api/v1/convert/edm4eic/{event_number}?f={filename}')

    assert response.status_code == 200
    data = response.get_json()
    assert data is not None
    assert 'events' in data
    assert 'groups' in data['events'][0]
    assert data['events'][0]["id"] == event_number


def test_open_edm4eic_file_local_not_allowed(client):
    from urllib.parse import quote
    # Test accessing a local file outside of PYROBIRD_DOWNLOAD_PATH
    filename = '/etc/passwd'  # A file outside the allowed path
    event_number = 0
    encoded_filename = quote(filename, safe='')
    response = client.get(f'/api/v1/convert/edm4eic/{event_number}?f={encoded_filename}')

    assert response.status_code == 403


def test_open_dangerous(client):
    # Test accessing a local file outside of PYROBIRD_DOWNLOAD_PATH
    filename = '/etc/passwd'  # A file outside the allowed path
    event_number = 0
    flask_app.config['PYROBIRD_DOWNLOAD_IS_UNRESTRICTED'] = True
    flask_app.config['PYROBIRD_DOWNLOAD_IS_DISABLED'] = False
    response = client.get(f'/api/v1/download?filename={filename}')
    assert response.status_code in [200, 404]  # OK


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
