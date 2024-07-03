import sys
from flask import Flask, render_template, send_from_directory

# Created by: Dmitry Romanov, 2024
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.
import yaml
import os
import click
from rich import inspect
import fnmatch
from importlib import resources
from pyrobird.cern_root import ensure_pyroot_importable, tgeo_delete_node, tgeo_process_file

import logging
from importlib import resources
import yaml
import click

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from flask import Flask, send_file, request, abort

app = Flask(__name__, static_folder='dist')


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

# Check for the filename argument
if len(sys.argv) < 2:
    print("Usage: python app.py <filename>")
    sys.exit(1)

file_path = sys.argv[1]

@app.route('/')
def index():
    return render_template('index.html', file_path=file_path)

@app.route('/<path:path>')
def static_file(path):
    return send_from_directory('dist', path)


@click.command()
@click.pass_context
def serve(ctx):
    """
    Operations with database (create tables, erase everything, etc)
    """
    app.run(debug=True)

    # # assert isinstance(ctx, click.Context)
    # # context = ctx.obj
    # # assert isinstance(context, CasdmAppContext)
    # # if not context.connection_str:
    # #     ctx.fail("ERROR(!) Connection string is not set. Needs it to connect to BD")
    # #     # click.echo(, err=True)
    # #     # click.echo(ctx.get_help())
    #
    # if ctx.invoked_subcommand is None:
    #     print("No command was specified")



if __name__ == '__main__':
    app.run(debug=True)