import uproot
from rich.pretty import pprint
import awkward as ak
import numpy as np
import json
import math

from pyrobird.dex import make_dex, PIECE_VERSION

"""
We have types: 
    vector<edm4hep::SimTrackerHitData> - dd4hep simulation data     
    vector<edm4eic::RawTrackerHitData> - digitization simulation hits with only cellID, adc, timeStamp
    vector<edm4eic::TrackerHitData> - hits with processed geometry that go to reconstruction
    
    Associations: 
        edm4hep::SimTrackerHitData => edm4hep::MCParticle
        SimTrackerHitData <=> RawTrackerHitData via vector<edm4eic::MCRecoTrackerHitAssociationData>
        edm4eic::TrackerHitData => edm4eic::RawTrackerHitData
    
    Example with TOFEndcap:
        'TOFEndcapHits': 'vector<edm4hep::SimTrackerHitData>',
    │   'TOFEndcapHits/TOFEndcapHits.cellID': 'uint64_t[]',
    │   'TOFEndcapHits/TOFEndcapHits.EDep': 'float[]',
    │   'TOFEndcapHits/TOFEndcapHits.time': 'float[]',
    │   'TOFEndcapHits/TOFEndcapHits.pathLength': 'float[]',
    │   'TOFEndcapHits/TOFEndcapHits.quality': 'int32_t[]',
    │   'TOFEndcapHits/TOFEndcapHits.position.x': 'double[]',
    │   'TOFEndcapHits/TOFEndcapHits.position.y': 'double[]',
    │   'TOFEndcapHits/TOFEndcapHits.position.z': 'double[]',
    │   'TOFEndcapHits/TOFEndcapHits.momentum.x': 'float[]',
    │   'TOFEndcapHits/TOFEndcapHits.momentum.y': 'float[]',
    │   'TOFEndcapHits/TOFEndcapHits.momentum.z': 'float[]',
    │   '_TOFEndcapHits_MCParticle': 'vector<podio::ObjectID>',
    │   '_TOFEndcapHits_MCParticle/_TOFEndcapHits_MCParticle.index': 'int32_t[]',
    │   '_TOFEndcapHits_MCParticle/_TOFEndcapHits_MCParticle.collectionID': 'uint32_t[]',
    │   'TOFEndcapRawHitAssociations': 'vector<edm4eic::MCRecoTrackerHitAssociationData>',
    │   'TOFEndcapRawHitAssociations/TOFEndcapRawHitAssociations.weight': 'float[]',
    │   '_TOFEndcapRawHitAssociations_rawHit': 'vector<podio::ObjectID>',
    │   '_TOFEndcapRawHitAssociations_rawHit/_TOFEndcapRawHitAssociations_rawHit.index': 'int32_t[]',
    │   '_TOFEndcapRawHitAssociations_rawHit/_TOFEndcapRawHitAssociations_rawHit.collectionID': 'uint32_t[]',
    │   '_TOFEndcapRawHitAssociations_simHit': 'vector<podio::ObjectID>',
    │   '_TOFEndcapRawHitAssociations_simHit/_TOFEndcapRawHitAssociations_simHit.index': 'int32_t[]',
    │   '_TOFEndcapRawHitAssociations_simHit/_TOFEndcapRawHitAssociations_simHit.collectionID': 'uint32_t[]',
    │   'TOFEndcapRawHits': 'vector<edm4eic::RawTrackerHitData>',
    │   'TOFEndcapRawHits/TOFEndcapRawHits.cellID': 'uint64_t[]',
    │   'TOFEndcapRawHits/TOFEndcapRawHits.charge': 'int32_t[]',
    │   'TOFEndcapRawHits/TOFEndcapRawHits.timeStamp': 'int32_t[]',
    │   'TOFEndcapRecHits': 'vector<edm4eic::TrackerHitData>',
    │   'TOFEndcapRecHits/TOFEndcapRecHits.cellID': 'uint64_t[]',
    │   'TOFEndcapRecHits/TOFEndcapRecHits.position.x': 'float[]',
    │   'TOFEndcapRecHits/TOFEndcapRecHits.position.y': 'float[]',
    │   'TOFEndcapRecHits/TOFEndcapRecHits.position.z': 'float[]',
    │   'TOFEndcapRecHits/TOFEndcapRecHits.positionError.xx': 'float[]',
    │   'TOFEndcapRecHits/TOFEndcapRecHits.positionError.yy': 'float[]',
    │   'TOFEndcapRecHits/TOFEndcapRecHits.positionError.zz': 'float[]',
    │   'TOFEndcapRecHits/TOFEndcapRecHits.time': 'float[]',
    │   'TOFEndcapRecHits/TOFEndcapRecHits.timeError': 'float[]',
    │   'TOFEndcapRecHits/TOFEndcapRecHits.edep': 'float[]',
    │   'TOFEndcapRecHits/TOFEndcapRecHits.edepError': 'float[]',
    │   '_TOFEndcapRecHits_rawHit': 'vector<podio::ObjectID>',
    │   '_TOFEndcapRecHits_rawHit/_TOFEndcapRecHits_rawHit.index': 'int32_t[]',
    │   '_TOFEndcapRecHits_rawHit/_TOFEndcapRecHits_rawHit.collectionID': 'uint32_t[]',
"""


