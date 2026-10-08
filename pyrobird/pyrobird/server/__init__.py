# Created by: Dmitry Romanov, 2024
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.
import datetime
import os
import logging
import time
from urllib.parse import unquote, urlsplit

import werkzeug.exceptions
from flask import render_template, send_from_directory, Flask, send_file, abort, Config, jsonify, request
import flask
import json5
from werkzeug.routing import BaseConverter, ValidationError
from pyrobird.entries import parse_entry_ranges, count_entries, select_entries, shorten, EntrySelectionError
from flask_compress import Compress



# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


server_dir = os.path.abspath(os.path.dirname(__file__))
static_dir = os.path.join(server_dir, "static")

flask_app = Flask(__name__, static_folder=static_dir)
flask_app.config.update()

# Compression config
# We want to use compression only transferring JSON for now...
flask_app.config["COMPRESS_REGISTER"] = False  # disable default compression of all requests
compress = Compress()
compress.init_app(flask_app)

# Config KEYS

CFG_DOWNLOAD_IS_UNRESTRICTED = "PYROBIRD_DOWNLOAD_IS_UNRESTRICTED"
CFG_DOWNLOAD_IS_DISABLED = "PYROBIRD_DOWNLOAD_IS_DISABLED"
CFG_DOWNLOAD_PATH = "PYROBIRD_DOWNLOAD_PATH"
CFG_CORS_IS_ALLOWED = "PYROBIRD_CORS_IS_ALLOWED"
CFG_API_BASE_URL = "PYROBIRD_API_BASE_URL"
CFG_FIREBIRD_CONFIG_PATH = "PYROBIRD_FIREBIRD_CONFIG_PATH"
CFG_STARTUP_COMMANDS = "PYROBIRD_STARTUP_COMMANDS"
# Host names that remote conversions (http, https, root://) may read from:
# a comma-separated string or a list. Unset or empty allows any host.
CFG_REMOTE_HOSTS = "PYROBIRD_REMOTE_HOSTS"
# Most entries one convert request may name (default: DEFAULT_CONVERT_MAX_ENTRIES)
CFG_CONVERT_MAX_ENTRIES = "PYROBIRD_CONVERT_MAX_ENTRIES"
# Server-side values for the frontend config layer, merged over the
# `userConfigs` map of config.jsonc: a {key: value} mapping or a JSON string.
CFG_USER_CONFIGS = "PYROBIRD_USER_CONFIGS"

DEFAULT_CONVERT_MAX_ENTRIES = 1000

REMOTE_PREFIXES = ('http://', 'https://', 'root://')

_TRUE_STRINGS = ('1', 'true', 'yes', 'on')


def _config_flag(config, key, default=False):
    """Reads a boolean setting that may arrive as a bool or as a string such as 'true' or '0'."""
    value = config.get(key, default)
    if isinstance(value, str):
        return value.strip().lower() in _TRUE_STRINGS
    return bool(value)


# Get
flask_app.config[CFG_CORS_IS_ALLOWED] = str(os.environ.get(CFG_CORS_IS_ALLOWED, '')).strip().lower() in _TRUE_STRINGS


class ExcludeAPIConverter(BaseConverter):
    """
   Custom URL converter that excludes paths starting with 'api/'.

   This converter is used in the catch-all route to prevent it from matching
   any URLs that are intended for API endpoints. By raising a ValidationError
   when the path starts with 'api/', Flask will skip the catch-all route and
   continue searching for other matching routes, allowing API routes to be
   matched correctly.

   Usage:
       - Register the converter with a name (e.g., 'notapi').
       - Use it in the route decorator: @app.route('/<notapi:path>')
   """

    # Add a regex that matches any path including slashes
    # (!) This part is super important to get /nested/paths/like/this processed
    part_isolating = False
    regex = "[^/].*?"

    def to_python(self, value):
        if value.startswith('api/'):
            raise ValidationError()
        return value

    def to_url(self, value):
        return value


# Register the converter
flask_app.url_map.converters['notapipath'] = ExcludeAPIConverter


