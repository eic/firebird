# test_edm4hep.py

import math
import os

import uproot

from pyrobird.dex import validate_dex
from pyrobird.edm4hep import (
    detect_file_type,
    edm4hep_entry_to_dict,
    edm4hep_to_dex_dict,
    get_sim_hit_branches,
    sim_hits_to_trajectories,
    sim_tracker_hits_to_box_hits,
    DEFAULT_HIT_BOX_SIZE,
    DEFAULT_TRAJECTORY_EXCLUDED_COLLECTIONS,
)

# Path to the test ROOT files
TEST_EDM4HEP_FILE = os.path.join(os.path.dirname(__file__), 'data', 'k_lambda_10x100_2evt.edm4hep.root')
TEST_EDM4EIC_FILE = os.path.join(os.path.dirname(__file__), 'data', 'reco_2024-09_craterlake_2evt.edm4eic.root')


def open_events_tree(path=TEST_EDM4HEP_FILE):
    return uproot.open(path)['events']


def test_detect_file_type():
    assert detect_file_type(open_events_tree(TEST_EDM4HEP_FILE)) == 'edm4hep'
    # eicrecon/edm4eic files also contain sim hits, reconstruction should win
    assert detect_file_type(open_events_tree(TEST_EDM4EIC_FILE)) == 'edm4eic'


def test_get_sim_hit_branches():
    tree = open_events_tree()
    branches = get_sim_hit_branches(tree)
    assert 'SiBarrelHits' in branches
    assert 'VertexBarrelHits' in branches
    assert 'DIRCBarHits' in branches
    assert 'MCParticles' not in branches


def test_sim_tracker_hits_to_box_hits():
    tree = open_events_tree()
    piece = sim_tracker_hits_to_box_hits(tree, 'SiBarrelHits', entry_start=0)

    assert piece['name'] == 'SiBarrelHits'
    assert piece['type'] == 'BoxHit'
    assert piece['origin']['type'] == 'edm4hep::SimTrackerHitData'
    assert piece['count'] > 0

    columns = piece['columns']
    assert len(columns['pos']) == 3 * piece['count']
    # Sim hits have no position error => fixed box size on every axis
    assert columns['dim'] == [DEFAULT_HIT_BOX_SIZE] * (3 * piece['count'])
    assert len(columns['time']) == piece['count']
    assert all(edep > 0 for edep in columns['edep'])
    # Sim data has no errors: the error columns are omitted, not zero-filled
    assert 'timeError' not in columns
    assert 'edepError' not in columns


def test_sim_tracker_hits_box_size_override():
    tree = open_events_tree()
    piece = sim_tracker_hits_to_box_hits(tree, 'SiBarrelHits', entry_start=0, box_size=5.0)
    assert piece['columns']['dim'][:3] == [5.0, 5.0, 5.0]


def test_sim_hits_to_trajectories():
    tree = open_events_tree()
    hit_branches = [b for b in get_sim_hit_branches(tree)
                    if b not in DEFAULT_TRAJECTORY_EXCLUDED_COLLECTIONS]
    piece = sim_hits_to_trajectories(tree, hit_branches, entry_start=0)

    assert piece['name'] == 'McHitTrajectories'
    assert piece['type'] == 'PointTrajectory'
    assert sorted(piece['columns'].keys()) == sorted(['pdg', 'charge', 'px', 'py', 'pz', 'p', 'mc_index'])
    assert piece['pointColumns'] == ['x', 'y', 'z', 't', 'dx', 'dy', 'dz', 'dt']
    assert piece['count'] > 0
    assert len(piece['points']) == piece['count']

    columns = piece['columns']
    for trajectory_i in range(piece['count']):
        points = piece['points'][trajectory_i]
        # min_hits=2 + prepended vertex point
        assert len(points) >= 3
        # |p| column matches momentum components (same index in every column)
        px, py, pz = columns['px'][trajectory_i], columns['py'][trajectory_i], columns['pz'][trajectory_i]
        assert math.isclose(columns['p'][trajectory_i], math.sqrt(px ** 2 + py ** 2 + pz ** 2), rel_tol=1e-9)
        # points are time-ordered and each has all point columns
        times = [point[3] for point in points]
        assert times == sorted(times)
        for point in points:
            assert len(point) == len(piece['pointColumns'])
            # sim data has no per-point errors
            assert point[4:] == [0, 0, 0, 0]

    # Event 0 of the sample: with Cherenkov collections excluded, exactly 4 particles
    # leave >=2 tracker hits: the scattered electron (2), K+ (3) and Lambda decay
    # products pi- (5) and proton (6)
    assert sorted(columns['mc_index']) == [2, 3, 5, 6]

    # The scattered electron: 9 tracker hits + 1 vertex point
    electron_i = columns['mc_index'].index(2)
    assert columns['pdg'][electron_i] == 11
    assert len(piece['points'][electron_i]) == 10