def parse_entry_numbers(value):
    """
    Parses an input string representing entry numbers and returns a list of integers.

    The input can be:
    - A single integer, e.g., "3"
    - A range of integers separated by a hyphen, e.g., "1-5"
    - A comma-separated list of integers or ranges, e.g., "1,2-5,8"
    - A list, tuple, or set of integers

    Args:
        value (str, list, tuple, set): Input representing the entry numbers.

    Returns:
        List[int]: List of parsed integers.

    Raises:
        ValueError: If the input format is invalid or cannot be parsed into integers.
    """
    try:
        if isinstance(value, (list, tuple, set)):
            # Handle list, tuple, or set of integers directly
            return [int(item) for item in value]

        # Handle range, e.g., "1-5"
        if '-' in value and ',' not in value:
            start, end = map(int, value.split('-'))
            if start > end:
                raise ValueError(f"Invalid range '{value}': start must be <= end.")
            return list(range(start, end + 1))

        # Handle comma-separated list, e.g., "1,2,3" or "1,2-5,8"
        elif ',' in value:
            entries = []
            for entry in value.split(','):
                entry = entry.strip()
                if '-' in entry:
                    # Handle range inside comma-separated list
                    start, end = map(int, entry.split('-'))
                    if start > end:
                        raise ValueError(f"Invalid range '{entry}': start must be <= end.")
                    entries.extend(range(start, end + 1))
                else:
                    entries.append(int(entry))
            return entries

        # Handle single integer as string
        else:
            return [int(value)]

    except ValueError as ve:
        raise ValueError(f"Invalid entry format: '{value}'. Expected integers or ranges like '1-5'.")


def tracker_hits_to_box_hits(tree, branch_name, entry_start, entry_stop=None):
    """Converts vector<edm4eic::TrackerHitData> to BoxHit format dictionary"""

    # Read only 1 event if entry_stop is not given
    if entry_stop is None:
        entry_stop = entry_start + 1

    def get_field_array(field_branch):
        """Gets array of values of a field branch"""
        return ak.flatten(tree[field_branch].array(entry_start=entry_start, entry_stop=entry_stop)).tolist()

    # fields is a dict where:
    #  - keys are exact branch names of data field in root files
    #  - values are python types

    cell_id  = get_field_array(f'{branch_name}/{branch_name}.cellID')              # 'uint64_t[]',
    pos_x    = get_field_array(f'{branch_name}/{branch_name}.position.x')          # 'float[]',
    pos_y    = get_field_array(f'{branch_name}/{branch_name}.position.y')          # 'float[]',
    pos_z    = get_field_array(f'{branch_name}/{branch_name}.position.z')          # 'float[]',
    err_x    = get_field_array(f'{branch_name}/{branch_name}.positionError.xx')    # 'float[]',
    err_y    = get_field_array(f'{branch_name}/{branch_name}.positionError.yy')    # 'float[]',
    err_z    = get_field_array(f'{branch_name}/{branch_name}.positionError.zz')    # 'float[]',
    time     = get_field_array(f'{branch_name}/{branch_name}.time')                # 'float[]',
    err_time = get_field_array(f'{branch_name}/{branch_name}.timeError')           # 'float[]',
    edep     = get_field_array(f'{branch_name}/{branch_name}.edep')                # 'float[]',
    err_edep = get_field_array(f'{branch_name}/{branch_name}.edepError')           # 'float[]',

    # Columnar piece: parallel arrays, hit id == array index; pos/dim are flat xyz triplets
    pos, dim = [], []
    for i in range(len(cell_id)):
        # positionError.ii is a variance (sigma^2); box width is +- one sigma
        dim_x = 2 * math.sqrt(err_x[i]) if err_x[i] > 0 else 0.0
        dim_y = 2 * math.sqrt(err_y[i]) if err_y[i] > 0 else 0.0
        dim_z = 2 * math.sqrt(err_z[i]) if err_z[i] > 0 else 0.0
        pos.extend((pos_x[i], pos_y[i], pos_z[i]))
        dim.extend((dim_x, dim_y, dim_z))

    piece = {
        "name": branch_name,
        "type": "BoxHit",
        "version": PIECE_VERSION,
        "origin": {"type": "edm4eic::TrackerHitData", "name": branch_name},
        "count": len(cell_id),
        "columns": {
            "pos": pos,
            "dim": dim,
            "time": time,
            "timeError": err_time,
            "edep": edep,
            "edepError": err_edep,
        },
    }
    return piece

