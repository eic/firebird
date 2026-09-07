# Created by: Dmitry Romanov, 2024
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.

"""Utilities for working with Firebird DEX (Data Exchange) format files."""

import json
import os
import zipfile
from typing import Any, Dict, Optional

import click


def read_dex_json(file_path: str) -> Dict[str, Any]:
    """Reads a DEX document from a .json file or from the first .json member of a .zip."""
    if file_path.lower().endswith(".zip"):
        with zipfile.ZipFile(file_path) as zf:
            json_names = [n for n in zf.namelist() if n.lower().endswith(".json")]
            if not json_names:
                raise click.FileError(file_path, "zip archive contains no .json file")
            with zf.open(json_names[0]) as f:
                return json.load(f)
    with open(file_path, "r") as f:
        return json.load(f)


def write_dex_json(dex_data: Dict[str, Any], output_file: str, indent: Optional[int] = None) -> None:
    """Writes a DEX document to a .json file, or zip-compressed when the name ends
    with .zip (the archive holds one member named like the output with .zip
    replaced by .json)."""
    text = json.dumps(dex_data, indent=indent)
    if output_file.lower().endswith(".zip"):
        inner_name = os.path.basename(output_file)[:-len(".zip")]
        if not inner_name.lower().endswith(".json"):
            inner_name += ".json"
        with zipfile.ZipFile(output_file, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(inner_name, text)
        return
    with open(output_file, "w") as f:
        f.write(text)


def load_dex_file(file_path: str) -> Dict[str, Any]:
    """
    Load and validate a Firebird DEX JSON file (.json, or a .zip holding one).

    Parameters
    ----------
    file_path : str
        Path to the DEX file

    Returns
    -------
    dict
        The loaded DEX data

    Raises
    ------
    click.FileError
        If file cannot be loaded or is invalid
    """
    try:
        dex_data = read_dex_json(file_path)
    except click.FileError:
        raise
    except FileNotFoundError:
        raise click.FileError(file_path, "File not found")
    except json.JSONDecodeError:
        raise click.FileError(file_path, "Invalid JSON format")
    except Exception as e:
        raise click.FileError(file_path, f"Error opening/parsing: {e}")

    # Verify the file is a valid Firebird DEX file
    if not is_valid_dex_file(dex_data):
        raise click.FileError(file_path, "Not a valid Firebird DEX file")

    return dex_data


def is_valid_dex_file(data: Dict[str, Any]) -> bool:
    """
    Check if the data is a valid Firebird DEX file.

    Parameters
    ----------
    data : dict
        The loaded JSON data

    Returns
    -------
    bool
        True if the data appears to be a valid DEX file, False otherwise
    """
    # Check for required fields
    if "events" not in data:
        return False

    # Version is required - either as "version" or inside "type"
    if "version" not in data and "type" not in data:
        return False

    # Check if events is a list
    if not isinstance(data["events"], list):
        return False

    # Check each event
    for event in data["events"]:
        if "id" not in event or "pieces" not in event:
            return False

        # Check if pieces is a list
        if not isinstance(event["pieces"], list):
            return False

        # Check each piece
        for piece in event["pieces"]:
            if "name" not in piece or "type" not in piece:
                return False

    return True
