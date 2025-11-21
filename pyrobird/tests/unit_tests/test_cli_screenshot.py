# test_cli_screenshot.py

import pytest
import os
import sys
from unittest.mock import patch, MagicMock
from pyrobird.cli.screenshot import get_screenshot_path, capture_screenshot

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
def test_capture_screenshot_basic_workflow(mock_sync_playwright, tmp_path):
    """Test the basic workflow of capture_screenshot."""
    # Setup mocks
    mock_playwright = MagicMock()
    mock_browser = MagicMock()
    mock_page = MagicMock()
    
    mock_sync_playwright.return_value.__enter__.return_value = mock_playwright
    mock_playwright.chromium.launch.return_value = mock_browser
    mock_browser.new_page.return_value = mock_page
    
    # Test URL and output path
    test_url = "http://localhost:5454"
    output_file = str(tmp_path / "test_screenshot.png")
    
    # Call the function
    capture_screenshot(test_url, output_file)
    
    # Verify the workflow
    mock_playwright.chromium.launch.assert_called_once_with(headless=True)
    mock_browser.new_page.assert_called_once()
    mock_page.set_viewport_size.assert_called_once_with({"width": 1920, "height": 1080})
    mock_page.goto.assert_called_once_with(test_url)
    mock_page.screenshot.assert_called_once_with(path=output_file, full_page=True)
    mock_browser.close.assert_called_once()


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
