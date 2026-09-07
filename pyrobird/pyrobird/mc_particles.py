# Created by: Dmitry Romanov, 2026
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.

"""
Converts the MCParticles collection (vector<edm4hep::MCParticleData>) to a
Firebird DEX 'PointTrajectory' piece.

Both EDM4hep (ddsim) and EDM4eic (eicrecon) files carry this collection, so the
same conversion serves both models. Every particle becomes one straight line
from its vertex to its endpoint - no filtering, trajectory id equals the
MCParticle index. The line is subdivided on a fixed time grid so the event
display time animation reveals it gradually instead of popping it in whole.

EDM4hep stores no endpoint time; the flight duration is computed from the
relativistic speed beta = p/E with E = sqrt(p^2 + m^2), which is exact for the
straight-line (no field, no energy loss) picture this piece draws.

IMPORTANT: `@firebird/root2dex` (mc-particles.ts) mirrors this module value for
value - the browser conversion must produce the same DEX document. Keep the
arithmetic expression-for-expression identical when changing either side.
"""

import logging
import math

from pyrobird.dex import PIECE_VERSION

logger = logging.getLogger(__name__)

# Time step [ns] of the interpolation grid; matches the `pyrobird smooth` default
DEFAULT_MC_STEP_TIME = 0.2

# Size guard: a particle flying far (a neutrino crossing the world volume) gets
# its grid coarsened so one line never exceeds this many points
DEFAULT_MC_MAX_POINTS = 128

# Speed of light [mm/ns]
C_LIGHT = 299.792458


def interpolate_line_points(vx, vy, vz, ex, ey, ez, start_time, beta,
                            step_time=DEFAULT_MC_STEP_TIME, max_points=DEFAULT_MC_MAX_POINTS):
    """
    Subdivides the straight line vertex->endpoint on a fixed time grid.

    Returns a list of [x, y, z, t] points: the vertex at `start_time`, interior
    points every `step_time` ns of flight, and the endpoint at the arrival time.
    A particle that cannot move (beta <= 0) or does not move (zero distance)
    yields the two end points with equal times.

    `max_points` bounds the list; when the flight needs more grid steps, the
    step widens to duration / (n + 1) so the subdivision stays uniform.
    """
    dx = ex - vx
    dy = ey - vy
    dz = ez - vz
    dist = math.sqrt(dx * dx + dy * dy + dz * dz)
    duration = dist / (beta * C_LIGHT) if beta > 0 else 0.0

    points = [[vx, vy, vz, start_time]]
    if duration > 0:
        n_mid = max(0, math.ceil(duration / step_time) - 1)
        if n_mid > max_points - 2:
            n_mid = max_points - 2
        step = duration / (n_mid + 1)
        for k in range(1, n_mid + 1):
            t_off = k * step
            alpha = t_off / duration
            points.append([vx + alpha * dx, vy + alpha * dy, vz + alpha * dz, start_time + t_off])
    points.append([ex, ey, ez, start_time + duration])
    return points


def mc_particles_to_trajectories(tree, entry_start, entry_stop=None,
                                 mc_branch="MCParticles",
                                 step_time=DEFAULT_MC_STEP_TIME,
                                 max_points=DEFAULT_MC_MAX_POINTS):
    """
    Converts the MCParticles collection of one entry to a PointTrajectory piece.

    Every particle is one straight line vertex->endpoint (trajectory id equals
    the MCParticle index), subdivided on a fixed `step_time` grid - see the
    module docstring. Returns a count-0 piece when `mc_branch` is absent.
    """
    import awkward as ak

    if entry_stop is None:
        entry_stop = entry_start + 1

    piece = {
        "name": mc_branch,
        "type": "PointTrajectory",
        "version": PIECE_VERSION,
        "origin": {"type": "edm4hep::MCParticleData", "name": mc_branch},
        "count": 0,
        "columns": {},
        "pointColumns": ["x", "y", "z", "t"],
        "points": [],
    }

    if mc_branch not in tree.keys(recursive=False):
        logger.warning(f"'{mc_branch}' collection not found, no MC particle lines are built")
        return piece

    def field(name):
        full_branch = f"{mc_branch}/{mc_branch}.{name}"
        return ak.flatten(tree[full_branch].array(entry_start=entry_start, entry_stop=entry_stop)).to_list()

    pdg = field("PDG")
    gen_status = field("generatorStatus")
    charge = field("charge")
    time = field("time")
    mass = field("mass")
    vtx_x, vtx_y, vtx_z = field("vertex.x"), field("vertex.y"), field("vertex.z")
    end_x, end_y, end_z = field("endpoint.x"), field("endpoint.y"), field("endpoint.z")
    mom_x, mom_y, mom_z = field("momentum.x"), field("momentum.y"), field("momentum.z")

    count = len(pdg)
    momentum = []
    all_points = []
    for i in range(count):
        p = math.sqrt(mom_x[i] * mom_x[i] + mom_y[i] * mom_y[i] + mom_z[i] * mom_z[i])
        energy = math.sqrt(p * p + mass[i] * mass[i])
        beta = p / energy if energy > 0 else 0.0
        momentum.append(p)
        all_points.append(interpolate_line_points(
            vtx_x[i], vtx_y[i], vtx_z[i], end_x[i], end_y[i], end_z[i],
            time[i], beta, step_time=step_time, max_points=max_points))

    piece["count"] = count
    piece["points"] = all_points
    if count:
        piece["columns"] = {
            "pdg": pdg,
            "charge": charge,
            "gen_status": gen_status,
            "px": mom_x,
            "py": mom_y,
            "pz": mom_z,
            "p": momentum,
            "mass": mass,
        }
    return piece
