import threading
import time
import click
import os
import glob

import urllib.request
import urllib.error


def run_flask_app(unsecure_files, allow_cors, disable_download, work_path, commands=""):
    args = []
    if unsecure_files:
        args.append('--allow-any-file')
    if allow_cors:
        args.append('--allow-cors')
    if disable_download:
        args.append('--disable-files')
    if work_path:
        args.extend(['--work-path', work_path])
    if commands:
        args.extend(['--startup-commands', commands])

    from pyrobird.cli.serve import serve as cli_serve_command
    cli_serve_command.main(args=args, standalone_mode=False)


def get_screenshot_path(output_path):
    """Generate unique screenshot path with auto-numbering in screenshots/ directory."""
    os.makedirs('screenshots', exist_ok=True)

    name, ext = os.path.splitext(os.path.basename(output_path))
    ext = ext or '.png'

    base_path = os.path.join('screenshots', f"{name}{ext}")
    if not os.path.exists(base_path):
        return base_path

    # Extract numbers from existing files and find next available
    existing_numbers = []
    for file in glob.glob(os.path.join('screenshots', f"{name}_*{ext}")):
        try:
            num = int(os.path.basename(file)[len(name) + 1:-len(ext)])
            existing_numbers.append(num)
        except ValueError:
            pass

    next_num = max(existing_numbers, default=0) + 1
    return os.path.join('screenshots', f"{name}_{next_num:03d}{ext}")



# The display publishes readiness to `window.firebird` (BatchStatusService):
# ready = startup commands ran AND no geometry/event load is in flight.
# Waiting on it replaces the old fixed sleep that raced heavy geometry loads.
READY_JS_CONDITION = "() => window.firebird && window.firebird.ready === true"


def wait_display_ready(page, timeout_sec):
    """Waits until the display reports ready. Returns True on success."""
    try:
        page.wait_for_function(READY_JS_CONDITION, timeout=timeout_sec * 1000)
        return True
    except Exception:
        return False


def capture_screenshot(url, output_path, ready_timeout=120):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Playwright is not installed! Playwright is a python library that controls Chrome browser")
        print("Running headless chrome is needed to make a screenshot in a batch mode")
        print("You can install playwright with command: ")
        print("   python3 -m pip install --upgrade playwright")
        print("   python3 -m playwright install chromium")
        print("Beware that on the first run, if chrome is not installed in the system it will try to download it")
        print("Google playwright-python if not sure. Exiting without screenshot now")
        exit(1)

    # Launch a headless browser using Playwright's sync API
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1920, "height": 1080})
        page.goto(url)

        # Wait for the content to render
        try:
            page.wait_for_load_state("domcontentloaded", timeout=10_000)
        except:
            try:
                page.wait_for_selector('body', timeout=10_000)
            except:
                time.sleep(3)

        # Wait for geometry/events/startup-commands completion.
        if wait_display_ready(page, ready_timeout):
            print("Display reported ready (geometry loaded, startup commands done)")
            # One breath for the final rendered frame to hit the canvas
            time.sleep(1)
        else:
            print(f"WARNING: display did not report ready within {ready_timeout}s "
                  "(old frontend or non-display page?). Falling back to a fixed wait.")
            time.sleep(2)

        # Take a screenshot
        page.screenshot(path=output_path, full_page=True, timeout=90_000)
        browser.close()


@click.command()
@click.option('--unsecure-files', is_flag=True, default=False, help='Allow unrestricted file downloads')
@click.option('--allow-cors', is_flag=True, default=False, help='Enable CORS for downloaded files')
@click.option('--disable-download', is_flag=True, default=False, help='Disable all file downloads')
@click.option('--work-path', default='', help='Set the base directory path for file downloads')
@click.option('--output-path', default='screenshot.png',
              help='Base filename for the screenshot (will be saved in screenshots/ with auto-numbering)')
@click.option('--url', default='http://localhost:5454', help='URL to take the screenshot of')
@click.option('--commands', default='',
              help="Startup commands the display runs before the capture, "
                   "'type:arg' items separated by ';'. "
                   "Example: 'open-dex:file.firebird.zip;show-event:2;camera-preset:farforward'")
@click.option('--ready-timeout', default=120, show_default=True,
              help='Seconds to wait for the display to report ready (geometry loaded, commands done)')
def screenshot(unsecure_files, allow_cors, disable_download, work_path, output_path, url, commands, ready_timeout):
    """
    Start the Flask server, take a screenshot of the specified URL using Playwright,
    and then shut down the server.

    The capture waits for the display's readiness flags (window.firebird.ready):
    geometry loaded, startup commands executed, no loads in flight.

    Screenshots are saved in the 'screenshots' folder with automatic numbering to prevent overwrites.
    All options can be customized via command-line arguments.
    """
    # Start Flask app in a separate thread
    flask_thread = threading.Thread(
        target=run_flask_app,
        args=(unsecure_files, allow_cors, disable_download, work_path, commands),
        daemon=True  # Use daemon=True to ensure it exits when the main thread does
    )
    flask_thread.start()

    # Wait for Flask app to start
    time.sleep(2)

    # Ensure Flask is running
    for _ in range(10):
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req) as response:
                status_code = response.getcode()
                if status_code == 200:
                    break
        except urllib.error.URLError:
            time.sleep(1)
    else:
        print("Flask app did not start correctly")
        return

    # Get the next available screenshot path
    final_output_path = get_screenshot_path(output_path)

    # Run Playwright code to take screenshot
    capture_screenshot(url, final_output_path)
    print(f"Screenshot saved to {final_output_path}")

    # Shutdown Flask app. The shutdown endpoint lives at the server ORIGIN —
    # deep-link URLs carry a path and query that must not leak into it.
    from urllib.parse import urlparse
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    try:
        shutdown_url = origin + '/shutdown'
        data = ''.encode('utf-8')  # Empty data for POST
        req = urllib.request.Request(shutdown_url, data=data)
        with urllib.request.urlopen(req, timeout=3) as response:
            print("Flask app shutdown successfully")
    except urllib.error.HTTPError as e:
        if e.code == 500:
            print("Flask app shutdown initiated (500 error is expected)")
        else:
            print(f"Unexpected HTTP error during shutdown: {e.code}")


if __name__ == '__main__':
    screenshot()
