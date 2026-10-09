# Created by: Dmitry Romanov, 2024
# This file is part of Firebird Event Display and is licensed under GPL-3.0-or-later.
# See the LICENSE file in the project root for full license information.
import os
import logging
from importlib import resources

import click
import yaml

from pyrobird.cern_root import tgeo_info, tgeo_process_file

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _load_rules(rule_file):
    """
    Load YAML rules from a specified file, or a default EIC rules file if no file is provided.

    Parameters
    ----------
    rule_file : str, optional
        The path to the user-specified rules file. If `None`, defaults to loading
        rules from a predefined YAML file within the package resources.

    Returns
    -------
    dict
        A dictionary containing the rules data loaded from the YAML file.
    """
    try:
        if not rule_file:
            logger.warning("No rule file is given with --rule flag. Using default EIC central detector rules")
            with resources.open_text('pyrobird.data', 'eic_geo_process_rules.yaml') as file:
                rules_data = yaml.safe_load(file)
        else:
            with open(rule_file, 'r') as file:
                rules_data = yaml.safe_load(file)

    except FileNotFoundError:
        logger.error("Error: The specified rule file does not exist.")
        raise
    except yaml.YAMLError as exc:
        logger.error(f"Error parsing YAML file: {exc}")
        raise
    except Exception as e:
        logger.error(f"An unexpected error occurred: {e}")
        raise

    return rules_data


@click.group()
@click.pass_context
def geo(ctx):
    """
    Inspect and edit CERN ROOT TGeo geometry files. Requires PyROOT.
    """

    if ctx.invoked_subcommand is None:
        print("No command was specified")


@click.command()
@click.option('-d', '--max-depth', 'max_depth', type=int, default=2, show_default=True,
              help='Print node paths down to this level (1 is the daughters of the top volume). '
                   '0 prints the summary only.')
@click.argument('file_name')
def info(file_name, max_depth):
    """
    Print the node tree of a TGeo geometry file.

    Prints the top volume, the node count, and the level and path of each
    node down to --max-depth. The file is not modified. Requires PyROOT.
    """
    print(f"Geometry info for: '{file_name}'")
    tgeo_info(file_name, max_depth=max_depth, echo=print)


@click.command()
@click.option('-r', '--rules', 'rule_file', required=False,
              help="Path to the YAML rules file. Defaults to the bundled EIC central detector rules.")
@click.option('-o', '--output', 'output_file', required=False,
              help="Output file path. Defaults to <input>.edit.root.")
@click.argument('input_file')
def process(input_file, output_file, rule_file):
    """
    Remove nodes from a TGeo geometry file and save the result.

    The rules file holds a 'nodeRemoveList' of node path patterns in fnmatch
    syntax, such as '*/DIRC_??'. Each pattern removes the first node whose
    path matches it. Requires PyROOT.
    """

    # (!) The main logic of this command lives in:
    #     pyrobird.cern_root.tgeo_process_file

    # Load rules file
    rules_data = _load_rules(rule_file)
    logger.debug("Loaded rules data")

    # Ensure output file exists
    if not output_file:
        if input_file.endswith('.root'):
            base_name = os.path.splitext(input_file)[0]
            output_file = f"{base_name}.edit.root"
        else:
            output_file = "edit_output.root"
    logger.debug(f"Output file: {output_file}")

    # Check if the key exists in the loaded data and raise an error if not
    if 'nodeRemoveList' not in rules_data:
        raise KeyError("The key 'nodeRemoveList' is missing from the loaded rules data.")

    # Do the processing
    removed = tgeo_process_file(input_file, output_file, rules_data["nodeRemoveList"], logger)
    logger.info(f"Removed {len(removed)} node(s); saved {output_file}")


geo.add_command(info)
geo.add_command(process)
