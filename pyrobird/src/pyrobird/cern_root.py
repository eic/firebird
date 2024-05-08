# Created by: Dmitry Romanov at 4/27/2024
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.
import fnmatch
import logging

from rich import inspect

default_logger = logging.getLogger("pyrobird.cern_root")


def ensure_pyroot_importable(raises=True, logger=default_logger):
    """Ensures CERN ROOT packet is loadable as it is an OPTIONAL dependence.
    Writes human-readable help about what to do. Re raises the exception
    """
    try:
        import ROOT
        return True
    except ImportError as err:
        if logger:
            logger.error(f"Module ROOT is not found. Error: {err} "
                         "To make this functionality available, "
                         "ensure running in the environment where Cern ROOT PyROOT is installed. "
                         "You should be able to run python and 'import ROOT'")
        if raises:
            raise
        else:
            return False


def tgeo_delete_node(node):
    """
    Removes the given node from TGeo geometry.

    This function takes a node within TGeo and removes it from its mother volume.
    It ensures that the node is not only removed from the geometry tree
    but also deleted to free up memory.

    Parameters
    ----------
    node : TGeoNode
        The node to be removed from the geometry. This should be an instance of TGeoNode, which
        is part of the TGeo volume hierarchy in ROOT.

    Returns
    -------
    None

    Examples
    --------
    >>> my_node = some_tgeo_volume.FindNode('desired_node_name')
    >>> tgeo_delete_node(my_node)
    """

    mother_volume = node.GetMotherVolume()
    mother_volume.RemoveNode(node)
    # del node


def tgeo_process_file(file_name, output_file, delete_list, logger=default_logger):

    # Import root. We import root here to make sure this module is loadable if ROOT is not installed
    ensure_pyroot_importable()
    import ROOT
    from ROOT import TGeoManager, TGeoIterator, TGeoAtt, TString


    # Switch off TGeoManager Info like messages
    ROOT.gErrorIgnoreLevel = ROOT.kFatal

    # Can we load GeoManager from file?
    geo_manager = TGeoManager.Import(file_name)
    #inspect(geo_manager, methods=True)
    logger.info(f"Loaded geometry with: {geo_manager.GetNNodes()} nodes")

    # Walk through nodes:
    geo_iter = TGeoIterator(geo_manager.GetMasterVolume())
    node = geo_iter.Next()
    processed_nodes = 1
    while node is not None:
        full_path = TString()
        geo_iter.GetPath(full_path)
        full_path = str(full_path)

        if not node:
            continue

        volume = node.GetVolume()
        if volume:
            volume.SetLineColor(ROOT.kMagenta)

        #if not delete_list:
        #  logger.info("Rules list is empty. Exiting")

        if not processed_nodes % 100000:
            logger.info(f"Processed nodes: {processed_nodes}")

        # Search for pattern
        for pattern in delete_list:
            if fnmatch.fnmatch(full_path, pattern):
                logger.debug(f"Delete Rule: {pattern} node: {full_path} ")
                tgeo_delete_node(node)
                delete_list.remove(pattern)
                break
        node = geo_iter.Next()
        processed_nodes += 1

    logger.debug("Saving modified geometry")
    geo_manager.CleanGarbage()
    geo_manager.Export(output_file)
    logger.debug(f"File {output_file} exported")

