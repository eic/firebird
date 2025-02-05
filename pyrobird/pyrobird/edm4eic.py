import uproot
from rich.pretty import pprint
import awkward as ak
import numpy as np
import json
import math

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
    """Converts vector<edm4eic::TrackerHitData> to HitBox format dictionary"""

    # Read only 1 event if entry_stop is not given
    if entry_stop is None:
        entry_stop = entry_start + 10

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

    hits = []
    for i in range(len(cell_id)):
        hit = {
            "pos": [pos_x[i], pos_y[i], pos_z[i]],
            "dim": [2 * err_x[i], 2 * err_y[i], 2 * err_z[i]],
            "t": [time[i], err_time[i]],
            "ed": [edep[i], err_edep[i]]
        }

        hits.append(hit)
        #hits.append([pos_x[i], pos_y[i], pos_z[i], 2 * err_x[i], 2 * err_y[i], 2 * err_z[i], time[i], err_time[i], edep[i], err_edep[i]])

    group = {
        "name": branch_name,
        "type": "BoxTrackerHit",
        "originType": "edm4eic::TrackerHitData",
        "hits": hits,
    }
    return group

def track_segments_to_line_trajectories(tree, branch_name, entry_start, entry_stop=None):
    """
    Converts vector<edm4eic::TrackSegmentData> + the associated TrackPoints
    into a Firebird 'TrackerLinePointTrajectory' component.

    Each segment => one 'line' with an array of points from points_begin..points_end.

    The code also optionally attempts to link to the main 'CentralCKFTracks' to find
    momentum, charge, etc. This logic can be adapted or extended as needed.
    """
    if entry_stop is None:
        entry_stop = entry_start + 1

    # -- Grab the arrays for the main TrackSegmentData
    seg_length  = ak.flatten(tree[f'{branch_name}/{branch_name}.length'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
    seg_lenerr  = ak.flatten(tree[f'{branch_name}/{branch_name}.lengthError'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
    seg_begin   = ak.flatten(tree[f'{branch_name}/{branch_name}.points_begin'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
    seg_end     = ak.flatten(tree[f'{branch_name}/{branch_name}.points_end'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()

    # If the file also has a one-to-one relation to Track => read the objectIDs
    # (Many times stored in _CentralTrackSegments_track/*):
    track_objid_index = None
    track_objid_coll  = None
    # These are not guaranteed to exist; so we do a safe check
    objid_branch_base = f'_{"_".join(branch_name.split())}_track'  # e.g. _CentralTrackSegments_track
    if objid_branch_base in tree.keys():
        # inside that we typically have .index and .collectionID
        track_objid_index = ak.flatten(
            tree[f'{objid_branch_base}/{objid_branch_base}.index'].array(
                entry_start=entry_start, entry_stop=entry_stop
            )
        ).to_list()
        track_objid_coll = ak.flatten(
            tree[f'{objid_branch_base}/{objid_branch_base}.collectionID'].array(
                entry_start=entry_start, entry_stop=entry_stop
            )
        ).to_list()

    # -- Now get the TrackPoints for "CentralTrackSegments.points"
    # Typically, Podio names the sub-collection something like "CentralTrackSegments_points"
    # and the relevant fields are "position.x", "time", "positionError.xx", etc.
    # If your file changes naming, you must adapt these patterns.

    # We guess the naming: "_CentralTrackSegments_points/..."
    # For safety, we search among keys that start with _<branch_name>_points'
    points_collection_name = f'_{branch_name}_points'
    if points_collection_name not in tree.keys():
        # Possibly the file organizes them differently, or there are no points
        # We return an empty dictionary if not found
        return {
            "name": branch_name,
            "type": "TrackerLinePointTrajectory",
            "originType": ["edm4eic::TrackPoint", "edm4eic::TrackSegmentData"],
            "paramColumns": ["px","py","pz","charge","phi","theta","qOverP","chi2","ndf"],
            "pointColumns": ["x","y","z","t","dx","dy","dz","dt"],
            "lines": []
        }

    def get_points_field_array(field_suffix):
        """Helper to flatten points arrays from the sub-collection."""
        full_branch = f'{points_collection_name}/{points_collection_name}.{field_suffix}'
        return ak.flatten(
            tree[full_branch].array(entry_start=entry_start, entry_stop=entry_stop)
        ).to_list()

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

    # -- Optionally load track collection to get momentum, charge, etc.
    #    We'll do a quick attempt for "CentralCKFTracks", but if that doesn't exist,
    #    we'll skip.
    ckf_branch = "CentralCKFTracks"
    ckf_exists = (ckf_branch in tree.keys())

    # If present, read the relevant arrays for indexing
    if ckf_exists:
        t_px    = ak.flatten(tree[f'{ckf_branch}/{ckf_branch}.momentum.x'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
        t_py    = ak.flatten(tree[f'{ckf_branch}/{ckf_branch}.momentum.y'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
        t_pz    = ak.flatten(tree[f'{ckf_branch}/{ckf_branch}.momentum.z'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
        t_charge= ak.flatten(tree[f'{ckf_branch}/{ckf_branch}.charge'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
        t_chi2  = ak.flatten(tree[f'{ckf_branch}/{ckf_branch}.chi2'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
        t_ndf   = ak.flatten(tree[f'{ckf_branch}/{ckf_branch}.ndf'].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()
    else:
        # fallback
        t_px = t_py = t_pz = t_charge = t_chi2 = t_ndf = []

    lines = []
    n_segments = len(seg_length)
    for i in range(n_segments):
        beg = seg_begin[i]
        end = seg_end[i]
        # gather the track points [beg..end)
        segment_points = []
        for j in range(beg, end):
            dx = 2.0 * np.sqrt(p_exx[j]) if p_exx[j] > 0 else 0.0
            dy = 2.0 * np.sqrt(p_eyy[j]) if p_eyy[j] > 0 else 0.0
            dz = 2.0 * np.sqrt(p_ezz[j]) if p_ezz[j] > 0 else 0.0
            dt = p_terr[j]
            # pointColumns => [x, y, z, t, dx, dy, dz, dt]
            point_val = [
                p_x[j],
                p_y[j],
                p_z[j],
                p_t[j],
                dx,
                dy,
                dz,
                dt
            ]
            segment_points.append(point_val)

        # Attempt to get track params from the track reference
        params_list = []
        if track_objid_index is not None and i < len(track_objid_index):
            trk_index = track_objid_index[i]
            # check if we can read from 'CentralCKFTracks'
            if ckf_exists and trk_index < len(t_px):
                px = t_px[trk_index]
                py = t_py[trk_index]
                pz = t_pz[trk_index]
                ch = t_charge[trk_index]
                # compute phi, theta, qOverP
                p_mag = math.sqrt(px*px + py*py + pz*pz) if pz == pz else 0
                if p_mag > 1e-12:
                    phi = math.atan2(py, px)
                    theta = math.acos(pz / p_mag)
                    q_over_p = ch / p_mag
                else:
                    phi = 0.0
                    theta = 0.0
                    q_over_p = 0.0
                chi2 = t_chi2[trk_index]
                ndf  = t_ndf[trk_index]
                params_list = [px, py, pz, ch, phi, theta, q_over_p, chi2, ndf]
            else:
                # No track info available
                params_list = []

        line = {
            "points": segment_points,
            "params": params_list
        }
        lines.append(line)

    comp_dict = {
        "name": branch_name,
        "type": "TrackerLinePointTrajectory",
        "originType": ["edm4eic::TrackPoint","edm4eic::TrackSegmentData"],
        # A recommended set of columns for 'params' and for 'points'
        "paramColumns": ["px","py","pz","charge","phi","theta","qOverP","chi2","ndf"],
        "pointColumns": ["x","y","z","t","dx","dy","dz","dt"],
        "lines": lines
    }
    return comp_dict

def edm4eic_entry_to_dict(tree, entry_index, custom_name=None):
    tracker_branches = tree.typenames(recursive=False, full_paths=True, filter_typename="vector<edm4eic::TrackerHitData>")
    # >oO debug: pprint(type())

    components = []
    for branch_name in tracker_branches.keys():
        components.append(tracker_hits_to_box_hits(tree, branch_name, entry_index))

    # 2) convert CentralTrackSegments => TrackerLinePointTrajectory, if present
    seg_collection = "CentralTrackSegments"
    if seg_collection in tree.keys():
        line_comp = track_segments_to_line_trajectories(tree, seg_collection, entry_index, entry_stop=entry_index+1)
        components.append(line_comp)

    entry = {
        "id": custom_name if custom_name else entry_index,
        "components": components
    }

    return entry


def edm4eic_to_dict(tree, entry_ids, origin_info=None):
    entries_data = []

    if isinstance(entry_ids, int):
        entry_ids = [entry_ids]

    for entry_id in entry_ids:
        entries_data.append(edm4eic_entry_to_dict(tree, entry_id, custom_name=None))

    result = {
        "version": "0.01",
        "origin": origin_info,
        "entries": entries_data
    }
    
    return result
