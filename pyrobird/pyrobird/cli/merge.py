import json
import os
import click
import logging
import sys
from typing import Dict, List, Any, Set, Union

# Configure logging
logger = logging.getLogger(__name__)

@click.command()
@click.option('--reset-id', is_flag=True, help='Reset entry IDs to sequential numbers (0,1,2...)')
@click.option('--ignore', is_flag=True, help='Ignore duplicate component names from right files')
@click.option('--overwrite', is_flag=True, help='Overwrite duplicate component names from left files')
@click.option('-o', '--output', 'output_file', help='Output file name for the merged result')
@click.argument('input_files', nargs=-1, required=True)
def merge(reset_id, ignore, overwrite, output_file, input_files):
    """
    Merge multiple Firebird DEX JSON files.

    This command merges entries from multiple Firebird DEX JSON files based on their IDs.
    Components with the same name in different files are handled according to specified flags.

    By default, the command fails if duplicate component names are found.

    Examples:
      - Merge two files with default behavior (fail on duplicate components):
          pyrobird merge file1.firebird.json file2.firebird.json

      - Merge multiple files, resetting entry IDs to sequential numbers:
          pyrobird merge --reset-id file1.firebird.json file2.firebird.json file3.firebird.json

      - Merge two files, ignoring duplicate components from the second file:
          pyrobird merge --ignore file1.firebird.json file2.firebird.json

      - Merge two files, overwriting duplicate components from the first file:
          pyrobird merge --overwrite file1.firebird.json file2.firebird.json

      - Save merged result to a specific file:
          pyrobird merge -o merged.firebird.json file1.firebird.json file2.firebird.json
    """
    # Check that we have at least two files
    if len(input_files) < 2:
        raise click.UsageError("At least two input files are required for merging.")

    # Check that both ignore and overwrite are not set simultaneously
    if ignore and overwrite:
        raise click.UsageError("--ignore and --overwrite flags cannot be used together.")

    # Load all input files
    dex_data_list = []
    for file_path in input_files:
        dex_data = load_dex_file(file_path)
        dex_data_list.append((file_path, dex_data))

    # Merge the DEX files
    merged_data = merge_dex_files(dex_data_list, reset_id, ignore, overwrite)

    # Save the merged result
    if output_file:
        try:
            with open(output_file, 'w') as f:
                json.dump(merged_data, f, indent=2)
            logger.info(f"Merged data saved to {output_file}")
        except Exception as e:
            raise click.FileError(output_file, f"Error saving merged data: {e}")
    else:
        # Output to stdout
        print(json.dumps(merged_data, indent=2))


def load_dex_file(file_path: str) -> Dict[str, Any]:
    """
    Load and validate a Firebird DEX JSON file.

    Args:
        file_path: Path to the DEX file

    Returns:
        The loaded DEX data

    Raises:
        click.FileError: If file cannot be loaded or is invalid
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

    Args:
        data: The loaded JSON data

    Returns:
        True if the data appears to be a valid DEX file, False otherwise
    """
    # Check for required fields
    if "entries" not in data:
        return False

    # Version is required - either as "version" or inside "type"
    if "version" not in data and "type" not in data:
        return False

    # Check if entries is a list
    if not isinstance(data["entries"], list):
        return False

    # Check each entry
    for entry in data["entries"]:
        if "id" not in entry or "components" not in entry:
            return False

        # Check if components is a list
        if not isinstance(entry["components"], list):
            return False

        # Check each component
        for component in entry["components"]:
            if "name" not in component or "type" not in component:
                return False

    return True


def merge_dex_files(
        dex_files: List[tuple],
        reset_id: bool = False,
        ignore: bool = False,
        overwrite: bool = False
) -> Dict[str, Any]:
    """
    Merge multiple Firebird DEX files.

    Args:
        dex_files: List of (file_path, dex_data) tuples
        reset_id: Whether to reset entry IDs to sequential numbers
        ignore: Whether to ignore duplicate components from the right file
        overwrite: Whether to overwrite duplicate components in the left file

    Returns:
        The merged DEX data
    """
    if not dex_files:
        return {}

    # Start with the first file's data as the base
    file_path, base_dex = dex_files[0]

    # Initialize the result with the proper header structure
    result = create_merged_header(dex_files)

    # Merge entries from all files
    entries = merge_entries(dex_files, reset_id, ignore, overwrite)
    result["entries"] = entries

    return result


def create_merged_header(dex_files: List[tuple]) -> Dict[str, Any]:
    """
    Create a header for the merged DEX file with proper metadata.

    Args:
        dex_files: List of (file_path, dex_data) tuples

    Returns:
        A dictionary with the proper DEX header structure
    """
    first_file_path, first_dex = dex_files[0]

    # Start with a basic DEX structure
    result = {
        "type": "firebird-dex-json",
        "version": "0.03",  # Use latest version
        "origin": {
            "merged_from": [],
            "entries_count": 0
        }
    }

    # Check if any of the input files have a version specified
    for file_path, dex in dex_files:
        if "version" in dex:
            # Use the highest version number
            current_version = dex["version"]
            if current_version > result["version"]:
                result["version"] = current_version

    # Add source file information
    total_entries = 0
    for file_path, dex in dex_files:
        source_info = {
            "file": os.path.basename(file_path)
        }

        # Copy entries count if available
        if "origin" in dex and isinstance(dex["origin"], dict):
            if "entries_count" in dex["origin"]:
                source_info["entries_count"] = dex["origin"]["entries_count"]
                total_entries += dex["origin"]["entries_count"]

            # Copy any other relevant origin info
            for key, value in dex["origin"].items():
                if key not in ["entries_count", "merged_from"] and key not in source_info:
                    source_info[key] = value

        # Add this file to the merged_from list
        result["origin"]["merged_from"].append(source_info)

    # Update total entries count
    result["origin"]["entries_count"] = total_entries

    return result