def _work_path():
    """Returns the absolute work path: PYROBIRD_DOWNLOAD_PATH, or the current directory."""
    return os.path.abspath(flask.current_app.config.get(CFG_DOWNLOAD_PATH) or os.getcwd())


def _join_work_path(filename):
    """Resolves a relative file name against the work path; leaves absolute paths as they are."""
    if os.path.isabs(filename):
        return filename
    return os.path.join(_work_path(), filename)


def is_path_inside(path, root):
    """Tells whether `path` lies inside the directory `root` once symlinks are resolved.

    Both sides go through `os.path.realpath`, so `..` segments and symlinks
    that point out of `root` are rejected. The comparison is per path
    component: `/data/work-secret` is not inside `/data/work`.

    Parameters
    ----------
    path : str
        The path to test.
    root : str
        The directory that must contain `path`.

    Returns
    -------
    bool
        True if `path` is `root` or lies below it.
    """
    real_path = os.path.realpath(path)
    real_root = os.path.realpath(root)
    try:
        common = os.path.commonpath([real_path, real_root])
    except ValueError:
        # Paths on different drives (Windows) share no common path
        return False
    return os.path.normcase(common) == os.path.normcase(real_root)


def _can_user_download_file(filename):
    """
    Determine if the user is allowed to read the specified local file based on application configuration.

    Parameters:
    - filename (str): The path to the file. A relative path is resolved against PYROBIRD_DOWNLOAD_PATH.

    Returns:
    - bool: True if the file can be read, False otherwise.

    Process:
    - If downloading is globally disabled (PYROBIRD_DOWNLOAD_IS_DISABLED), returns False.
    - If unrestricted downloads are allowed (PYROBIRD_DOWNLOAD_IS_UNRESTRICTED), returns True.
    - Otherwise the file must resolve, symlinks included, to a path inside PYROBIRD_DOWNLOAD_PATH
      (the current directory when it is not set).
    """

    app = flask.current_app

    # If any downloads are disabled
    if _config_flag(app.config, CFG_DOWNLOAD_IS_DISABLED):
        logger.warning("Can't download file. PYROBIRD_DOWNLOAD_IS_DISABLED=True")
        return False

    # If we allow any download
    if _config_flag(app.config, CFG_DOWNLOAD_IS_UNRESTRICTED):
        return True

    # Check the file resolves to a path inside the work path
    if not is_path_inside(_join_work_path(filename), _work_path()):
        logger.warning("Can't download file. File is not in PYROBIRD_DOWNLOAD_PATH")
        return False

    # All is fine!
    return True


@flask_app.route('/api/v1/download', strict_slashes=False, methods=["GET"])
@flask_app.route('/api/v1/download/<path:filename>', strict_slashes=False, methods=["GET"])
def download_file(filename=None):
    # Retrieve the filename from query parameters
    if not filename:
        filename = request.args.get('filename')
        if not filename:
            filename = request.args.get('f')
            if not filename:
                abort(400, description="Filename not provided.")

    filename = unquote(filename)

    # A relative name is resolved against PYROBIRD_DOWNLOAD_PATH before the access check
    filename = _join_work_path(filename)

    # All checks and flags that user can download the file
    if not _can_user_download_file(filename):
        abort(403)  # Forbidden

    # Serve the resolved path that passed the check, under the requested name
    real_path = os.path.realpath(filename)
    if os.path.isfile(real_path):
        return send_file(real_path, as_attachment=True, conditional=True,
                         download_name=os.path.basename(filename))
    else:
        logger.warning(f"Can't download file. File does not exist")
        abort(404)  # Return 404 if the file does not exist


def _remote_host_patterns():
    """Returns the configured remote host allow-list as lowercase names, or None for any host."""
    value = flask.current_app.config.get(CFG_REMOTE_HOSTS)
    if not value:
        return None
    if isinstance(value, str):
        value = value.split(',')
    patterns = [str(item).strip().lower() for item in value if str(item).strip()]
    return patterns or None


def is_host_allowed(host, patterns):
    """Tells whether `host` matches the allow-list.

    An entry matches the same host name. An entry that starts with a dot,
    such as `.jlab.org`, also matches every subdomain. Comparison ignores case.
    """
    if not host:
        return False
    host = host.lower().rstrip('.')
    for pattern in patterns:
        if pattern.startswith('.'):
            if host == pattern[1:] or host.endswith(pattern):
                return True
        elif host == pattern:
            return True
    return False


