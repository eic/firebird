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



@click.command()
@click.argument('file_name')
@click.pass_context
def info(ctx, file_name):
    """
    Shows information about geometry in file,
    Requires CERN ROOT geometry file name
    """
    context = ctx.obj
    print(f"Geometry info for: '{file_name}'")

    ensure_pyroot_importable()
    import ROOT

    # TGeoManager::Import("rootgeom.root");
    #
    # TGeoIterator iter(gGeoManager->GetMasterVolume());
    #
    # TGeoNode *node;
    #
    # while ((node = iter.Next())) {
    # // printf("Name %s\n", node->GetName());
    # node->GetVolume()->ResetAttBit(TGeoAtt::kVisOnScreen);
    # }
    #
    # gGeoManager->Export("rootgeom2.root");

    import ROOT
    from ROOT import TGeoManager, TGeoIterator, TGeoAtt, TString

    #ROOT.gErrorIgnoreLevel = ROOT.kFatal

    gGeoManager = TGeoManager.Import(file_name)

    iter = TGeoIterator(gGeoManager.GetMasterVolume())

    node = iter.Next()
    while node is not None:

        full_path = TString()
        iter.GetPath(full_path)
        full_path = str(full_path)
        # break
        print(full_path.count('/'), full_path)
        pattern = '*/DIRC*/DIRCModule_0*'
        if fnmatch.fnmatch(full_path, pattern):
            tgeo_delete_node(node)
            print(full_path)
            #break


        # inspect(iter, methods=True)
        #break
        # node.GetVolume().ResetAttBit(TGeoAtt.kVisOnScreen)

        node = iter.Next()

    gGeoManager.CleanGarbage()
    gGeoManager.CloseGeometry()
    output_file_name = file_name[:-4] + "new.root"
    print(f"Output file name: {output_file_name}")
    gGeoManager.Export(output_file_name)

    #
    # print("ROOT imported")
    # root_file = ROOT.TFile(file_name)
    # root_file.ls()
    # geometries = {}
    # for key in root_file.GetListOfKeys():
    #     obj_class_name = key.GetClassName()
    #     name = key.GetName()
    #     if obj_class_name in ["TGeoManager"]:
    #
    #         geometries[str(key.GetName())] = root_file.Get(name)
    #
    # inspect(geometries)

    # with TFile.Open("pyroot005_file_1.root", "recreate") as f:
    #     histo_2 = ROOT.TH1F("histo_2", "histo_2", 10, 0, 10)
    #     # Inside the context, the current directory is the open file
    #     print("Current directory: '{}'.\n".format(ROOT.gDirectory.GetName()))
    #     # And the created histogram is automatically attached to the file
    #     print("Histogram '{}' is attached to: '{}'.\n".format(histo_2.GetName(), histo_2.GetDirectory().GetName()))
    #     # Before exiting the context, objects can be written to the file
    #     f.WriteObject(histo_2, "my_histogram")
    #
    # # When the TFile.Close method is called, the current directory is automatically
    # # set again to ROOT.gROOT. Objects that were attached to the file inside the
    # # context are automatically deleted and made 'None' when the file is closed.
    # print("Status after the first TFile context manager:")
    # print(" Current directory: '{}'.".format(ROOT.gDirectory.GetName()))
    # print(" Accessing 'histo_2' gives: '{}'.\n".format(histo_2))


    # #inspect(key, methods=True)
    # class_info = ROOT.gROOT.GetClass(key.GetClassName())
    #
    # print(class_info)
    # print(key.GetClassName())




    #inspect(root_file, methods=True)
    #geo_man = root_file.Get("Default")
    #inspect(my_list, methods=True)


@click.command()
@click.option('-r', '--rules', 'rule_file', required=False, help='Path to the JSON rules file.')
@click.option('-o', '--output', 'output_file', required=False, help='Output file path.')
@click.argument('input_file')
def process(input_file, output_file, rule_file):
    """
    Shows information about geometry in file,
    Requires CERN ROOT geometry file name
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
    tgeo_process_file(input_file, output_file, rules_data["nodeRemoveList"], logger)


geo.add_command(info)
geo.add_command(process)
