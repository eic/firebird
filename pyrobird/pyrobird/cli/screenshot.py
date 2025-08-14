import threading
import time
import asyncio
import click
import os
import glob

import urllib.request
import urllib.error


def run_flask_app(unsecure_files, allow_cors, disable_download, work_path):
    args = []
    if unsecure_files:
        args.append('--allow-any-file')
    if allow_cors:
        args.append('--allow-cors')
    if disable_download:
        args.append('--disable-files')
    if work_path:
        args.extend(['--work-path', work_path])

    from pyrobird.cli.serve import serve as cli_serve_command
    cli_serve_command.main(args=args, standalone_mode=False)


def get_screenshot_path(output_path):
    # Create screenshots directory if it doesn't exist
    screenshots_dir = 'screenshots'
    os.makedirs(screenshots_dir, exist_ok=True)

    # Extract filename and extension from output_path
    filename = os.path.basename(output_path)
    name, ext = os.path.splitext(filename)

    if not ext:
        ext = '.png'

    base_path = os.path.join(screenshots_dir, f"{name}{ext}")
    if not os.path.exists(base_path):
        # Use base filename for first screenshot
        print(f"Will save screenshot to: {base_path}")
        return base_path

    pattern = os.path.join(screenshots_dir, f"{name}_*{ext}")
    existing_files = glob.glob(pattern)

    numbers = []
    for file in existing_files:
        base = os.path.basename(file)
        try:
            # Extract number between name_ and extension
            number_part = base[len(name) + 1:-len(ext)]
            numbers.append(int(number_part))
        except ValueError:
            continue

    if numbers:
        next_number = max(numbers) + 1
    else:
        next_number = 1

    final_path = os.path.join(screenshots_dir, f"{name}_{next_number:03d}{ext}")
    print(f"Will save screenshot to: {final_path}")
    return final_path


async def capture_screenshot(url, output_path):
    try:
        from pyppeteer import launch
    except ImportError:
        print("Pyppeteer is not installed! Pyppeteer is a python library that controls Chrome browser")
        print("Running headless chrome is needed to make a screenshot in a batch mode")
        print("You can install pyppeteer with command: ")
        print("   python3 -m pip install --upgrade pyppeteer")
        print("Beware that on the first run, if chrome is not installed in the system it will try to download it")
        print("Google pyppeteer if not sure. Exiting without screenshot now")
        exit(1)

    from pyppeteer import launch

    # Launch a headless browser
    browser = await launch(headless=True)
    # If necessary, adjust Pyppeteer launch options here
    page = await browser.newPage()
    await page.setViewport({'width': 1920, 'height': 1080})
    await page.goto(url)

    # Wait for the content to render
    try:
        await page.waitForFunction('document.readyState === "complete"', timeout=10000)
    except:
        try:
            await page.waitForSelector('body', timeout=10000)
        except:
            await asyncio.sleep(3)

    await asyncio.sleep(2)

    # Take a screenshot
    await page.screenshot({'path': output_path, 'fullPage': True})
    await browser.close()


@click.command()
@click.option('--unsecure-files', is_flag=True, default=False, help='Allow unrestricted file downloads')
@click.option('--allow-cors', is_flag=True, default=False, help='Enable CORS for downloaded files')
@click.option('--disable-download', is_flag=True, default=False, help='Disable all file downloads')
@click.option('--work-path', default='', help='Set the base directory path for file downloads')
@click.option('--output-path', default='screenshot.png',
              help='Base filename for the screenshot (will be saved in screenshots/ with auto-numbering)')
@click.option('--url', default='http://localhost:5454', help='URL to take the screenshot of')
def screenshot(unsecure_files, allow_cors, disable_download, work_path, output_path, url):
    """
    Start the Flask server, take a screenshot of the specified URL using Pyppeteer,
    and then shut down the server.

    Screenshots are saved in the 'screenshots' folder with automatic numbering to prevent overwrites.
    All options can be customized via command-line arguments.
    """
    # Start Flask app in a separate thread
    flask_thread = threading.Thread(
        target=run_flask_app,
        args=(unsecure_files, allow_cors, disable_download, work_path),
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

    # Run Pyppeteer code to take screenshot
    asyncio.get_event_loop().run_until_complete(capture_screenshot(url, final_output_path))
    print(f"Screenshot saved to {final_output_path}")

    # Shutdown Flask app
    try:
        shutdown_url = url.rstrip('/') + '/shutdown'
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
