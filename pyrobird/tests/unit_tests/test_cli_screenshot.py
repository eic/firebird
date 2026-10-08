# test_cli_screenshot.py

import pytest
import os
import sys
from unittest.mock import patch, MagicMock
import socket
import urllib.request
import json

import click
from click.testing import CliRunner

from pyrobird.cli.screenshot import (get_screenshot_path, capture_screenshot, wait_display_ready, WAIT_JS_CONDITION,
                                     read_display_state, DisplayState, resolve_capture_url, start_server,
                                     screenshot, EXIT_OK, EXIT_FAILURE, EXIT_NOT_READY, EXIT_DISPLAY_ERRORS)

# Check if playwright is available
try:
    import playwright.sync_api
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False


@pytest.fixture
def temp_screenshots_dir(tmp_path):
    """Create a temporary screenshots directory."""
    screenshots_dir = tmp_path / "screenshots"
    screenshots_dir.mkdir()
    return tmp_path


def test_get_screenshot_path_creates_directory(tmp_path):
    """Test that get_screenshot_path creates the screenshots directory."""
    # Change to temp directory
    original_cwd = os.getcwd()
    os.chdir(tmp_path)
    
    try:
        output_path = get_screenshot_path("test.png")
        assert os.path.exists("screenshots"), "Screenshots directory was not created"
        assert output_path == os.path.join("screenshots", "test.png")
    finally:
        os.chdir(original_cwd)


def test_get_screenshot_path_no_extension(tmp_path):
    """Test that get_screenshot_path adds .png extension when none is provided."""
    original_cwd = os.getcwd()
    os.chdir(tmp_path)
    
    try:
        output_path = get_screenshot_path("test")
        assert output_path == os.path.join("screenshots", "test.png")
    finally:
        os.chdir(original_cwd)


def test_get_screenshot_path_auto_numbering(tmp_path):
    """Test that get_screenshot_path handles auto-numbering correctly."""
    original_cwd = os.getcwd()
    os.chdir(tmp_path)
    
    try:
        screenshots_dir = tmp_path / "screenshots"
        screenshots_dir.mkdir()
        
        # Create existing screenshot files
        (screenshots_dir / "test.png").touch()
        (screenshots_dir / "test_001.png").touch()
        (screenshots_dir / "test_002.png").touch()
        
        # Next screenshot should be test_003.png
        output_path = get_screenshot_path("test.png")
        assert output_path == os.path.join("screenshots", "test_003.png")
    finally:
        os.chdir(original_cwd)


def test_get_screenshot_path_no_existing_files(tmp_path):
    """Test get_screenshot_path when no files exist yet."""
    original_cwd = os.getcwd()
    os.chdir(tmp_path)
    
    try:
        output_path = get_screenshot_path("screenshot.png")
        assert output_path == os.path.join("screenshots", "screenshot.png")
    finally:
        os.chdir(original_cwd)


def test_get_screenshot_path_with_gaps_in_numbering(tmp_path):
    """Test that get_screenshot_path finds the next number even with gaps."""
    original_cwd = os.getcwd()
    os.chdir(tmp_path)
    
    try:
        screenshots_dir = tmp_path / "screenshots"
        screenshots_dir.mkdir()
        
        # Create files with gaps in numbering
        (screenshots_dir / "test.png").touch()
        (screenshots_dir / "test_001.png").touch()
        (screenshots_dir / "test_005.png").touch()  # Gap in numbering
        
        # Next screenshot should be test_006.png (max + 1)
        output_path = get_screenshot_path("test.png")
        assert output_path == os.path.join("screenshots", "test_006.png")
    finally:
        os.chdir(original_cwd)


def test_capture_screenshot_missing_playwright():
    """Test that capture_screenshot handles missing playwright gracefully."""
    with patch('builtins.__import__', side_effect=ImportError("No module named 'playwright'")):
        with pytest.raises(SystemExit) as exc_info:
            capture_screenshot("http://example.com", "/tmp/test.png")
        assert exc_info.value.code == 1


