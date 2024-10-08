# Created by: Dmitry Romanov, 2024
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.

import os
import logging
import time
from csv import excel
from urllib.parse import unquote

import werkzeug.exceptions
from flask import render_template, send_from_directory, Flask, send_file, abort, Config, jsonify, request
import flask
import json5
from werkzeug.routing import BaseConverter, ValidationError
from pyrobird.edm4eic import parse_entry_numbers
from flask_compress import Compress



# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


server_dir = os.path.abspath(os.path.dirname(__file__))
static_dir = os.path.join(server_dir, "static")

flask_app = Flask(__name__, static_folder=static_dir)
flask_app.config.update()

# Compression config
# We want to use compression only transfering JSON for now...
flask_app.config["COMPRESS_REGISTER"] = False  # disable default compression of all requests
compress = Compress()
compress.init_app(flask_app)


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


def _can_user_download_file(filename):
    """
   Determine if the user is allowed to download the specified file based on application configuration.

   Parameters:
   - filename (str): The path to the file that the user wants to download. Can be absolute or relative.

   Returns:
   - bool: True if the file can be downloaded, False otherwise.

   Process:
   - If downloading is globally disabled (DOWNLOAD_DISABLE=True), returns False.
   - If unrestricted downloads are allowed (DOWNLOAD_IS_UNRESTRICTED=True), returns True.
   - For relative paths, assumes that the download is allowable.
   - For absolute paths, checks that the file resides within the configured DOWNLOAD_PATH.
   - Logs a warning and returns False if the file is outside the allowed download path or if downloading is disabled.
   """

    app = flask.current_app

    # If any downloads are disabled
    if app.config.get("DOWNLOAD_DISABLE") is True:
        logger.warning("Can't download file. DOWNLOAD_DISABLE=True")
        return False

    # If we allow any download
    unrestricted_download = app.config.get("DOWNLOAD_IS_UNRESTRICTED") is True
    if unrestricted_download:
        return True

    # if allowed/disable checks are done, and we are here,
    # if relative path is given, it will be joined with DOWNLOAD_PATH
    if not os.path.isabs(filename):
        return True

    # HERE we have and absolute path! Check if it is safe to download

    allowed_path = app.config.get("DOWNLOAD_PATH")
    if not allowed_path:
        allowed_path = os.getcwd()

    # Check file will be downloaded from safe folder
    can_download = os.path.realpath(filename).startswith(os.path.realpath(allowed_path))
    if not can_download:
        logger.warning("Can't download file. File is not in DOWNLOAD_PATH")
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

    # All checks and flags that user can download the file
    if not _can_user_download_file(filename):
        abort(404)

    # If it is relative, combine it with DOWNLOAD_PATH
    if not os.path.isabs(filename):
        download_path = flask.current_app.config.get("DOWNLOAD_PATH")
        if not download_path:
            download_path = os.getcwd()

        # normalize the path
        download_path = os.path.abspath(download_path)

        # combine the file path
        filename = os.path.join(download_path, filename)

    # Check if the file exists and is a file
    if os.path.exists(filename) and os.path.isfile(filename):
        return send_file(filename, as_attachment=True, conditional=True)
    else:
        logger.warning(f"Can't download file. File does not exist")
        abort(404)  # Return 404 if the file does not exist