def track_segments_to_line_trajectories(tree, branch_name, entry_start, entry_stop=None):
    """
    Converts vector<edm4eic::TrackSegmentData> + the associated TrackPoints
    into a Firebird 'PointTrajectory' piece.

    Each segment => one 'line' with an array of points from points_begin..points_end.

    The code also optionally attempts to link to the main 'CentralCKFTracks' to find
    momentum, charge, etc. This logic can be adapted or extended as needed.
    """
    if entry_stop is None:
        entry_stop = entry_start + 1

    # Columnar piece: track parameters are per-name columns (trajectory id == index),
    # the ragged per-trajectory point lists stay nested under "points"
    result = {
        "name": branch_name,
        "type": "PointTrajectory",
        "version": PIECE_VERSION,
        "origin": ["edm4eic::TrackPoint", "edm4eic::TrackSegmentData"],
        "count": 0,
        "columns": {},
        "pointColumns": ["x", "y", "z", "t", "dx", "dy", "dz", "dt"],
        "points": []
    }
    # -- Grab the arrays for the main TrackSegmentData
    seg_points_begin_index   = ak.flatten(tree[f'{branch_name}/{branch_name}.points_begin'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
    seg_points_end_index     = ak.flatten(tree[f'{branch_name}/{branch_name}.points_end'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()

    # TODO selecting Tracks by track_objid_index  will not work because of https://github.com/eic/EICrecon/issues/1730
    # If the file also has a one-to-one relation to Track => read the objectIDs
    # (Many times stored in _CentralTrackSegments_track/*):
    track_objid_index = None
    track_objid_coll  = None
    # These are not guaranteed to exist; so we do a safe check
    objid_branch_base = f'_{"_".join(branch_name.split())}_track'  # e.g. _CentralTrackSegments_track
    if objid_branch_base in tree.keys():
        # inside that we typically have .index and .collectionID
        track_objid_index = ak.flatten(tree[f'{objid_branch_base}/{objid_branch_base}.index'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
        track_objid_coll = ak.flatten(tree[f'{objid_branch_base}/{objid_branch_base}.collectionID'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()

    # -- Now get the TrackPoints for "CentralTrackSegments.points"
    # Podio names the sub-collection something like "_CentralTrackSegments_points/..."
    # For safety, we search among keys that start with _<branch_name>_points'
    points_collection_name = f'_{branch_name}_points'
    if points_collection_name not in tree.keys():
        # Possibly the file organizes them differently, or there are no points
        # We return an empty dictionary if not found
        return result

    def get_points_field_array(field_suffix):
        """Helper to flatten points arrays from the sub-collection."""
        full_branch = f'{points_collection_name}/{points_collection_name}.{field_suffix}'
        return ak.flatten(tree[full_branch].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()

    # Grab the trackpoint fields
    p_x         = get_points_field_array("position.x")
    p_y         = get_points_field_array("position.y")
    p_z         = get_points_field_array("position.z")
    p_t         = get_points_field_array("time")
    p_terr      = get_points_field_array("timeError")
    p_exx       = get_points_field_array("positionError.xx")
    p_eyy       = get_points_field_array("positionError.yy")
    p_ezz       = get_points_field_array("positionError.zz")
    # If you want pathlength info, add it:
    # p_path      = get_points_field_array("pathlength")
    # p_patherr   = get_points_field_array("pathlengthError")

    # # TODO selecting Tracks by track_objid_index  will not work because of https://github.com/eic/EICrecon/issues/1730
    # -- Optionally load track collection to get momentum, charge, etc.
    #    We'll do a quick attempt for "CentralCKFTracks", but if that doesn't exist,
    #    we'll skip.
    params_branch = "CentralCKFTrackParameters"
    params_exists = (params_branch in tree.keys())

    # If present, read the relevant arrays for indexing
    if params_exists:
        trk_theta  = ak.flatten(tree[f'{params_branch}/{params_branch}.theta'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
        trk_phi    = ak.flatten(tree[f'{params_branch}/{params_branch}.phi'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
        trk_qoverp = ak.flatten(tree[f'{params_branch}/{params_branch}.qOverP'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
        trk_loc_a  = ak.flatten(tree[f'{params_branch}/{params_branch}.loc.a'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
        trk_loc_b  = ak.flatten(tree[f'{params_branch}/{params_branch}.loc.b'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
        trk_time   = ak.flatten(tree[f'{params_branch}/{params_branch}.time'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
    else:
        trk_theta  = []
        trk_phi    = []
        trk_qoverp = []
        trk_loc_a  = []
        trk_loc_b  = []
        trk_time   = []

    n_segments = len(seg_points_begin_index)

    if params_exists and n_segments != len(trk_theta):
        print(f"WARNING: len(CentralCKFParameters) != len({branch_name}). Might be a sign of format change or broken tree")

    all_points = []
    for seg_index in range(n_segments):
        segment_points = []
        for point_index in range(seg_points_begin_index[seg_index], seg_points_end_index[seg_index]):
            # In that snippet, p_exx[point_index] is assumed to be the 𝜎^2 in the x,y,z-coordinate of point’s position.
            # x2.0 represents “plus-or-minus one sigma” as the entire width in that direction.
            dx = 2.0 * np.sqrt(p_exx[point_index]) if p_exx[point_index] > 0 else 0.0
            dy = 2.0 * np.sqrt(p_eyy[point_index]) if p_eyy[point_index] > 0 else 0.0
            dz = 2.0 * np.sqrt(p_ezz[point_index]) if p_ezz[point_index] > 0 else 0.0
            dt = p_terr[point_index]
            # pointColumns => [x, y, z, t, dx, dy, dz, dt]
            point_val = [p_x[point_index], p_y[point_index], p_z[point_index], p_t[point_index], dx, dy, dz, dt]
            segment_points.append(point_val)
        all_points.append(segment_points)

    result["count"] = n_segments
    result["points"] = all_points
    if params_exists:
        # trajectory id == index in every column; a missing tail (parameter list
        # shorter than segments) is padded with None rather than dropped
        def column(values):
            return [values[i] if i < len(values) else None for i in range(n_segments)]
        result["columns"] = {
            "theta": column(trk_theta),
            "phi": column(trk_phi),
            "q_over_p": column(trk_qoverp),
            "loc_a": column(trk_loc_a),
            "loc_b": column(trk_loc_b),
            "time": column(trk_time),
        }
    return result


def edm4eic_entry_to_dict(tree, entry_index, custom_name=None, collections=None):
    # the result of this function
    components = []

    if not collections:
        collections = [
            "tracker_hits",
            "tracks"
        ]

    # Hits:
    if "tracker_hits" in collections:
        tracker_branches = tree.typenames(recursive=False, full_paths=True, filter_typename="vector<edm4eic::TrackerHitData>")
        # >oO debug: pprint(type())

        for branch_name in tracker_branches.keys():
            components.append(tracker_hits_to_box_hits(tree, branch_name, entry_index))

    # Tracks
    if "tracks" in collections:
        # TODO selecting all TrackSegmentData will not work because of https://github.com/eic/EICrecon/issues/1730
        # track_branches = tree.typenames(recursive=False, full_paths=True, filter_typename="vector<edm4eic::TrackSegmentData>")
        seg_collection = "CentralTrackSegments"
        if seg_collection in tree.keys():
            line_comp = track_segments_to_line_trajectories(tree, seg_collection, entry_index, entry_stop=entry_index+1)
            components.append(line_comp)

    entry = {
        "id": custom_name if custom_name else entry_index,
        "pieces": components
    }

    return entry


def edm4eic_to_dex_dict(tree, event_ids, origin_info=None, collections=None):
    event_data = []

    if isinstance(event_ids, int):
        event_ids = [event_ids]

    for entry_id in event_ids:
        event_data.append(edm4eic_entry_to_dict(tree, entry_id, custom_name=None, collections=collections))

    return make_dex(event_data, origin_info)