def _check_remote_source(url):
    """Aborts with 403 unless the server may read the remote `url`.

    File access must be enabled, and when PYROBIRD_REMOTE_HOSTS is set, the
    URL host must be in it. The check covers the requested URL only: the
    reader follows HTTP and XRootD redirects.
    """
    if _config_flag(flask.current_app.config, CFG_DOWNLOAD_IS_DISABLED):
        logger.warning("Can't open remote file. PYROBIRD_DOWNLOAD_IS_DISABLED=True")
        abort(403, description="File access is disabled on this server.")

    patterns = _remote_host_patterns()
    if patterns is None:
        return

    host = urlsplit(url).hostname
    if not is_host_allowed(host, patterns):
        logger.warning(f"Can't open remote file. Host '{host}' is not in PYROBIRD_REMOTE_HOSTS")
        abort(403, description="The server does not read files from this host.")


def _convert_max_entries():
    value = flask.current_app.config.get(CFG_CONVERT_MAX_ENTRIES)
    if value is None or value == '':
        return DEFAULT_CONVERT_MAX_ENTRIES
    return int(value)


@flask_app.route('/api/v1/convert/<string:file_type>/<string:entries>', methods=['GET'])
@flask_app.route('/api/v1/convert/<string:file_type>/<string:entries>/<path:filename>', methods=['GET'])
@compress.compressed()
def open_edm4eic_file(filename=None, file_type="edm4eic", entries="0"):
    """
    Opens an EDM4eic file, extracts the specified event, converts it to JSON, and serves it.
    A local file must pass the same access check as a download. A remote file
    (http://, https://, root://) needs file access enabled and, when
    PYROBIRD_REMOTE_HOSTS is set, a host from that list.

    Every requested entry must exist in the file; otherwise the request fails
    with 400 and lists the missing entries. A request may name at most
    PYROBIRD_CONVERT_MAX_ENTRIES entries.


    Parameters
    ----------
    filename - Name or URL of the file to open
    file_type - String identifying file type: "edm4hep" or "edm4eic" or else...
    entries - List of entries, May be one entry, range or comma separated list

    Query parameters
    ----------------
    filename (or f) - the file to open when not given in the path
    collections (or c) - comma-separated collection groups to convert, same
        values as `pyrobird convert --collections`. Empty means all groups.
    """

    start_time = time.perf_counter()
    import uproot
    from pyrobird.edm4eic import edm4eic_to_dex_dict
    from pyrobird.edm4hep import edm4hep_to_dex_dict, detect_file_type

    supported_file_types = ["auto", "edm4eic", "edm4hep"]
    if file_type not in supported_file_types:
        abort(400, description=f"Unsupported file type: '{file_type}'. "
                               f"Supported types: {supported_file_types}")

    # Decode the filename
    # Retrieve the filename from query parameters
    if not filename:
        filename = request.args.get('filename')
        if not filename:
            filename = request.args.get('f')
            if not filename:
                abort(400, description="Filename not provided.")

    filename = unquote(filename)

    # Which collection groups to convert; empty/absent means all
    collections_str = request.args.get('collections') or request.args.get('c') or ""
    collections = [x.strip() for x in collections_str.split(',') if x.strip()] or None

    # Parse the selection into ranges and bound its size before anything is
    # expanded or opened: '0-20000000' must cost nothing.
    try:
        entry_ranges = parse_entry_ranges(entries)
    except ValueError:
        return {"error": f"Invalid entry format: '{shorten(entries)}'. "
                         f"Expected integers or ranges like '1-5'."}, 400

    max_entries = _convert_max_entries()
    requested_count = count_entries(entry_ranges)
    if requested_count > max_entries:
        err_msg = (f"For entries='{shorten(entries)}' the request names {requested_count} entries; "
                   f"at most {max_entries} are allowed per request.")
        logger.warning(err_msg)
        return {"error": err_msg}, 400

    # Check if filename is a remote URL or root://
    is_remote = filename.startswith(REMOTE_PREFIXES)

    if is_remote:
        _check_remote_source(filename)
    else:
        # A relative name is resolved against PYROBIRD_DOWNLOAD_PATH
        filename = _join_work_path(filename)

        # All checks and flags that user can access the file
        if not _can_user_download_file(filename):
            abort(403)  # Forbidden

        # Check if the file exists and is a file
        if not (os.path.exists(filename) and os.path.isfile(filename)):
            logger.warning(f"Cannot open file. File does not exist")
            abort(404)  # Not Found

    # At this point, filename is either a permitted local file or a remote file
    try:
        # Open the file with uproot
        file = uproot.open(filename)
    except Exception as e:
        logger.error(f"Error opening file {filename}: {e}")
        abort(500, description="Error opening file.")

    # Check if 'events' tree exists in the file
    if 'events' not in file:
        logger.error(f"'events' tree not found in file {filename}")
        abort(500, description="'events' tree not found in file.")

    tree = file['events']
    total_num_entries = tree.num_entries

    # Every requested entry must exist: the in-browser converter applies the same rule
    try:
        entries_index_list = select_entries(entry_ranges, total_num_entries, max_entries)
    except EntrySelectionError as e:
        err_msg = f"For entries='{shorten(entries)}': {e}"
        logger.warning(err_msg)
        return {"error": err_msg}, 400

    try:
        # Detect the file type if not given explicitly
        if file_type == "auto":
            file_type = detect_file_type(tree)
            logger.info(f"Detected file type: {file_type}")

        # Extract the event data
        if file_type == "edm4hep":
            event = edm4hep_to_dex_dict(tree, entries_index_list, collections=collections)
        else:
            event = edm4eic_to_dex_dict(tree, entries_index_list, collections=collections)
    except Exception as e:
        # Log detailed error server-side, return generic message to client
        logger.error(f"Error processing events {shorten(entries)} from file {filename}: {e}")
        return {"error": "Error processing events from file."}, 400

    # This function conversion time to milliseconds
    elapsed_time_ms = (time.perf_counter() - start_time) * 1000

    # Set origin info
    event["origin"] = {
        "source": filename,
        "latency": elapsed_time_ms,
        "by": "Pyrobird Flask server"
    }

    # Return the JSON data
    return jsonify(event)


