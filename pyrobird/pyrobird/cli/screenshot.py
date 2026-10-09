import threading
import time
import click
import os
import glob
from collections import namedtuple
from urllib.parse import urlsplit, urlunsplit

import urllib.request
import urllib.error

from pyrobird.utils import is_loopback_host

# Exit codes of `pyrobird screenshot`
EXIT_OK = 0
EXIT_FAILURE = 1         # The server, the browser or the capture failed
EXIT_NOT_READY = 2       # The display never reported ready; the capture may show a half-loaded display
EXIT_DISPLAY_ERRORS = 3  # The display reported errors in window.firebird.errors

# The server the command starts listens on loopback only
SERVER_HOST = '127.0.0.1'

# The fixed port earlier versions served on; --url values that name it target the started server
LEGACY_PORT = 5454


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


# The display publishes its batch status on `window.firebird` (BatchStatusService):
# - ready: startup commands ran AND no geometry/event load is in flight;
# - errors: an array of messages for loads and commands that failed.
READY_JS_CONDITION = "() => window.firebird && window.firebird.ready === true"

# Stop waiting once the display is ready or has reported an error
WAIT_JS_CONDITION = (
    "() => !!window.firebird && (window.firebird.ready === true"
    " || (Array.isArray(window.firebird.errors) && window.firebird.errors.length > 0))"
)

STATE_JS = (
    "() => ({"
    " ready: !!window.firebird && window.firebird.ready === true,"
    " errors: (window.firebird && Array.isArray(window.firebird.errors))"
    " ? window.firebird.errors.map(String) : []"
    " })"
)

DisplayState = namedtuple('DisplayState', ['ready', 'errors'])


def wait_display_ready(page, timeout_sec):
    """Waits until the display reports ready or an error. Returns False on timeout."""
    try:
        page.wait_for_function(WAIT_JS_CONDITION, timeout=timeout_sec * 1000)
        return True
    except Exception:
        return False


def read_display_state(page):
    """Reads window.firebird.ready and window.firebird.errors from the page.

    A page without `window.firebird`, or one whose frontend does not publish
    `errors` yet, reads as not ready and without errors respectively.
    """
    try:
        state = page.evaluate(STATE_JS)
    except Exception as ex:
        print(f"WARNING: could not read window.firebird: {ex}")
        return DisplayState(False, [])

    if not isinstance(state, dict):
        return DisplayState(False, [])

    errors = state.get('errors')
    errors = [str(error) for error in errors] if isinstance(errors, list) else []
    return DisplayState(state.get('ready') is True, errors)


def capture_screenshot(url, output_path, ready_timeout=120):
    """Opens `url` in headless Chromium, waits for the display and saves a screenshot.

    Returns
    -------
    DisplayState
        Whether the display reported ready, and the errors it reported.
    """
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
        exit(EXIT_FAILURE)

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

        # Wait for geometry/events/startup-commands completion, or the first error
        wait_display_ready(page, ready_timeout)
        state = read_display_state(page)
        if state.ready:
            print("Display reported ready (geometry loaded, startup commands done)")
            # One breath for the final rendered frame to hit the canvas
            time.sleep(1)
        elif state.errors:
            print("Display reported errors before it was ready")
        else:
            print(f"WARNING: display did not report ready within {ready_timeout}s "
                  "(old frontend or non-display page?). Falling back to a fixed wait.")
            time.sleep(2)

        # Take a screenshot
        page.screenshot(path=output_path, full_page=True, timeout=90_000)
        browser.close()

    return state


def start_server(config, port=0, host=SERVER_HOST):
    """Starts the pyrobird Flask app in a background thread.

    The socket is bound before this function returns, so a port in use fails
    here and not in the background thread. Port 0 picks a free port.

    Returns
    -------
    werkzeug.serving.BaseWSGIServer
        The running server; read `server_port` for the bound port and call
        `shutdown()` to stop it.

    Raises
    ------
    click.ClickException
        If the address cannot be bound.
    """
    from werkzeug.serving import make_server
    import pyrobird.server

    app = pyrobird.server.configure_flask_app(config)
    try:
        server = make_server(host, port, app, threaded=True)
    except OSError as ex:
        raise click.ClickException(f"Could not start the server on {host}:{port}: {ex}")
    except SystemExit:
        # werkzeug prints why the bind failed, then exits
        raise click.ClickException(f"Could not start the server on {host}:{port}: the address is in use "
                                   f"or not available")

    thread = threading.Thread(target=server.serve_forever, name="pyrobird-screenshot-server", daemon=True)
    thread.start()
    return server


def server_origin(server):
    return f"http://{SERVER_HOST}:{server.server_port}"


def with_scheme(url):
    """Adds 'http://' to a URL without a scheme, such as 'localhost:5454/display'; keeps paths as they are."""
    if '://' not in url and not url.startswith('/'):
        return 'http://' + url
    return url


def targets_started_server(url):
    """Whether `url` names the server the command starts.

    True for a path such as '/display?dex=...' and for a URL on localhost,
    127.0.0.1, [::1] or 0.0.0.0 with port 5454 or no port. Any other URL,
    such as a development server on localhost:4200 or a public deployment,
    names a server that already runs.
    """
    parts = urlsplit(with_scheme(url))
    if not parts.netloc:
        return True
    host = parts.hostname or ''
    try:
        port = parts.port
    except ValueError:
        port = None
    is_local = is_loopback_host(host) or host in ('0.0.0.0', '::')
    return is_local and port in (None, LEGACY_PORT)


