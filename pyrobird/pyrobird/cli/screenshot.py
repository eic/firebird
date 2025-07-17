import threading
import time
import asyncio
import click

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
@click.option('--output-path', default='screenshot.png', help='Path to save the screenshot')
@click.option('--url', default='http://localhost:5454', help='URL to take the screenshot of')
def screenshot(unsecure_files, allow_cors, disable_download, work_path, output_path, url):
    """
    Start the Flask server, take a screenshot of the specified URL using Pyppeteer,
    and then shut down the server.

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

    # Run Pyppeteer code to take screenshot
    asyncio.get_event_loop().run_until_complete(capture_screenshot(url, output_path))
    print(f"Screenshot saved to {output_path}")

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
