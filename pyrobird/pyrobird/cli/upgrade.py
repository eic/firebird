# Created by: Dmitry Romanov, 2026
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.

"""One-shot upgrade of Firebird DEX files from version 0.04 to 1.0."""

import json
import logging
import os
import zipfile

import click

from pyrobird.dex import upgrade_dex, validate_dex, UnknownPieceTypeError

logger = logging.getLogger(__name__)


def read_dex_json(input_file):
    """Reads a DEX document from a .json file or from the first .json member of a .zip."""
    if input_file.lower().endswith(".zip"):
        with zipfile.ZipFile(input_file) as zf:
            json_names = [n for n in zf.namelist() if n.lower().endswith(".json")]
            if not json_names:
                raise click.FileError(input_file, "zip archive contains no .json file")
            return json.loads(zf.read(json_names[0]))
    with open(input_file, "r") as f:
        return json.load(f)


def write_dex_json(dex_data, output_file):
    """Writes a DEX document to a .json file, or zip-compressed when the name ends with .zip
    (the archive holds one member named like the output with .zip replaced by .json)."""
    if output_file.lower().endswith(".zip"):
        inner_name = os.path.basename(output_file)[:-len(".zip")]
        if not inner_name.lower().endswith(".json"):
            inner_name += ".json"
        with zipfile.ZipFile(output_file, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(inner_name, json.dumps(dex_data))
    else:
        with open(output_file, "w") as f:
            json.dump(dex_data, f)


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
