# Created by: Dmitry Romanov, 2026
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.

"""One-shot upgrade of Firebird DEX files from version 0.04 to 1.0."""

import logging
import os

import click

from pyrobird.dex import upgrade_dex, validate_dex, UnknownPieceTypeError
from pyrobird.dex_utils import read_dex_json, write_dex_json

logger = logging.getLogger(__name__)


def guess_output_name(input_file):
    """in.firebird.json -> in.v1.firebird.json (same idea for .zip)."""
    for ending in (".firebird.json.zip", ".firebird.zip", ".firebird.json", ".json.zip", ".zip", ".json"):
        if input_file.lower().endswith(ending):
            return input_file[:-len(ending)] + ".v1" + ending
    return input_file + ".v1.firebird.json"


@click.command()
@click.option("--skip-unknown", "skip_unknown", is_flag=True, default=False,
              help="Drop groups with types the upgrade does not know instead of failing. "
                   "Their data is lost - the warning lists what was dropped.")
@click.argument("input_file", required=True)
@click.argument("output_file", required=False)
def upgrade(input_file, output_file, skip_unknown):
    """
    Upgrades a Firebird DEX file from version 0.04 to 1.0.

    INPUT_FILE is a .firebird.json file or a .zip holding one. OUTPUT_FILE
    defaults to the input name with a .v1 suffix; a .zip output name writes a
    zip-compressed result. The upgraded document is validated before writing.

    \b
    Examples:
        pyrobird upgrade old.firebird.json new.firebird.json
        pyrobird upgrade events.firebird.zip
        pyrobird upgrade --skip-unknown custom-types.firebird.json
    """
    if not os.path.isfile(input_file):
        raise click.FileError(input_file, "File not found")

    dex_data = read_dex_json(input_file)

    try:
        upgraded = upgrade_dex(dex_data, skip_unknown=skip_unknown)
    except UnknownPieceTypeError as err:
        raise click.ClickException(str(err))

    validate_dex(upgraded)

    if not output_file:
        output_file = guess_output_name(input_file)
    write_dex_json(upgraded, output_file)

    events_count = len(upgraded.get("events", []))
    click.echo(f"Upgraded {input_file} -> {output_file} ({events_count} event(s), DEX 1.0)")