@pytest.mark.skipif(not PLAYWRIGHT_AVAILABLE, reason="playwright not installed")
@patch('playwright.sync_api.sync_playwright')
@patch('pyrobird.cli.screenshot.time.sleep')
def test_capture_screenshot_basic_workflow(mock_sleep, mock_sync_playwright, tmp_path):
    """Test the basic workflow of capture_screenshot."""
    # Setup mocks
    mock_playwright = MagicMock()
    mock_browser = MagicMock()
    mock_page = MagicMock()

    mock_sync_playwright.return_value.__enter__.return_value = mock_playwright
    mock_playwright.chromium.launch.return_value = mock_browser
    mock_browser.new_page.return_value = mock_page
    mock_page.evaluate.return_value = {'ready': True, 'errors': []}

    # Test URL and output path
    test_url = "http://localhost:5454"
    output_file = str(tmp_path / "test_screenshot.png")

    # Call the function
    state = capture_screenshot(test_url, output_file)

    # Verify the workflow
    mock_playwright.chromium.launch.assert_called_once_with(headless=True)
    mock_browser.new_page.assert_called_once()
    mock_page.set_viewport_size.assert_called_once_with({"width": 1920, "height": 1080})
    mock_page.goto.assert_called_once_with(test_url)
    # Waits on the display readiness flags before the capture
    mock_page.wait_for_function.assert_called_once_with(WAIT_JS_CONDITION, timeout=120 * 1000)
    mock_page.screenshot.assert_called_once_with(path=output_file, full_page=True, timeout=90_000)
    mock_browser.close.assert_called_once()
    assert state == DisplayState(True, [])


@pytest.mark.skipif(not PLAYWRIGHT_AVAILABLE, reason="playwright not installed")
@patch('playwright.sync_api.sync_playwright')
@patch('pyrobird.cli.screenshot.time.sleep')
def test_capture_screenshot_forwards_timeout_and_reports_errors(mock_sleep, mock_sync_playwright, tmp_path):
    mock_page = MagicMock()
    mock_sync_playwright.return_value.__enter__.return_value.chromium.launch.return_value.new_page.return_value = mock_page
    mock_page.evaluate.return_value = {'ready': False, 'errors': ['Geometry load failed: 404']}

    state = capture_screenshot("http://127.0.0.1:1/display", str(tmp_path / "x.png"), ready_timeout=7)

    mock_page.wait_for_function.assert_called_once_with(WAIT_JS_CONDITION, timeout=7000)
    # The capture still happens, so the failure can be inspected
    mock_page.screenshot.assert_called_once()
    assert state == DisplayState(False, ['Geometry load failed: 404'])


def test_wait_display_ready_true_and_false():
    """wait_display_ready returns True when the flag appears, False on timeout."""
    page = MagicMock()
    assert wait_display_ready(page, 5) is True
    page.wait_for_function.assert_called_once_with(WAIT_JS_CONDITION, timeout=5000)

    page_timeout = MagicMock()
    page_timeout.wait_for_function.side_effect = Exception("Timeout")
    assert wait_display_ready(page_timeout, 5) is False


@pytest.mark.skipif(not PLAYWRIGHT_AVAILABLE, reason="playwright not installed")
@patch('playwright.sync_api.sync_playwright')
def test_capture_screenshot_wait_for_load_state(mock_sync_playwright, tmp_path):
    """Test that capture_screenshot waits for the page to load."""
    # Setup mocks
    mock_playwright = MagicMock()
    mock_browser = MagicMock()
    mock_page = MagicMock()
    
    mock_sync_playwright.return_value.__enter__.return_value = mock_playwright
    mock_playwright.chromium.launch.return_value = mock_browser
    mock_browser.new_page.return_value = mock_page
    
    test_url = "http://localhost:5454"
    output_file = str(tmp_path / "test_screenshot.png")
    
    # Call the function
    capture_screenshot(test_url, output_file)
    
    # Verify wait_for_load_state was called
    mock_page.wait_for_load_state.assert_called_once_with("domcontentloaded", timeout=10_000)