def test_sim_hits_to_trajectories_vertex_and_endpoint_options():
    tree = open_events_tree()
    hit_branches = [b for b in get_sim_hit_branches(tree)
                    if b not in DEFAULT_TRAJECTORY_EXCLUDED_COLLECTIONS]

    default = sim_hits_to_trajectories(tree, hit_branches, entry_start=0)
    no_vertex = sim_hits_to_trajectories(tree, hit_branches, entry_start=0, prepend_vertex=False)
    with_endpoint = sim_hits_to_trajectories(tree, hit_branches, entry_start=0, append_endpoint=True)

    for default_points, no_vertex_points, endpoint_points in zip(
            default['points'], no_vertex['points'], with_endpoint['points']):
        assert len(no_vertex_points) == len(default_points) - 1
        assert len(endpoint_points) == len(default_points) + 1
        # appended endpoint reuses the last hit time (edm4hep stores no endpoint time)
        assert endpoint_points[-1][3] == endpoint_points[-2][3]


def test_edm4hep_entry_to_dict():
    tree = open_events_tree()
    event = edm4hep_entry_to_dict(tree, entry_index=0)

    assert event['id'] == 0
    piece_names = [piece['name'] for piece in event['pieces']]

    # Hit pieces + one merged trajectory piece
    assert 'SiBarrelHits' in piece_names
    assert 'McHitTrajectories' in piece_names

    # Collections empty in this event are skipped
    for piece in event['pieces']:
        if piece['type'] == 'BoxHit':
            assert piece['count'] > 0

    # Cherenkov collections are excluded from trajectories but still present as hits
    assert 'DIRCBarHits' in piece_names
    trajectory_piece = next(p for p in event['pieces'] if p['name'] == 'McHitTrajectories')
    assert 'DIRCBarHits' not in trajectory_piece['origin']['collections']


def test_edm4hep_entry_to_dict_collections_filter():
    tree = open_events_tree()

    hits_only = edm4hep_entry_to_dict(tree, entry_index=0, collections=['tracker_hits'])
    assert all(piece['type'] == 'BoxHit' for piece in hits_only['pieces'])

    trajectories_only = edm4hep_entry_to_dict(tree, entry_index=0, collections=['mc_trajectories'])
    assert [piece['type'] for piece in trajectories_only['pieces']] == ['PointTrajectory']


def test_edm4hep_to_dex_dict():
    tree = open_events_tree()
    result = edm4hep_to_dex_dict(tree, [0, 1], origin_info={'file': 'test'})

    assert result['type'] == 'firebird-dex-json'
    assert result['version'] == '1.0'
    assert result['origin'] == {'file': 'test'}
    assert len(result['events']) == 2
    assert result['events'][0]['id'] == 0
    assert result['events'][1]['id'] == 1
    for event in result['events']:
        assert len(event['pieces']) > 0
    # raises on structural problems (column lengths, refs, ragged sizes)
    validate_dex(result)
