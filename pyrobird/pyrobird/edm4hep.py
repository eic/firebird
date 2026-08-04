import logging
import math
from collections import defaultdict

import awkward as ak

from pyrobird.dex import make_dex, PIECE_VERSION

"""
Converts EDM4hep simulation output (ddsim / DD4hep) to Firebird DEX format.

Supported collections:
    vector<edm4hep::SimTrackerHitData> - simulated tracker hits, converted to BoxHit groups
    vector<edm4hep::MCParticleData>    - MC particles, used to build MC-truth trajectories
                                         connecting the sim hits of each particle

SimTrackerHitData branch layout (edm4hep >= 0.99; older versions use 'EDep' instead of 'eDep'
and name the particle relation '_<Collection>_MCParticle' instead of '_<Collection>_particle'):
    'SiBarrelHits': 'vector<edm4hep::SimTrackerHitData>',
    'SiBarrelHits/SiBarrelHits.cellID': 'uint64_t[]',
    'SiBarrelHits/SiBarrelHits.eDep': 'float[]',
    'SiBarrelHits/SiBarrelHits.time': 'float[]',
    'SiBarrelHits/SiBarrelHits.pathLength': 'float[]',
    'SiBarrelHits/SiBarrelHits.quality': 'int32_t[]',
    'SiBarrelHits/SiBarrelHits.position.x': 'double[]',
    'SiBarrelHits/SiBarrelHits.position.y': 'double[]',
    'SiBarrelHits/SiBarrelHits.position.z': 'double[]',
    'SiBarrelHits/SiBarrelHits.momentum.x': 'float[]',
    'SiBarrelHits/SiBarrelHits.momentum.y': 'float[]',
    'SiBarrelHits/SiBarrelHits.momentum.z': 'float[]',
    '_SiBarrelHits_particle': 'vector<podio::ObjectID>',
    '_SiBarrelHits_particle/_SiBarrelHits_particle.index': 'int32_t[]',
    '_SiBarrelHits_particle/_SiBarrelHits_particle.collectionID': 'uint32_t[]',

Sim hits carry no positionError/timeError/edepError, so BoxHit dimensions use a fixed,
user-configurable box size and errors are written as 0.
"""

logger = logging.getLogger(__name__)

# Sim hits have no positionError, so boxes get a fixed visualization size [mm]
DEFAULT_HIT_BOX_SIZE = 2.0

# Cherenkov/PID collections record photon detections attributed to the emitting charged
# particle (optical photons are not stored in MCParticles). Connecting them into that
# particle's trajectory draws zigzags along the photosensor planes, so they are excluded
# from trajectory building by default (they are still converted as BoxHit groups).
DEFAULT_TRAJECTORY_EXCLUDED_COLLECTIONS = ("DIRCBarHits", "DRICHHits", "PFRICHHits")


def get_sim_hit_branches(tree):
    """Returns names of all vector<edm4hep::SimTrackerHitData> branches in the tree"""
    typenames = tree.typenames(recursive=False, full_paths=True,
                               filter_typename="vector<edm4hep::SimTrackerHitData>")
    return list(typenames.keys())


def detect_file_type(tree):
    """
    Detects the data model of an opened 'events' tree by its branch types.

    Returns 'edm4eic' if reconstructed edm4eic::TrackerHitData collections are present
    (eicrecon files also contain sim hits, reconstruction wins), 'edm4hep' if only
    edm4hep::SimTrackerHitData collections are present.

    Raises
    ------
    ValueError
        If neither collection type is found in the tree.
    """
    if tree.typenames(recursive=False, full_paths=True, filter_typename="vector<edm4eic::TrackerHitData>"):
        return "edm4eic"
    if tree.typenames(recursive=False, full_paths=True, filter_typename="vector<edm4hep::SimTrackerHitData>"):
        return "edm4hep"
    raise ValueError("Cannot detect file type: no 'vector<edm4eic::TrackerHitData>' or "
                     "'vector<edm4hep::SimTrackerHitData>' branches found in 'events' tree")


