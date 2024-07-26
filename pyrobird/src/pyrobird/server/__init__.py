# Created by: Dmitry Romanov, 2024
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.

import os
import logging
from csv import excel

import werkzeug.exceptions
from flask import render_template, send_from_directory, Flask, send_file, abort, Config, current_app
import flask

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


server_dir = os.path.abspath(os.path.dirname(__file__))
static_dir = os.path.join(server_dir, "static")

flask_app = Flask(__name__, static_folder='static')
flask_app.config.update()


def _can_user_download_file(filename):
    """
   Determine if the user is allowed to download the specified file based on application configuration.

   Parameters:
   - filename (str): The path to the file that the user wants to download. Can be absolute or relative.

   Returns:
   - bool: True if the file can be downloaded, False otherwise.

   Process:
   - If downloading is globally disabled (DOWNLOAD_DISABLE=True), returns False.
   - If unrestricted downloads are allowed (DOWNLOAD_ALLOW_UNRESTRICTED=True), returns True.
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
    unrestricted_download = app.config.get("DOWNLOAD_ALLOW_UNRESTRICTED") is True
    if unrestricted_download:
        return True

    # if allowed/disable checks are done and we are here,
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


@flask_app.route('/download/<path:filename>')
def download_file(filename):

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


@flask_app.route('/')
def index():
    return static_file("index.html")


@flask_app.route('/<path:path>')
def static_file(path):

    if flask_app.debug:
        print("Serve path:")
        print("  Server dir :", server_dir)
        print("  Static dir :", static_dir)
        print("  path       :", path)

    try:
        return send_from_directory(static_dir, path)
    except werkzeug.exceptions.NotFound as ex:
        if flask_app.debug:
            print("File is not found, assuming it is SPA and serving index.html")
            return send_from_directory(static_dir, "index.html")


def run(config=None, host=None, port=None, debug=True, load_dotenv=True):
    if config:
        if isinstance(config, Config) or isinstance(config, map):
            flask_app.config.from_mapping(config)
        else:
            flask_app.config.from_object(config)

    if flask_app.config and flask_app.config.get("DOWNLOAD_ALLOW_CORS") is True:
        from flask_cors import CORS

        # Enable CORS for all routes and specify the domains and settings
        CORS(flask_app, resources={r"/download/*": {"origins": "*"}})


    flask_app.run(host=host, port=port, debug=debug, load_dotenv=load_dotenv)