@pytest.mark.skipif(not PLAYWRIGHT_AVAILABLE, reason="playwright not installed")
@patch('playwright.sync_api.sync_playwright')
@patch('pyrobird.cli.screenshot.time.sleep')
def test_capture_screenshot_fallback_to_selector(mock_sleep, mock_sync_playwright, tmp_path):
    """Test that capture_screenshot falls back to wait_for_selector if wait_for_load_state fails."""
    # Setup mocks
    mock_playwright = MagicMock()
    mock_browser = MagicMock()
    mock_page = MagicMock()
    
    mock_sync_playwright.return_value.__enter__.return_value = mock_playwright
    mock_playwright.chromium.launch.return_value = mock_browser
    mock_browser.new_page.return_value = mock_page
    
    # Make wait_for_load_state raise an exception
    mock_page.wait_for_load_state.side_effect = Exception("Timeout")
    
    test_url = "http://localhost:5454"
    output_file = str(tmp_path / "test_screenshot.png")
    
    # Call the function
    capture_screenshot(test_url, output_file)
    
    # Verify fallback to wait_for_selector was attempted
    mock_page.wait_for_selector.assert_called_once_with('body', timeout=10_000)


@pytest.mark.skipif(not PLAYWRIGHT_AVAILABLE, reason="playwright not installed")
@patch('playwright.sync_api.sync_playwright')
@patch('pyrobird.cli.screenshot.time.sleep')
def test_capture_screenshot_double_fallback(mock_sleep, mock_sync_playwright, tmp_path):
    """Test that capture_screenshot falls back to sleep if both wait methods fail."""
    # Setup mocks
    mock_playwright = MagicMock()
    mock_browser = MagicMock()
    mock_page = MagicMock()
    
    mock_sync_playwright.return_value.__enter__.return_value = mock_playwright
    mock_playwright.chromium.launch.return_value = mock_browser
    mock_browser.new_page.return_value = mock_page
    
    # Make both wait methods raise exceptions
    mock_page.wait_for_load_state.side_effect = Exception("Timeout")
    mock_page.wait_for_selector.side_effect = Exception("Timeout")
    
    test_url = "http://localhost:5454"
    output_file = str(tmp_path / "test_screenshot.png")
    
    # Call the function
    capture_screenshot(test_url, output_file)
    
    # Verify sleep was called as the final fallback
    assert mock_sleep.call_count >= 1  # At least one sleep(3) call in the fallback


@pytest.mark.parametrize("evaluated, expected", [
    ({'ready': True, 'errors': []}, DisplayState(True, [])),
    ({'ready': True}, DisplayState(True, [])),                      # frontend without `errors`
    ({'ready': False, 'errors': ['a', 2]}, DisplayState(False, ['a', '2'])),
    ({'ready': 'yes', 'errors': 'oops'}, DisplayState(False, [])),  # only a literal true counts
    (None, DisplayState(False, [])),                                # no window.firebird
])
def test_read_display_state(evaluated, expected):
    page = MagicMock()
    page.evaluate.return_value = evaluated
    assert read_display_state(page) == expected


def test_read_display_state_evaluate_fails():
    page = MagicMock()
    page.evaluate.side_effect = Exception("Target closed")
    assert read_display_state(page) == DisplayState(False, [])


ORIGIN = 'http://127.0.0.1:40123'


@pytest.mark.parametrize("url, expected", [
    ('http://localhost:5454', ORIGIN + '/'),
    ('http://localhost:5454/display?dex=asset://data/x.json&event=2',
     ORIGIN + '/display?dex=asset://data/x.json&event=2'),
    ('http://127.0.0.1:5454/display#top', ORIGIN + '/display#top'),
    ('http://[::1]:5454/display', ORIGIN + '/display'),
    ('http://0.0.0.0:5454/display', ORIGIN + '/display'),
    ('localhost:5454/display?event=1', ORIGIN + '/display?event=1'),
    ('/display?dex=x', ORIGIN + '/display?dex=x'),
    ('https://seeeic.org/display?event=1', 'https://seeeic.org/display?event=1'),
    # An explicit other port names another server, such as the ng dev server
    ('http://localhost:4200/display?event=1', 'http://localhost:4200/display?event=1'),
])
def test_resolve_capture_url(url, expected):
    assert resolve_capture_url(url, ORIGIN) == expected


