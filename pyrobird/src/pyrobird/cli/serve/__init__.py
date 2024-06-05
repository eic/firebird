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


app = Flask(__name__, static_folder='dist')

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



@click.group()
@click.pass_context
def serve(ctx):
    """
    Operations with database (create tables, erase everything, etc)
    """

    # assert isinstance(ctx, click.Context)
    # context = ctx.obj
    # assert isinstance(context, CasdmAppContext)
    # if not context.connection_str:
    #     ctx.fail("ERROR(!) Connection string is not set. Needs it to connect to BD")
    #     # click.echo(, err=True)
    #     # click.echo(ctx.get_help())

    if ctx.invoked_subcommand is None:
        print("No command was specified")

    app.run(debug=True)

if __name__ == '__main__':
    app.run(debug=True)