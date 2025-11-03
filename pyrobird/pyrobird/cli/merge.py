import json
import os
import click
import logging
import sys
from typing import Dict, List, Any, Set, Union

from pyrobird.dex_utils import load_dex_file, is_valid_dex_file

# Configure logging
logger = logging.getLogger(__name__)

@click.command()
@click.option('--reset-id', is_flag=True, help='Reset event IDs to sequential numbers (0,1,2...)')
@click.option('--ignore', is_flag=True, help='Ignore duplicate group names from right files')
@click.option('--overwrite', is_flag=True, help='Overwrite duplicate group names from left files')
@click.option('-o', '--output', 'output_file', help='Output file name for the merged result')
@click.argument('input_files', nargs=-1, required=True)
def merge(reset_id, ignore, overwrite, output_file, input_files):
    """
    Merge multiple Firebird DEX JSON files.

    This command merges events from multiple Firebird DEX JSON files based on their IDs.
    Groups with the same name in different files are handled according to specified flags.

    By default, the command fails if duplicate group names are found.

    Examples:
      - Merge two files with default behavior (fail on duplicate groups):
          pyrobird merge file1.firebird.json file2.firebird.json

      - Merge multiple files, resetting event IDs to sequential numbers:
          pyrobird merge --reset-id file1.firebird.json file2.firebird.json file3.firebird.json

      - Merge two files, ignoring duplicate groups from the second file:
          pyrobird merge --ignore file1.firebird.json file2.firebird.json

      - Merge two files, overwriting duplicate groups from the first file:
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


def reset_events_id(dex_files: List[tuple]) -> List[tuple]:
    """
    Reset event IDs to sequential numbers.

    Args:
        dex_files: List of (file_path, dex_data) tuples

    Returns:
        Updated list of (file_path, dex_data) tuples with reset event IDs
    """
    processed_files = []
    for file_path, dex in dex_files:
        # Reset event IDs to sequential numbers
        updated_dex = dex.copy()
        updated_events = []
        for new_index, event in enumerate(dex["events"]):
            updated_event = event.copy()
            updated_event["id"] = new_index
            updated_events.append(updated_event)
        updated_dex["events"] = updated_events
        processed_files.append((file_path, updated_dex))
    return processed_files


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
        reset_id: Whether to reset event IDs to sequential numbers
        ignore: Whether to ignore duplicate groups from the right file
        overwrite: Whether to overwrite duplicate groups in the left file

    Returns:
        The merged DEX data
    """
    if not dex_files:
        return {}

    # Initialize the result with the proper header structure
    result = create_merged_header(dex_files)

    # Reset event IDs if requested
    if reset_id:
        dex_files = reset_events_id(dex_files)

    # Merge events from all files
    events = merge_events(dex_files, ignore, overwrite)
    result["events"] = events

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
        "version": "0.04",  # Use latest version
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


def merge_events(
        dex_files: List[tuple],
        ignore: bool = False,
        overwrite: bool = False
) -> List[Dict[str, Any]]:
    """
    Merge events from multiple DEX files.

    Args:
        dex_files: List of (file_path, dex_data) tuples
        ignore: Whether to ignore duplicate groups from the right file
        overwrite: Whether to overwrite duplicate groups in the left file

    Returns:
        A list of merged events
    """
    if not dex_files:
        return []

    # Create dictionaries of events by ID for each file
    events_by_id_list = []
    for file_path, dex in dex_files:
        events_by_id = {event["id"]: event for event in dex["events"]}
        events_by_id_list.append((file_path, events_by_id))

    # Collect all unique event IDs
    all_event_ids = set()
    for _, events_by_id in events_by_id_list:
        all_event_ids.update(events_by_id.keys())

    # Process each event ID
    merged_events = []
    for event_id in sorted(all_event_ids, key=lambda x: (isinstance(x, (int, float)), x)):
        events_with_this_id = []
        for file_path, events_by_id in events_by_id_list:
            if event_id in events_by_id:
                events_with_this_id.append((file_path, events_by_id[event_id]))

        # If only one file has this event ID, add it directly
        if len(events_with_this_id) == 1:
            file_path, event = events_with_this_id[0]
            merged_events.append(event)
            continue

        # Merge events with the same ID
        merged_event = merge_event_groups(event_id, events_with_this_id, ignore, overwrite)
        merged_events.append(merged_event)

    return merged_events


def merge_event_groups(
        event_id: Union[str, int],
        events_with_id: List[tuple],
        ignore: bool = False,
        overwrite: bool = False
) -> Dict[str, Any]:
    """
    Merge groups from multiple events with the same ID.

    Args:
        event_id: The event ID being processed
        events_with_id: List of (file_path, event) tuples for events with this ID
        ignore: Whether to ignore duplicate groups from later files
        overwrite: Whether to overwrite duplicate groups from earlier files

    Returns:
        A merged event
    """
    if not events_with_id:
        return {"id": event_id, "groups": []}

    # Start with the first event
    first_file_path, first_event = events_with_id[0]
    merged_event = {
        "id": event_id,
        "groups": [],
        # Copy any additional fields from the first event
        **{k: v for k, v in first_event.items() if k not in ["id", "groups"]}
    }

    # Track groups by name for duplicate detection
    groups_by_name = {}

    # Process each event's groups
    for file_idx, (file_path, event) in enumerate(events_with_id):
        for group in event["groups"]:
            group_name = group["name"]

            if group_name in groups_by_name:
                # Handle duplicate group names
                prev_idx, prev_group = groups_by_name[group_name]

                if ignore:
                    # Ignore the current group, keep the previous one
                    logger.warning(
                        f"Ignoring group '{group_name}' in event ID '{event_id}' from {file_path}"
                    )
                    continue

                elif overwrite:
                    # Overwrite the previous group with the current one
                    merged_event["groups"].remove(prev_group)
                    merged_event["groups"].append(group)
                    groups_by_name[group_name] = (file_idx, group)
                    logger.warning(
                        f"Overwriting group '{group_name}' in event ID '{event_id}' with group from {file_path}"
                    )

                else:
                    # Default behavior: fail with detailed error
                    prev_file_path = events_with_id[prev_idx][0]
                    error_msg = (
                        f"Duplicate group name '{group_name}' found in event ID '{event_id}': "
                        f"in files '{prev_file_path}' and '{file_path}'. "
                        "Use --ignore or --overwrite flags to handle duplicates."
                    )
                    raise ValueError(error_msg)

            else:
                # No duplicate, add the group
                merged_event["groups"].append(group)
                groups_by_name[group_name] = (file_idx, group)

    return merged_event