def _get_field_array(tree, full_branch, entry_start, entry_stop):
    """Reads a jagged field branch and returns it flattened as a python list"""
    return ak.flatten(tree[full_branch].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()


def _find_particle_relation_branch(tree, branch_name):
    """Finds the hit->MCParticle relation branch name, or None if missing.

    edm4hep >= 0.99 names it '_<Collection>_particle', older versions '_<Collection>_MCParticle'.
    """
    keys = set(tree.keys(recursive=False))
    for suffix in ("particle", "MCParticle"):
        candidate = f"_{branch_name}_{suffix}"
        if candidate in keys:
            return candidate
    return None


def _find_edep_field(tree, branch_name):
    """Returns the energy deposit field name: 'eDep' (edm4hep >= 0.99) or 'EDep' (older)"""
    keys = set(tree[branch_name].keys())
    for field in ("eDep", "EDep"):
        if f"{branch_name}.{field}" in keys:
            return field
    return None


def _get_mc_collection_id(tree, mc_branch):
    """
    Looks up the podio collectionID of `mc_branch` from the file's podio_metadata tree.
    Returns None if the metadata is unavailable (e.g. trimmed test files).
    """
    try:
        metadata_tree = tree.file["podio_metadata"]
        info_branch = "events___CollectionTypeInfo"
        ids = metadata_tree[f"{info_branch}/{info_branch}.collectionID"].array().tolist()[0]
        names = metadata_tree[f"{info_branch}/{info_branch}.name"].array().tolist()[0]
        for coll_id, name in zip(ids, names):
            if name == mc_branch:
                return coll_id
    except Exception as ex:
        logger.debug(f"podio_metadata not available for collectionID check: {ex}")
    return None


def sim_tracker_hits_to_box_hits(tree, branch_name, entry_start, entry_stop=None,
                                 box_size=DEFAULT_HIT_BOX_SIZE):
    """Converts vector<edm4hep::SimTrackerHitData> to BoxHit format dictionary.

    Sim hits have no positionError, so all boxes use a fixed `box_size` [mm] cube
    and time/energy errors are written as 0.
    """

    # Read only 1 event if entry_stop is not given
    if entry_stop is None:
        entry_stop = entry_start + 1

    def get_field_array(field):
        return _get_field_array(tree, f"{branch_name}/{branch_name}.{field}", entry_start, entry_stop)

    pos_x = get_field_array("position.x")   # 'double[]'
    pos_y = get_field_array("position.y")   # 'double[]'
    pos_z = get_field_array("position.z")   # 'double[]'
    time = get_field_array("time")          # 'float[]'

    edep_field = _find_edep_field(tree, branch_name)
    if edep_field:
        edep = get_field_array(edep_field)
    else:
        logger.warning(f"No eDep/EDep field found in '{branch_name}', writing 0 energy deposit")
        edep = [0.0] * len(pos_x)

    # Columnar piece: parallel arrays, hit id == array index; pos is flat xyz triplets.
    # Sim data carries no errors, so the error columns are omitted entirely.
    count = len(pos_x)
    pos = []
    for i in range(count):
        pos.extend((pos_x[i], pos_y[i], pos_z[i]))

    piece = {
        "name": branch_name,
        "type": "BoxHit",
        "version": PIECE_VERSION,
        "origin": {"type": "edm4hep::SimTrackerHitData", "name": branch_name},
        "count": count,
        "columns": {
            "pos": pos,
            "dim": [box_size] * (3 * count),
            "time": time,
            "edep": edep,
        },
    }
    return piece


def sim_hits_to_trajectories(tree, hit_branch_names, entry_start, entry_stop=None,
                             mc_branch="MCParticles", min_hits=2,
                             prepend_vertex=True, append_endpoint=False):
    """
    Builds MC-truth trajectories connecting edm4hep::SimTrackerHitData hits.

    Hits from all `hit_branch_names` collections are pooled, grouped by their associated
    MCParticle and sorted by time. Each particle with at least `min_hits` hits becomes one
    trajectory in a single 'PointTrajectory' group.

    Parameters
    ----------
    tree - uproot 'events' tree
    hit_branch_names - SimTrackerHitData collection names to pool hits from
    entry_start - first entry to process
    entry_stop - one past last entry (defaults to entry_start + 1, i.e. a single event)
    mc_branch - name of the MCParticle collection the hit relations point to
    min_hits - particles with fewer hits are skipped (their hits stay visible as boxes)
    prepend_vertex - add MCParticles.vertex (with the particle creation time) as point 0
    append_endpoint - add MCParticles.endpoint as the last point; edm4hep stores no endpoint
                      time, so the point reuses the last hit's time
    """
    if entry_stop is None:
        entry_stop = entry_start + 1

    # Columnar piece: track parameters are per-name columns (trajectory id == index),
    # the ragged per-trajectory point lists stay nested under "points"
    result = {
        "name": "McHitTrajectories",
        "type": "PointTrajectory",
        "version": PIECE_VERSION,
        "origin": {"type": ["edm4hep::SimTrackerHitData", "edm4hep::MCParticleData"],
                   "collections": list(hit_branch_names)},
        "count": 0,
        "columns": {},
        "pointColumns": ["x", "y", "z", "t", "dx", "dy", "dz", "dt"],
        "points": []
    }

    if mc_branch not in tree.keys(recursive=False):
        logger.warning(f"'{mc_branch}' collection not found, no trajectories are built")
        return result

    def get_mc_field(field):
        return _get_field_array(tree, f"{mc_branch}/{mc_branch}.{field}", entry_start, entry_stop)

    mc_pdg = get_mc_field("PDG")
    mc_charge = get_mc_field("charge")
    mc_time = get_mc_field("time")
    mc_mom_x = get_mc_field("momentum.x")
    mc_mom_y = get_mc_field("momentum.y")
    mc_mom_z = get_mc_field("momentum.z")
    mc_vtx_x = get_mc_field("vertex.x")
    mc_vtx_y = get_mc_field("vertex.y")
    mc_vtx_z = get_mc_field("vertex.z")
    mc_end_x = get_mc_field("endpoint.x") if append_endpoint else []
    mc_end_y = get_mc_field("endpoint.y") if append_endpoint else []
    mc_end_z = get_mc_field("endpoint.z") if append_endpoint else []

    # eicrecon files carry a second MCParticle collection (MCParticlesHeadOnFrameNoBeamFX);
    # all known sim-hit relations point to 'MCParticles', but sanity-check via collectionID
    # when podio metadata is available
    mc_collection_id = _get_mc_collection_id(tree, mc_branch)

    # Pool hits from all collections grouped by MCParticle index
    # Each hit is a (time, x, y, z) tuple
    hits_by_particle = defaultdict(list)
    for branch_name in hit_branch_names:
        relation_branch = _find_particle_relation_branch(tree, branch_name)
        if relation_branch is None:
            logger.warning(f"No MCParticle relation branch found for '{branch_name}', "
                           f"its hits are skipped in trajectory building")
            continue

        def get_field_array(field):
            return _get_field_array(tree, f"{branch_name}/{branch_name}.{field}", entry_start, entry_stop)

        pos_x = get_field_array("position.x")
        pos_y = get_field_array("position.y")
        pos_z = get_field_array("position.z")
        time = get_field_array("time")
        mc_index = _get_field_array(tree, f"{relation_branch}/{relation_branch}.index", entry_start, entry_stop)
        coll_ids = _get_field_array(tree, f"{relation_branch}/{relation_branch}.collectionID", entry_start, entry_stop)

        for i in range(len(pos_x)):
            index = mc_index[i]
            if index < 0 or index >= len(mc_pdg):
                continue  # unfilled relation
            if mc_collection_id is not None and coll_ids[i] != mc_collection_id:
                logger.warning(f"Hit in '{branch_name}' points to an unexpected MCParticle "
                               f"collection (collectionID={coll_ids[i]}), skipping it")
                continue
            hits_by_particle[index].append((time[i], pos_x[i], pos_y[i], pos_z[i]))

    columns = {name: [] for name in ("pdg", "charge", "px", "py", "pz", "p", "mc_index")}
    all_points = []
    for index in sorted(hits_by_particle.keys()):
        particle_hits = hits_by_particle[index]
        if len(particle_hits) < min_hits:
            continue
        particle_hits.sort(key=lambda hit: hit[0])

        # pointColumns => [x, y, z, t, dx, dy, dz, dt]; sim data has no errors
        points = []
        if prepend_vertex:
            points.append([mc_vtx_x[index], mc_vtx_y[index], mc_vtx_z[index], mc_time[index], 0, 0, 0, 0])
        for hit_time, x, y, z in particle_hits:
            points.append([x, y, z, hit_time, 0, 0, 0, 0])
        if append_endpoint:
            # edm4hep stores no endpoint time, reuse the last hit time to keep time animation monotonic
            last_time = particle_hits[-1][0]
            points.append([mc_end_x[index], mc_end_y[index], mc_end_z[index], last_time, 0, 0, 0, 0])

        momentum = math.sqrt(mc_mom_x[index] ** 2 + mc_mom_y[index] ** 2 + mc_mom_z[index] ** 2)
        columns["pdg"].append(mc_pdg[index])
        columns["charge"].append(mc_charge[index])
        columns["px"].append(mc_mom_x[index])
        columns["py"].append(mc_mom_y[index])
        columns["pz"].append(mc_mom_z[index])
        columns["p"].append(momentum)
        columns["mc_index"].append(index)
        all_points.append(points)

    result["count"] = len(all_points)
    result["columns"] = columns if all_points else {}
    result["points"] = all_points
    return result


def edm4hep_entry_to_dict(tree, entry_index, custom_name=None, collections=None,
                          box_size=DEFAULT_HIT_BOX_SIZE,
                          prepend_vertex=True, append_endpoint=False,
                          trajectory_excluded_collections=DEFAULT_TRAJECTORY_EXCLUDED_COLLECTIONS):
    # the result of this function
    components = []

    if not collections:
        collections = [
            "tracker_hits",
            "mc_trajectories"
        ]

    hit_branches = get_sim_hit_branches(tree)

    # Hits:
    if "tracker_hits" in collections:
        for branch_name in hit_branches:
            piece = sim_tracker_hits_to_box_hits(tree, branch_name, entry_index, box_size=box_size)
            # Collections empty in this event are skipped
            if piece["count"] > 0:
                components.append(piece)

    # MC-truth trajectories connecting the hits
    if "mc_trajectories" in collections:
        trajectory_branches = [b for b in hit_branches if b not in trajectory_excluded_collections]
        trajectory_piece = sim_hits_to_trajectories(tree, trajectory_branches, entry_index,
                                                    prepend_vertex=prepend_vertex,
                                                    append_endpoint=append_endpoint)
        if trajectory_piece["count"] > 0:
            components.append(trajectory_piece)

    entry = {
        "id": custom_name if custom_name else entry_index,
        "pieces": components
    }

    return entry


def edm4hep_to_dex_dict(tree, event_ids, origin_info=None, collections=None,
                        box_size=DEFAULT_HIT_BOX_SIZE,
                        prepend_vertex=True, append_endpoint=False,
                        trajectory_excluded_collections=DEFAULT_TRAJECTORY_EXCLUDED_COLLECTIONS):
    event_data = []

    if isinstance(event_ids, int):
        event_ids = [event_ids]

    for entry_id in event_ids:
        event_data.append(edm4hep_entry_to_dict(
            tree, entry_id, custom_name=None, collections=collections,
            box_size=box_size, prepend_vertex=prepend_vertex, append_endpoint=append_endpoint,
            trajectory_excluded_collections=trajectory_excluded_collections))

    return make_dex(event_data, origin_info)
