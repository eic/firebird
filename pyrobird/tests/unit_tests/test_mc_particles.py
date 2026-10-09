# test_mc_particles.py

import math
import os

import uproot

from pyrobird.dex import validate_dex
from pyrobird.edm4eic import edm4eic_to_dex_dict
from pyrobird.edm4hep import edm4hep_to_dex_dict
from pyrobird.mc_particles import (
    interpolate_line_points,
    mc_particles_to_trajectories,
    C_LIGHT,
    DEFAULT_MC_MAX_POINTS,
)

TEST_EDM4HEP_FILE = os.path.join(os.path.dirname(__file__), 'data', 'k_lambda_10x100_2evt.edm4hep.root')
TEST_EDM4EIC_FILE = os.path.join(os.path.dirname(__file__), 'data', 'reco_2024-09_craterlake_2evt.edm4eic.root')


def open_events_tree(path):
    return uproot.open(path)['events']


def test_interpolate_line_points_grid():
    # beta=1 over 3 x c_light mm takes 3 ns; step 1 ns => vertex + 2 interior + endpoint
    points = interpolate_line_points(0, 0, 0, 3 * C_LIGHT, 0, 0,
                                     start_time=10.0, beta=1.0, step_time=1.0)
    assert len(points) == 4
    assert points[0] == [0, 0, 0, 10.0]
    assert points[-1][0] == 3 * C_LIGHT
    assert math.isclose(points[-1][3], 13.0)
    # Interior points sit on the fixed grid with uniform spacing
    assert math.isclose(points[1][3], 11.0)
    assert math.isclose(points[2][3], 12.0)
    assert math.isclose(points[1][0], C_LIGHT)


def test_interpolate_line_points_max_points_cap():
    # A flight needing thousands of grid steps is coarsened, not truncated:
    # the endpoint stays exact and the subdivision stays uniform
    points = interpolate_line_points(0, 0, 0, 100000, 0, 0,
                                     start_time=0.0, beta=1.0, step_time=0.001, max_points=16)
    assert len(points) == 16
    assert points[-1][0] == 100000
    steps = [points[i + 1][3] - points[i][3] for i in range(len(points) - 1)]
    assert all(math.isclose(step, steps[0]) for step in steps)


def test_interpolate_line_points_at_rest():
    # No momentum => no motion; both end points carry the creation time
    points = interpolate_line_points(1, 2, 3, 1, 2, 3, start_time=5.0, beta=0.0)
    assert points == [[1, 2, 3, 5.0], [1, 2, 3, 5.0]]


def test_mc_particles_to_trajectories_edm4hep():
    tree = open_events_tree(TEST_EDM4HEP_FILE)
    piece = mc_particles_to_trajectories(tree, 0)

    assert piece['name'] == 'MCParticles'
    assert piece['type'] == 'PointTrajectory'
    assert piece['pointColumns'] == ['x', 'y', 'z', 't']
    # Every MCParticle becomes a line: count equals the collection size and
    # trajectory id equals the particle index
    mc_count = len(tree['MCParticles/MCParticles.PDG'].array(entry_start=0, entry_stop=1)[0])
    assert piece['count'] == mc_count
    assert len(piece['points']) == mc_count
    for column in ('pdg', 'charge', 'gen_status', 'px', 'py', 'pz', 'p', 'mass'):
        assert len(piece['columns'][column]) == mc_count

    for points in piece['points']:
        assert 2 <= len(points) <= DEFAULT_MC_MAX_POINTS
        times = [point[3] for point in points]
        assert times == sorted(times)


def test_mc_particles_to_trajectories_edm4eic():
    # eicrecon output carries the same MCParticles collection
    tree = open_events_tree(TEST_EDM4EIC_FILE)
    piece = mc_particles_to_trajectories(tree, 0)
    assert piece['count'] > 0
    assert piece['count'] == len(piece['points'])


def test_mc_particles_in_default_conversions():
    # Both model paths include the mc_particles group by default and the
    # documents stay structurally valid
    hep_dex = edm4hep_to_dex_dict(open_events_tree(TEST_EDM4HEP_FILE), 0)
    validate_dex(hep_dex)
    assert any(p['name'] == 'MCParticles' for p in hep_dex['events'][0]['pieces'])

    eic_dex = edm4eic_to_dex_dict(open_events_tree(TEST_EDM4EIC_FILE), 0)
    validate_dex(eic_dex)
    assert any(p['name'] == 'MCParticles' for p in eic_dex['events'][0]['pieces'])


def test_mc_particles_collections_filter():
    # Selecting only mc_particles yields exactly the one piece
    dex = edm4hep_to_dex_dict(open_events_tree(TEST_EDM4HEP_FILE), 0, collections=['mc_particles'])
    pieces = dex['events'][0]['pieces']
    assert len(pieces) == 1
    assert pieces[0]['name'] == 'MCParticles'

    # And leaving it out keeps it out
    dex = edm4eic_to_dex_dict(open_events_tree(TEST_EDM4EIC_FILE), 0, collections=['tracker_hits'])
    assert not any(p['name'] == 'MCParticles' for p in dex['events'][0]['pieces'])
