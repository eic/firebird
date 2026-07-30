import logging
import click
from pyrobird.edm4eic import edm4eic_to_dex_dict, parse_entry_numbers
from pyrobird.edm4hep import edm4hep_to_dex_dict, detect_file_type, DEFAULT_HIT_BOX_SIZE
import os
import json


def guess_output_name(input_entry, output_extension='.firebird.json'):
    """
    Processes the input_entry by removing any network protocol prefixes,
    replacing or adding the specified output_extension.

    Parameters:
    - input_entry (str): The input file name or path.
    - output_extension (str): The extension to replace or append.

    Returns:
    - str: The processed file name with the correct extension.
    """
    # Remove protocol if any (e.g., root://, http://)
    while '://' in input_entry:
        input_entry = input_entry.split('://', maxsplit=1)[1]

    # Split the filename and extension
    base, ext = os.path.splitext(input_entry)

    # Replace the extension if it exists, else append the output_extension
    if ext:
        output_filename = base + output_extension
    else:
        output_filename = input_entry + output_extension

    return output_filename


@click.command()
@click.option(
    "-o", "--output", "output_file", default=None,
    help="Output file name (set automatically if not given). Use '-' to output to stdout."
)
@click.option(
    "-e", "--entries", "entries_str",  default="0",
    help="Entry/event number to convert. Could be value, comma separated list or range. E.g '--entry=1,3-5,8'"
)
@click.option(
    "-c", "--collections", "collections_str", default="",
    help="Comma-separated list of collection types to convert. "
         "For example: 'tracker_hits,tracks' (edm4eic) or 'tracker_hits,mc_trajectories' (edm4hep)."
)
@click.option(
    "-t", "--type", "input_type", type=click.Choice(["auto", "edm4eic", "edm4hep"]), default="auto",
    help="Input file type. 'auto' (default) detects it from branch types; "
         "eicrecon files carrying both models are detected as edm4eic."
)
@click.option(
    "--hit-box-size", "hit_box_size", type=float, default=DEFAULT_HIT_BOX_SIZE,
    help=f"[edm4hep] Box size in mm for sim hits, which carry no position error "
         f"(default: {DEFAULT_HIT_BOX_SIZE})."
)
@click.option(
    "--traj-vertex/--no-traj-vertex", "traj_vertex", default=True,
    help="[edm4hep] Prepend the MCParticle vertex as the first trajectory point (default: on)."
)
@click.option(
    "--traj-endpoint", "traj_endpoint", is_flag=True, default=False,
    help="[edm4hep] Append the MCParticle endpoint as the last trajectory point (default: off)."
)
@click.argument("filename", required=True)
def convert(filename, output_file, entries_str, collections_str, input_type,
            hit_box_size, traj_vertex, traj_endpoint):
    """
    Converts an input EDM4eic or EDM4hep ROOT file to a Firebird-compatible JSON file.

    This command reads the specified input ROOT file, extracts the first event
    from the 'events' tree, and writes it to a JSON file that can be used with
    the Firebird event display tool.

    If an output file name is not specified, it will be automatically generated
    by replacing or appending the `.firebird.json` extension to the input file
    name.

    Use `-o -` or `--output -` to output the JSON data to stdout instead of a file.
    This allows the command to be used in pipelines.

    Use `-t` or `--type` to select the input data model. The default 'auto' inspects
    the tree: files with reconstructed edm4eic::TrackerHitData are treated as edm4eic,
    files with only edm4hep::SimTrackerHitData (e.g. ddsim output) as edm4hep.

    Use `-c` or `--collections` to specify specific collections to convert.

    For edm4eic:
      - tracker_hits     - edm4eic::TrackerHitData
      - tracks           - edm4eic::TrackSegmentData with associated tracks

    For edm4hep:
      - tracker_hits     - edm4hep::SimTrackerHitData
      - mc_trajectories  - MC-truth trajectories connecting sim hits per MCParticle

    **Example usage:**

    \b
        convert mydata.root
        convert mydata.root --output output.firebird.json
        convert mydata.root --output - | less
        convert mydata.root --collections=tracks
        convert sim.edm4hep.root -t edm4hep
        convert sim.edm4hep.root -t edm4hep --traj-endpoint --hit-box-size=5
    """
    import uproot

    may_be_url = "://" in filename

    if not may_be_url and not os.path.isfile(filename):
        msg = f"File not found: '{filename}'"
        raise FileNotFoundError(msg)

    file = uproot.open(filename)
    tree = file['events']

    num_entries = tree.num_entries

    # Parse use entries input
    entries = parse_entry_numbers(entries_str)

    # Parse collections string
    collections = None
    if collections_str:
        collections = [x.strip() for x in collections_str.split(',') if x.strip()]

    # Do we have valid entries?
    for entry_index in entries:
        if entry_index > num_entries - 1:
            err_msg = f"Entries provided as: '{entries_str}' " \
                       f"but entry index={entry_index} is outside of total num_entries={num_entries}"
            raise ValueError(err_msg)

    # Detect the file type if not given explicitly
    if input_type == "auto":
        input_type = detect_file_type(tree)
        logging.info(f"Detected file type: {input_type}")

    # Extract the first event from the tree
    origin_info = {
        "file": filename,
        "entries_count": num_entries,
        "file_type": input_type
    }

    if input_type == "edm4hep":
        fdex_dict = edm4hep_to_dex_dict(tree, entries, origin_info, collections=collections,
                                        box_size=hit_box_size,
                                        prepend_vertex=traj_vertex,
                                        append_endpoint=traj_endpoint)
    else:
        fdex_dict = edm4eic_to_dex_dict(tree, entries, origin_info, collections=collections)

    # Convert the event data to JSON format
    json_data = json.dumps(fdex_dict)

    if output_file == '-':
        # Output to stdout
        print(json_data)
    else:
        # Determine the output file name if not provided
        if output_file is None:
            output_file = guess_output_name(filename)
        # Write the JSON data to the output file
        with open(output_file, 'w') as f:
            f.write(json_data)
