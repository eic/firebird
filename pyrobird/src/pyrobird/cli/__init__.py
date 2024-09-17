# Created by: Dmitry Romanov, 2024
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.
import logging

import click

from pyrobird.__about__ import __version__
from . geo import geo as geo_group
from . serve import serve as serve_group
from . convert import convert as convert_cmd


def setup_logging(is_verbose):
    """
    Sets up logging configuration based on the verbosity level.
    """

    # Clear existing handlers
    logging.getLogger().handlers = []

    if is_verbose:
        logging_level = logging.DEBUG
    else:
        logging_level = logging.INFO

    # create console handler with a higher log level
    ch = logging.StreamHandler()
    ch.setLevel(logging_level)

    # Apply configuration to the root logger
    logger = logging.getLogger(__name__)
    logger.addHandler(ch)
    logger.setLevel(logging_level)
    logger.debug("DEBUG log level")


@click.group(context_settings={"help_option_names": ["-h", "--help"]}, invoke_without_command=True)
@click.option('--verbose', is_flag=True, help="Enable verbose mode (INFO level logging).")
@click.version_option(version=__version__, prog_name="fbd")
@click.pass_context
def cli_app(ctx, verbose):
    """
    fbd - Firebird command provides command line interface to backend for the Firebird Event Display and Data Visualizer
    """

    setup_logging(verbose)

    if ctx.invoked_subcommand is None:
        click.echo("No command was specified")


# noinspection PyTypeChecker
cli_app.add_command(geo_group)
cli_app.add_command(serve_group)
cli_app.add_command(convert_cmd)