@flask_app.route('/api/v1/convert/<string:file_type>/<string:entries>', methods=['GET'])
@flask_app.route('/api/v1/convert/<string:file_type>/<string:entries>/<path:filename>', methods=['GET'])
@compress.compressed()
def open_edm4eic_file(filename=None, file_type="edm4eic", entries="0"):
    """
    Opens an EDM4eic file, extracts the specified event, converts it to JSON, and serves it.
    If the file is local, it checks if the user is allowed to access it.
    If the file is remote (starts with http://, https://, root://), it proceeds without permission checks.


    Parameters
    ----------
    filename - Name or URL of the file to open
    file_type - String identifying file type: "edm4hep" or "edm4eic" or else...
    entries - List of entries, May be one entry, range or comma separated list
    """

    start_time = time.perf_counter()
    import uproot
    from pyrobird.edm4eic import edm4eic_to_dict

    # Decode the filename
    # Retrieve the filename from query parameters
    if not filename:
        filename = request.args.get('filename')
        if not filename:
            filename = request.args.get('f')
            if not filename:
                abort(400, description="Filename not provided.")

    filename = unquote(filename)

    try:
        # Parse the event numbers using the parse_entry_numbers function
        entries_index_list = parse_entry_numbers(entries)
    except ValueError as e:
        # Return an error response if the event_numbers string is invalid
        return str(e), 400

    # Check if filename is a remote URL or root://
    is_remote = any(filename.startswith(prefix) for prefix in ['http://', 'https://', 'root://'])

    # If not remote, treat it as local file
    if not is_remote:
        # If it is relative, combine it with DOWNLOAD_PATH
        if not os.path.isabs(filename):
            download_path = flask.current_app.config.get("DOWNLOAD_PATH")
            if not download_path:
                download_path = os.getcwd()

            # Normalize the path
            download_path = os.path.abspath(download_path)

            # Combine the file path
            filename = os.path.join(download_path, filename)

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

    # Do we have valid entries?
    for entry_index in entries_index_list:
        if entry_index > total_num_entries - 1:
            err_msg = f"For entries='{entries}' entry index={entry_index} is outside of tree num_entries={total_num_entries}"
            logger.error(err_msg)
            return {"error": err_msg}, 400

    try:
        # Extract the event data
        event = edm4eic_to_dict(tree, entries_index_list)
    except Exception as e:
        err_msg = f"Error processing events {entries} from file {filename}: {e}"
        logger.error(err_msg)
        return {"error": err_msg}, 400

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


@flask_app.route('/assets/config.jsonc', methods=['GET'])
def asset_config():
    """Returns asset configuration file.

    It reads out existing file adding server info
    """
    config_path = 'assets/config.jsonc'
    config_dict = {}

    os_config_path = os.path.join(flask_app.static_folder, 'assets', 'config.jsonc')
    logger.debug(f"Flask static folder: {flask_app.static_folder}")
    logger.debug(f"os_config_path: {os_config_path}")

    try:
        # Open the config file and load its content using jsonc
        with open(os_config_path, 'r') as file:
            config_dict = json5.load(file)
    except Exception as ex:
        logger.error(f"error opening {config_path}: {ex}")

    host = 'unknown'
    port = 80

    tokens = request.host.split(':')

    if tokens and tokens[0]:
        host = tokens[0]

    if len(tokens) > 1:
        port = tokens[1]

    """
      serverPort: number;
      serverHost: string;
      servedByPyrobird: boolean;
      apiAvailable: boolean;
    """

    # Modify the fields in the dictionary as needed
    config_dict['serverPort'] = int(port)
    config_dict['serverHost'] = host
    config_dict['servedByPyrobird'] = True
    config_dict['apiAvailable'] = True

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
        logger.debug("File is not found, assuming it is SPA and serving index.html")
        return static_file("index.html")


@flask_app.route('/shutdown', methods=['GET', 'POST'])
def shutdown():
    """Shutdowns the server"""

    func = request.environ.get('werkzeug.server.shutdown')
    if func is None:
        return 'Not running with the Werkzeug Server', 500
    func()
    return 'Server shutting down...'


def run(config=None, host=None, port=5454, debug=False, load_dotenv=False):
    """Runs flask server"""
    if config:
        if isinstance(config, Config) or isinstance(config, map):
            flask_app.config.from_mapping(config)
        else:
            flask_app.config.from_object(config)

    if flask_app.config and flask_app.config.get("DOWNLOAD_ALLOW_CORS") is True:
        from flask_cors import CORS

        # Enable CORS for all routes and specify the domains and settings
        CORS(flask_app, resources={
            r"/download/*": {"origins": "*"},
            r"/api/v1/*": {"origins": "*"},
        })

    logger.debug("Serve path:")
    logger.debug("  Server dir :", server_dir)
    logger.debug("  Static dir :", static_dir)

    flask_app.run(host=host, port=port, debug=debug, load_dotenv=load_dotenv)
