# Created by: Dmitry Romanov, 2024
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.

"""Utilities for working with Firebird DEX (Data Exchange) format files."""

import json
from typing import Dict, Any
import click


def load_dex_file(file_path: str) -> Dict[str, Any]:
    """
    Load and validate a Firebird DEX JSON file.

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
        with open(file_path, 'r') as f:
            dex_data = json.load(f)
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
        if "id" not in event or "groups" not in event:
            return False

        # Check if groups is a list
        if not isinstance(event["groups"], list):
            return False

        # Check each group
        for group in event["groups"]:
            if "name" not in group or "type" not in group:
                return False

    return True