def resolve_capture_url(url, origin):
    """Points `url` at the server the command started.

    A URL that names that server (see `targets_started_server`) keeps its
    path, query and fragment and gets `origin` as scheme, host and port. Any
    other URL is returned unchanged.
    """
    url = with_scheme(url)
    if not targets_started_server(url):
        return url
    parts = urlsplit(url)
    origin_parts = urlsplit(origin)
    path = parts.path if parts.path.startswith('/') else '/' + parts.path
    return urlunsplit((origin_parts.scheme, origin_parts.netloc, path, parts.query, parts.fragment))


def wait_server_serves_frontend(origin, attempts=10):
    """Checks that the server answers '/' with the frontend's index.html."""
    for _ in range(attempts):
        try:
            with urllib.request.urlopen(origin + '/', timeout=5) as response:
                if response.getcode() == 200:
                    return True
        except urllib.error.HTTPError as ex:
            # The server runs but has no index.html: the frontend is not built
            print(f"The server answered {ex.code} for '/'. Is the frontend built into pyrobird/server/static?")
            return False
        except urllib.error.URLError:
            pass
        time.sleep(1)
    return False


def exit_code_for(state):
    if state.errors:
        return EXIT_DISPLAY_ERRORS
    if not state.ready:
        return EXIT_NOT_READY
    return EXIT_OK


@click.command()
@click.option('--unsecure-files', is_flag=True, default=False, help='Allow unrestricted file downloads')
@click.option('--allow-cors', is_flag=True, default=False, help='Enable CORS for downloaded files')
@click.option('--disable-download', is_flag=True, default=False, help='Disable all file downloads')
@click.option('--work-path', default='', help='Set the base directory path for file downloads')
@click.option('--output-path', default='screenshot.png',
              help='Base filename for the screenshot (will be saved in screenshots/ with auto-numbering)')
@click.option('--url', default='/', show_default=True,
              help="Page to capture. For a path such as '/display?dex=...', or a localhost URL on port "
                   "5454 or without a port, the command serves the frontend itself on 127.0.0.1 and "
                   "points the URL at that server: the path and query are kept. Other URLs, such as a "
                   "development server on localhost:4200 or a public deployment, are captured as given "
                   "and the command starts no server, so it needs no built frontend.")
@click.option('--port', default=0, type=int, show_default=True,
              help='Port for the server the command starts; 0 picks a free port. '
                   'The command fails if the port is in use.')
@click.option('--commands', default='',
              help="Startup commands the display runs before the capture, "
                   "'type:arg' items separated by ';'. "
                   "Example: 'open-dex:file.firebird.zip;show-event:2;camera-preset:farforward'")
@click.option('--ready-timeout', default=120, show_default=True,
              help='Seconds to wait for the display to report ready (geometry loaded, commands done)')
@click.pass_context
def screenshot(ctx, unsecure_files, allow_cors, disable_download, work_path, output_path, url, port, commands,
               ready_timeout):
    """
    Start the Flask server, take a screenshot of the specified URL using Playwright,
    and then shut down the server. A URL on another server is captured without
    starting one.

    The capture waits for the display's readiness flags (window.firebird.ready):
    geometry loaded, startup commands executed, no loads in flight.

    Screenshots are saved in the 'screenshots' folder with automatic numbering to prevent overwrites.
    All options can be customized via command-line arguments.

    \b
    Exit codes:
      0  the display reported ready without errors
      1  the server, the browser or the capture failed
      2  the display never reported ready (the screenshot is still saved)
      3  the display reported errors in window.firebird.errors (the screenshot is still saved)
    """
    # A page on a server that already runs needs no local frontend: the command serves nothing
    server = None
    if targets_started_server(url):
        from pyrobird.cli.serve import make_server_config

        config = make_server_config(
            unsecure_files=unsecure_files,
            allow_cors=allow_cors,
            disable_download=disable_download,
            work_path=work_path,
            startup_commands=commands)

        server = start_server(config, port=port)
        origin = server_origin(server)
        print(f"Serving the frontend on {origin}")
    else:
        print("The URL names a server that already runs: the command starts no server")
        if commands:
            print("WARNING: --commands is ignored: startup commands reach only the server this command starts. "
                  "To run them, add them to the URL's cmd parameter: 'cmd=type:arg;type:arg'.")

    try:
        if server is not None:
            if not wait_server_serves_frontend(origin):
                raise click.ClickException(f"The server on {origin} does not serve the frontend")
            capture_url = resolve_capture_url(url, origin)
        else:
            capture_url = with_scheme(url)

        # Get the next available screenshot path
        final_output_path = get_screenshot_path(output_path)

        # Run Playwright code to take screenshot
        print(f"Capturing {capture_url}")
        try:
            state = capture_screenshot(capture_url, final_output_path, ready_timeout=ready_timeout)
        except Exception as ex:
            raise click.ClickException(f"The capture of {capture_url} failed: {ex}")
        print(f"Screenshot saved to {final_output_path}")
    finally:
        if server is not None:
            server.shutdown()
            server.server_close()

    for error in state.errors:
        print(f"Display error: {error}")

    code = exit_code_for(state)
    if code == EXIT_NOT_READY:
        print(f"ERROR: the display did not report ready within {ready_timeout}s")
    elif code == EXIT_DISPLAY_ERRORS:
        print(f"ERROR: the display reported {len(state.errors)} error(s)")
    ctx.exit(code)


if __name__ == '__main__':
    screenshot()
