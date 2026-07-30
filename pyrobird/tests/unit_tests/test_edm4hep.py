# test_edm4hep.py

import math
import os

import uproot

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
    group = sim_tracker_hits_to_box_hits(tree, 'SiBarrelHits', entry_start=0)

    assert group['name'] == 'SiBarrelHits'
    assert group['type'] == 'BoxHit'
    assert group['origin']['type'] == 'edm4hep::SimTrackerHitData'
    assert len(group['hits']) > 0

    for hit in group['hits']:
        assert len(hit['pos']) == 3
        assert all(isinstance(x, (float, int)) for x in hit['pos'])
        # Sim hits have no position error => fixed box size, zero t/ed errors
        assert hit['dim'] == [DEFAULT_HIT_BOX_SIZE] * 3
        assert len(hit['t']) == 2
        assert hit['t'][1] == 0
        assert len(hit['ed']) == 2
        assert hit['ed'][0] > 0
        assert hit['ed'][1] == 0


def test_sim_tracker_hits_box_size_override():
    tree = open_events_tree()
    group = sim_tracker_hits_to_box_hits(tree, 'SiBarrelHits', entry_start=0, box_size=5.0)
    assert group['hits'][0]['dim'] == [5.0, 5.0, 5.0]


def test_sim_hits_to_trajectories():
    tree = open_events_tree()
    hit_branches = [b for b in get_sim_hit_branches(tree)
                    if b not in DEFAULT_TRAJECTORY_EXCLUDED_COLLECTIONS]
    group = sim_hits_to_trajectories(tree, hit_branches, entry_start=0)

    assert group['name'] == 'McHitTrajectories'
    assert group['type'] == 'PointTrajectory'
    assert group['paramColumns'] == ['pdg', 'charge', 'px', 'py', 'pz', 'p', 'mc_index']
    assert group['pointColumns'] == ['x', 'y', 'z', 't', 'dx', 'dy', 'dz', 'dt']
    assert len(group['trajectories']) > 0

    mc_index_column = group['paramColumns'].index('mc_index')
    for trajectory in group['trajectories']:
        points = trajectory['points']
        params = trajectory['params']
        assert len(params) == len(group['paramColumns'])
        # min_hits=2 + prepended vertex point
        assert len(points) >= 3
        # |p| column matches momentum components
        pdg, charge, px, py, pz, p, mc_index = params
        assert math.isclose(p, math.sqrt(px ** 2 + py ** 2 + pz ** 2), rel_tol=1e-9)
        # points are time-ordered and each has all point columns
        times = [point[3] for point in points]
        assert times == sorted(times)
        for point in points:
            assert len(point) == len(group['pointColumns'])
            # sim data has no per-point errors
            assert point[4:] == [0, 0, 0, 0]

    # Event 0 of the sample: with Cherenkov collections excluded, exactly 4 particles
    # leave >=2 tracker hits: the scattered electron (2), K+ (3) and Lambda decay
    # products pi- (5) and proton (6)
    mc_indices = sorted(trajectory['params'][mc_index_column] for trajectory in group['trajectories'])
    assert mc_indices == [2, 3, 5, 6]

    # The scattered electron: 9 tracker hits + 1 vertex point
    electron = next(t for t in group['trajectories'] if t['params'][mc_index_column] == 2)
    assert electron['params'][0] == 11  # PDG
    assert len(electron['points']) == 10


def test_sim_hits_to_trajectories_vertex_and_endpoint_options():
    tree = open_events_tree()
    hit_branches = [b for b in get_sim_hit_branches(tree)
                    if b not in DEFAULT_TRAJECTORY_EXCLUDED_COLLECTIONS]

    default = sim_hits_to_trajectories(tree, hit_branches, entry_start=0)
    no_vertex = sim_hits_to_trajectories(tree, hit_branches, entry_start=0, prepend_vertex=False)
    with_endpoint = sim_hits_to_trajectories(tree, hit_branches, entry_start=0, append_endpoint=True)

    for default_traj, no_vertex_traj, endpoint_traj in zip(
            default['trajectories'], no_vertex['trajectories'], with_endpoint['trajectories']):
        assert len(no_vertex_traj['points']) == len(default_traj['points']) - 1
        assert len(endpoint_traj['points']) == len(default_traj['points']) + 1
        # appended endpoint reuses the last hit time (edm4hep stores no endpoint time)
        assert endpoint_traj['points'][-1][3] == endpoint_traj['points'][-2][3]


def test_edm4hep_entry_to_dict():
    tree = open_events_tree()
    event = edm4hep_entry_to_dict(tree, entry_index=0)

    assert event['id'] == 0
    group_names = [group['name'] for group in event['groups']]

    # Hit groups + one merged trajectory group
    assert 'SiBarrelHits' in group_names
    assert 'McHitTrajectories' in group_names

    # Collections empty in this event are skipped
    for group in event['groups']:
        if group['type'] == 'BoxHit':
            assert len(group['hits']) > 0

    # Cherenkov collections are excluded from trajectories but still present as hits
    assert 'DIRCBarHits' in group_names
    trajectory_group = next(g for g in event['groups'] if g['name'] == 'McHitTrajectories')
    assert 'DIRCBarHits' not in trajectory_group['origin']['collections']


def test_edm4hep_entry_to_dict_collections_filter():
    tree = open_events_tree()

    hits_only = edm4hep_entry_to_dict(tree, entry_index=0, collections=['tracker_hits'])
    assert all(group['type'] == 'BoxHit' for group in hits_only['groups'])

    trajectories_only = edm4hep_entry_to_dict(tree, entry_index=0, collections=['mc_trajectories'])
    assert [group['type'] for group in trajectories_only['groups']] == ['PointTrajectory']


def test_edm4hep_to_dex_dict():
    tree = open_events_tree()
    result = edm4hep_to_dex_dict(tree, [0, 1], origin_info={'file': 'test'})

    assert result['type'] == 'firebird-dex-json'
    assert result['version'] == '0.04'
    assert result['origin'] == {'file': 'test'}
    assert len(result['events']) == 2
    assert result['events'][0]['id'] == 0
    assert result['events'][1]['id'] == 1
    for event in result['events']:
        assert len(event['groups']) > 0
