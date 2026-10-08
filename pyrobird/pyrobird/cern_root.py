# Created by: Dmitry Romanov at 4/27/2024
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.
import fnmatch
import logging

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


def tgeo_walk(geo_manager, max_depth=None):
    """
    Walks the physical node tree of a TGeo geometry.

    PyROOT ends the walk with a null TGeoNode proxy, which is falsy but not
    None, so the loop tests truthiness. Do not remove nodes while the walk
    runs: collect them and remove them afterwards.

    Parameters
    ----------
    geo_manager : TGeoManager
        The geometry to walk.
    max_depth : int, optional
        Do not descend below this level (1 is the daughters of the top
        volume). None walks the whole tree.

    Yields
    ------
    tuple of (str, int, TGeoNode)
        The node path, such as '/world_1/DIRC_1', its level, and the node.
    """
    from ROOT import TGeoIterator, TString

    geo_iter = TGeoIterator(geo_manager.GetMasterVolume())
    node = geo_iter.Next()
    while node:
        full_path = TString()
        geo_iter.GetPath(full_path)
        level = geo_iter.GetLevel()
        if max_depth is not None and level >= max_depth:
            # Do not descend into this node's daughters
            geo_iter.Skip()
        yield str(full_path), level, node
        node = geo_iter.Next()


def tgeo_info(file_name, max_depth=2, echo=print):
    """
    Prints the node paths of a TGeo geometry file down to `max_depth`.

    Parameters
    ----------
    file_name : str
        A ROOT file that holds a TGeoManager.
    max_depth : int
        Deepest level to print; 0 prints the summary only.
    echo : callable
        Receives each output line.

    Returns
    -------
    int
        Number of node paths printed.
    """
    ensure_pyroot_importable()
    import ROOT
    from ROOT import TGeoManager

    # Switch off TGeoManager Info like messages
    ROOT.gErrorIgnoreLevel = ROOT.kFatal

    geo_manager = TGeoManager.Import(file_name)
    if not geo_manager:
        raise ValueError(f"No TGeoManager found in '{file_name}'")

    top = geo_manager.GetTopVolume()
    echo(f"Top volume: {top.GetName() if top else '(none)'}")
    echo(f"Nodes: {geo_manager.GetNNodes()}")

    printed = 0
    if max_depth > 0:
        for full_path, level, _ in tgeo_walk(geo_manager, max_depth=max_depth):
            echo(f"{level} {full_path}")
            printed += 1
    return printed


def tgeo_process_file(file_name, output_file, delete_list, logger=default_logger):
    """
    Removes nodes from a TGeo geometry file by path pattern and exports the result.

    Each pattern removes the first node whose full path matches it (fnmatch
    syntax, such as '*/DIRC_??'). Matching nodes are collected during the
    walk and removed after it: removing them while TGeoIterator runs crashes
    ROOT.

    Parameters
    ----------
    file_name : str
        Input ROOT file that holds a TGeoManager.
    output_file : str
        Output ROOT file.
    delete_list : list of str
        Path patterns. The list is not modified.
    logger : logging.Logger
        Receives progress messages.

    Returns
    -------
    list of str
        Paths of the removed nodes.
    """

    # Import root. We import root here to make sure this module is loadable if ROOT is not installed
    ensure_pyroot_importable()
    import ROOT
    from ROOT import TGeoManager

    # Switch off TGeoManager Info like messages
    ROOT.gErrorIgnoreLevel = ROOT.kFatal

    # Can we load GeoManager from file?
    geo_manager = TGeoManager.Import(file_name)
    if not geo_manager:
        raise ValueError(f"No TGeoManager found in '{file_name}'")
    logger.info(f"Loaded geometry with: {geo_manager.GetNNodes()} nodes")

    remaining_patterns = list(delete_list)
    to_remove = []
    processed_nodes = 0

    # Walk through nodes and collect the ones to remove
    for full_path, _, node in tgeo_walk(geo_manager):
        processed_nodes += 1

        volume = node.GetVolume()
        if volume:
            volume.SetLineColor(ROOT.kMagenta)

        if not processed_nodes % 100000:
            logger.info(f"Processed nodes: {processed_nodes}")

        # Search for pattern
        for pattern in remaining_patterns:
            if fnmatch.fnmatch(full_path, pattern):
                logger.debug(f"Delete Rule: {pattern} node: {full_path} ")
                to_remove.append((full_path, node))
                remaining_patterns.remove(pattern)
                break

    # Remove after the walk has finished
    for full_path, node in to_remove:
        tgeo_delete_node(node)

    logger.debug("Saving modified geometry")
    geo_manager.CleanGarbage()
    geo_manager.Export(output_file)
    logger.debug(f"File {output_file} exported")
    return [full_path for full_path, _ in to_remove]