def _server_user_configs():
    """Returns PYROBIRD_USER_CONFIGS as a dict; accepts a mapping or a JSON object string."""
    value = flask_app.config.get(CFG_USER_CONFIGS)
    if not value:
        return {}
    if isinstance(value, str):
        try:
            value = json5.loads(value)
        except ValueError as ex:
            logger.error(f"{CFG_USER_CONFIGS} is not valid JSON: {ex}")
            return {}
    if not isinstance(value, dict):
        logger.error(f"{CFG_USER_CONFIGS} must be a {{key: value}} mapping, got {type(value).__name__}")
        return {}
    return dict(value)


@flask_app.route('/assets/config.jsonc', methods=['GET'])
def asset_config():
    """Returns asset configuration file.

    Reads the frontend config.jsonc (PYROBIRD_FIREBIRD_CONFIG_PATH, or the one
    bundled with the frontend) and adds server information: the API base URL,
    the server host and port, and the `userConfigs` map merged with
    PYROBIRD_USER_CONFIGS.
    """
    config_path = flask_app.config.get(CFG_FIREBIRD_CONFIG_PATH)
    os_config_path = config_path or os.path.join(flask_app.static_folder, 'assets', 'config.jsonc')
    config_dict = {}

    logger.debug(f"Flask static folder: {flask_app.static_folder}")
    logger.debug(f"os_config_path: {os_config_path}")

    try:
        # Open the config file and load its content using jsonc
        with open(os_config_path, 'r') as file:
            config_dict = json5.load(file)
    except Exception as ex:
        logger.error(f"error opening {os_config_path}: {ex}")

    if not isinstance(config_dict, dict):
        logger.error(f"{os_config_path} does not hold a JSON object; serving server fields only")
        config_dict = {}

    # The URL the browser used to reach this server. request.host_url keeps
    # IPv6 brackets and the port as sent, and honors the scheme set by a
    # proxy middleware such as werkzeug's ProxyFix.
    host_url = request.host_url.rstrip('/')
    url_parts = urlsplit(request.host_url)
    host = url_parts.hostname or 'localhost'
    try:
        port = url_parts.port
    except ValueError:
        port = None
    if port is None:
        port = 443 if url_parts.scheme == 'https' else 80

    """
      serverPort: number;
      serverHost: string;
      servedByPyrobird: boolean;
      apiAvailable: boolean;
    """

    # Modify the fields in the dictionary as needed
    config_dict['serverPort'] = port
    config_dict['serverHost'] = host
    config_dict['servedByPyrobird'] = True
    config_dict['apiAvailable'] = True
    config_dict['timestamp'] = datetime.datetime.now().isoformat()

    # The file's userConfigs, with server-side values on top
    user_configs = config_dict.get('userConfigs') or {}
    if not isinstance(user_configs, dict):
        logger.error("config.jsonc 'userConfigs' is not a {key: value} mapping; ignoring it")
        user_configs = {}
    user_configs = dict(user_configs)
    user_configs.update(_server_user_configs())
    config_dict['userConfigs'] = user_configs

    config_api_url = flask_app.config.get(CFG_API_BASE_URL)
    config_dict['apiBaseUrl'] = config_api_url.rstrip('/') if config_api_url else host_url

    # Startup commands for the frontend command bus. The static config.jsonc may
    # already carry a `startupCommands` list (passes through untouched above);
    # a server-side setting (e.g. `pyrobird screenshot --commands ...`) appends
    # to it. Entries are command objects or 'type:arg;type:arg' strings.
    startup_commands = flask_app.config.get(CFG_STARTUP_COMMANDS)
    if startup_commands:
        existing = config_dict.get('startupCommands') or []
        if isinstance(startup_commands, str):
            startup_commands = [startup_commands]
        config_dict['startupCommands'] = list(existing) + list(startup_commands)

    # Convert the updated dictionary to JSON
    return jsonify(config_dict)