def merge_entries(
        dex_files: List[tuple],
        reset_id: bool = False,
        ignore: bool = False,
        overwrite: bool = False
) -> List[Dict[str, Any]]:
    """
    Merge entries from multiple DEX files.

    Args:
        dex_files: List of (file_path, dex_data) tuples
        reset_id: Whether to reset entry IDs to sequential numbers
        ignore: Whether to ignore duplicate components from the right file
        overwrite: Whether to overwrite duplicate components in the left file

    Returns:
        A list of merged entries
    """
    if not dex_files:
        return []

    # Process entry IDs if reset_id is True
    if reset_id:
        processed_files = []
        for i, (file_path, dex) in enumerate(dex_files):
            # Reset entry IDs to sequential numbers
            updated_dex = dex.copy()
            updated_entries = []
            for j, entry in enumerate(dex["entries"]):
                updated_entry = entry.copy()
                updated_entry["id"] = j
                updated_entries.append(updated_entry)
            updated_dex["entries"] = updated_entries
            processed_files.append((file_path, updated_dex))
        dex_files = processed_files

    # Create dictionaries of entries by ID for each file
    entries_by_id_list = []
    for file_path, dex in dex_files:
        entries_by_id = {entry["id"]: entry for entry in dex["entries"]}
        entries_by_id_list.append((file_path, entries_by_id))

    # Collect all unique entry IDs
    all_entry_ids = set()
    for _, entries_by_id in entries_by_id_list:
        all_entry_ids.update(entries_by_id.keys())

    # Process each entry ID
    merged_entries = []
    for entry_id in sorted(all_entry_ids, key=lambda x: (isinstance(x, (int, float)), x)):
        entries_with_this_id = []
        for file_path, entries_by_id in entries_by_id_list:
            if entry_id in entries_by_id:
                entries_with_this_id.append((file_path, entries_by_id[entry_id]))

        # If only one file has this entry ID, add it directly
        if len(entries_with_this_id) == 1:
            file_path, entry = entries_with_this_id[0]
            merged_entries.append(entry)
            continue

        # Merge entries with the same ID
        merged_entry = merge_entry_components(entry_id, entries_with_this_id, ignore, overwrite)
        merged_entries.append(merged_entry)

    return merged_entries


def merge_entry_components(
        entry_id: Union[str, int],
        entries_with_id: List[tuple],
        ignore: bool = False,
        overwrite: bool = False
) -> Dict[str, Any]:
    """
    Merge components from multiple entries with the same ID.

    Args:
        entry_id: The entry ID being processed
        entries_with_id: List of (file_path, entry) tuples for entries with this ID
        ignore: Whether to ignore duplicate components from later files
        overwrite: Whether to overwrite duplicate components from earlier files

    Returns:
        A merged entry
    """
    if not entries_with_id:
        return {"id": entry_id, "components": []}

    # Start with the first entry
    first_file_path, first_entry = entries_with_id[0]
    merged_entry = {
        "id": entry_id,
        "components": [],
        # Copy any additional fields from the first entry
        **{k: v for k, v in first_entry.items() if k not in ["id", "components"]}
    }

    # Track components by name for duplicate detection
    components_by_name = {}

    # Process each entry's components
    for file_idx, (file_path, entry) in enumerate(entries_with_id):
        for component in entry["components"]:
            comp_name = component["name"]

            if comp_name in components_by_name:
                # Handle duplicate component names
                prev_idx, prev_comp = components_by_name[comp_name]

                if ignore:
                    # Ignore the current component, keep the previous one
                    logger.warning(
                        f"Ignoring component '{comp_name}' in entry ID '{entry_id}' from {file_path}"
                    )
                    continue

                elif overwrite:
                    # Overwrite the previous component with the current one
                    merged_entry["components"].remove(prev_comp)
                    merged_entry["components"].append(component)
                    components_by_name[comp_name] = (file_idx, component)
                    logger.warning(
                        f"Overwriting component '{comp_name}' in entry ID '{entry_id}' with component from {file_path}"
                    )

                else:
                    # Default behavior: fail with detailed error
                    prev_file_path = entries_with_id[prev_idx][0]
                    error_msg = (
                        f"Duplicate component name '{comp_name}' found in entry ID '{entry_id}': "
                        f"in files '{prev_file_path}' and '{file_path}'. "
                        "Use --ignore or --overwrite flags to handle duplicates."
                    )
                    raise ValueError(error_msg)

            else:
                # No duplicate, add the component
                merged_entry["components"].append(component)
                components_by_name[comp_name] = (file_idx, component)

    return merged_entry