# Created by: Dmitry Romanov, 2024
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.

import os
import logging
from csv import excel

import werkzeug.exceptions
from flask import render_template, send_from_directory, Flask, send_file, abort, Config
from pandas.io.common import file_exists

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


server_dir = os.path.abspath(os.path.dirname(__file__))
static_dir = os.path.join(server_dir, "static")
app = Flask(__name__, static_folder='static')
app.config.update()


@app.route('/download/<path:filename>')
def download_file(filename):
    # Ensure the path is safe and only files within a certain directory can be accessed
    # For example, let's say you store your files in a 'files' directory within the server root
    safe_path = filename
    base_path = ''
    if base_path:
        safe_path = os.path.join(base_path, filename)
    safe_path = os.path.abspath(safe_path)  # Resolve any path traversal attempts

    if not safe_path.startswith(base_path):
        # Security check failed
        abort(404)

    if os.path.exists(safe_path) and os.path.isfile(safe_path):
        return send_file(safe_path, as_attachment=True)
    else:
        abort(404)


@app.route('/')
def index():
    return static_file("index.html")


@app.route('/<path:path>')
def static_file(path):

    if app.debug:
        print("Serve path:")
        print("  Server dir :", server_dir)
        print("  Static dir :", static_dir)
        print("  path       :", path)

    try:
        return send_from_directory(static_dir, path)
    except werkzeug.exceptions.NotFound as ex:
        if app.debug:
            print("File is not found, assuming it is SPA and serving index.html")
            return send_from_directory(static_dir, "index.html")


def run(config=None, host=None, port=None, debug=True, load_dotenv=True):
    if config:
        if isinstance(config, Config) or isinstance(config, map):
            app.config.from_mapping(config)
        else:
            app.config.from_object(config)

    app.run(host=host, port=port, debug=debug, load_dotenv=load_dotenv)