@flask_app.route('/')
def index():
    return static_file("index.html")


@flask_app.route('/<notapipath:path>')
def static_file(path):
    """Serves flask static directory files"""

    try:
        return send_from_directory(static_dir, path)
    except werkzeug.exceptions.NotFound as ex:

        # A missing asset is a 404: answering with index.html would hand
        # HTML to a fetch that expects data, a script or an image.
        if path == 'assets' or path.startswith('assets/'):
            abort(404)

        if path != "index.html":

            logger.debug("File is not found, assuming it is SPA and serving index.html")
            return static_file("index.html")
        else:
            # What a bad situation
            logger.error("'index.html' is not found!")

            # Maybe it is developer problem?
            if flask_app.debug:
                logger.warning("You run in debug mode. If you are a developer, did you run ng_build_copy.py?")
                return abort(404, "404 ERROR. index.html is not found. It might suggest frontend hasn't been built")
            else:
                return abort(404)




def configure_flask_app(config=None):
    """Returns"""
    if config:
        if isinstance(config, flask.Config) or isinstance(config, map) or isinstance(config, dict):
            flask_app.config.from_mapping(config)
        else:
            flask_app.config.from_object(config)

    if flask_app.config:
        cfg_cors_allowed = _config_flag(flask_app.config, CFG_CORS_IS_ALLOWED)
        if cfg_cors_allowed:
            logger.info("flask_app.config.get(CFG_CORS_IS_ALLOWED) is True")
            from flask_cors import CORS

            # Enable CORS for all routes and specify the domains and settings
            CORS(flask_app, resources={
                r"/download/*": {"origins": "*"},
                r"/api/v1/*": {"origins": "*"},
                r"/assets/config.jsonc": {"origins": "*"},
            })

    logger.debug("Serve path:")
    logger.debug(f"  Server dir : {server_dir}")
    logger.debug(f"  Static dir : {static_dir}")
    return flask_app


def run(config=None, host=None, port=5454, debug=False, load_dotenv=False):
    configure_flask_app(config)
    flask_app.run(host=host, port=port, debug=debug, load_dotenv=load_dotenv, use_reloader=False)
