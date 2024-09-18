import uproot
from rich.pretty import pprint
import awkward as ak
import numpy as np
import json

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
        "type": "HitBox",
        "originType": "edm4eic::TrackerHitData",
        "hits": hits,
    }
    return group


def edm4eic_entry_to_dict(tree, entry_index, custom_name=None):
    tracker_branches = tree.typenames(recursive=False, full_paths=True, filter_typename="vector<edm4eic::TrackerHitData>")
    # >oO debug: pprint(type())

    components = []
    for branch_name in tracker_branches.keys():
        components.append(tracker_hits_to_box_hits(tree, branch_name, entry_index))

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