@pytest.fixture
def restore_flask_config():
    from pyrobird.server import flask_app
    saved = dict(flask_app.config)
    yield
    flask_app.config.clear()
    flask_app.config.update(saved)


def test_start_server_binds_free_loopback_port(restore_flask_config):
    from pyrobird.cli.serve import make_server_config
    server = start_server(make_server_config(startup_commands='show-event:1'))
    try:
        assert server.server_address[0] == '127.0.0.1'
        assert server.server_port not in (0, 5454)
        url = f"http://127.0.0.1:{server.server_port}/assets/config.jsonc"
        with urllib.request.urlopen(url, timeout=5) as response:
            data = json.loads(response.read())
        assert data['apiBaseUrl'] == f"http://127.0.0.1:{server.server_port}"
        assert data['startupCommands'][-1] == 'show-event:1'
    finally:
        server.shutdown()
        server.server_close()


def test_start_server_fails_loudly_on_busy_port(restore_flask_config):
    from pyrobird.cli.serve import make_server_config
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as busy:
        busy.bind(('127.0.0.1', 0))
        busy.listen(1)
        port = busy.getsockname()[1]
        with pytest.raises(click.ClickException, match=f"127.0.0.1:{port}"):
            start_server(make_server_config(), port=port)


def _run_screenshot_command(tmp_path, monkeypatch, state, args=(), serves_frontend=True):
    monkeypatch.chdir(tmp_path)
    server = MagicMock()
    server.server_port = 40123
    with patch('pyrobird.cli.screenshot.start_server', return_value=server) as start, \
            patch('pyrobird.cli.screenshot.wait_server_serves_frontend', return_value=serves_frontend), \
            patch('pyrobird.cli.screenshot.capture_screenshot', return_value=state) as capture:
        result = CliRunner().invoke(screenshot, list(args))
    return result, start, capture, server


@pytest.mark.parametrize("state, code", [
    (DisplayState(True, []), EXIT_OK),
    (DisplayState(False, []), EXIT_NOT_READY),
    (DisplayState(True, ['Painter import failed']), EXIT_DISPLAY_ERRORS),
    (DisplayState(False, ['Geometry load failed']), EXIT_DISPLAY_ERRORS),
])
def test_screenshot_exit_code_reflects_display_state(tmp_path, monkeypatch, state, code):
    result, _, capture, server = _run_screenshot_command(tmp_path, monkeypatch, state)
    assert result.exit_code == code, result.output
    # The default URL is the root of the server the command started
    assert capture.call_args.args[0] == 'http://127.0.0.1:40123/'
    for error in state.errors:
        assert error in result.output
    server.shutdown.assert_called_once()


def test_screenshot_forwards_options(tmp_path, monkeypatch):
    result, start, capture, _ = _run_screenshot_command(
        tmp_path, monkeypatch, DisplayState(True, []),
        args=['--ready-timeout', '7', '--port', '5467', '--commands', 'show-event:2',
              '--url', 'http://localhost:5454/display?dex=asset://data/x.json'])
    assert result.exit_code == 0, result.output
    assert start.call_args.kwargs['port'] == 5467
    assert start.call_args.args[0]['PYROBIRD_STARTUP_COMMANDS'] == 'show-event:2'
    capture_url = capture.call_args.args[0]
    assert capture_url == 'http://127.0.0.1:40123/display?dex=asset://data/x.json'
    assert capture.call_args.kwargs['ready_timeout'] == 7


def test_screenshot_fails_when_frontend_missing(tmp_path, monkeypatch):
    result, _, capture, server = _run_screenshot_command(
        tmp_path, monkeypatch, DisplayState(True, []), serves_frontend=False)
    assert result.exit_code == EXIT_FAILURE
    capture.assert_not_called()
    server.shutdown.assert_called_once()
