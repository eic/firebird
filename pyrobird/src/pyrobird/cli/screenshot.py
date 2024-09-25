
import threading
import time
import requests
import asyncio
import click
from pyppeteer import launch
from my_module import serve  # Replace with the actual module where your `serve` function is defined

def run_flask_app(unsecure_files, allow_cors, disable_download, work_path):
    # Call the serve function directly with parameters
    serve_params = {
        'unsecure_files': unsecure_files,
        'allow_cors': allow_cors,
        'disable_download': disable_download,
        'work_path': work_path
    }
    # Simulate Click context
    ctx = click.Context(serve)
    serve.invoke(ctx, **serve_params)

async def capture_screenshot(url, output_path):
    # Launch a headless browser
    browser = await launch(headless=True)
        # If necessary, adjust Pyppeteer launch options here
    page = await browser.newPage()
    await page.setViewport({'width': 1920, 'height': 1080})
    await page.goto(url)

    # Wait for the content to render (adjust as needed)
    await page.waitForSelector('#your-threejs-container', timeout=5000)  # Adjust the selector if needed

    # Take a screenshot
    await page.screenshot({'path': output_path, 'fullPage': True})
    await browser.close()

@click.command()
@click.option('--unsecure-files', is_flag=True, default=False, help='Allow unrestricted file downloads')
@click.option('--allow-cors', is_flag=True, default=False, help='Enable CORS for downloaded files')
@click.option('--disable-download', is_flag=True, default=False, help='Disable all file downloads')
@click.option('--work-path', default='', help='Set the base directory path for file downloads')
@click.option('--output-path', default='screenshot.png', help='Path to save the screenshot')
@click.option('--url', default='http://localhost:5000', help='URL to take the screenshot of')
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
            response = requests.get(url)
            if response.status_code == 200:
                break
        except requests.ConnectionError:
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
        requests.post(shutdown_url)
    except requests.RequestException as e:
        print(f"Error shutting down Flask app: {e}")

    # Wait for the Flask app to shut down
    flask_thread.join()
    print("Flask app has been shut down.")