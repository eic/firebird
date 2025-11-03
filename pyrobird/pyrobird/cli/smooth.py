# Created by: Dmitry Romanov, 2024
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.

import json
import click
import logging
from typing import Dict, Any, List

from pyrobird.dex_utils import load_dex_file

# Configure logging
logger = logging.getLogger(__name__)

# z-min, z-max, r
cut_volumes = [
    [-5000, 5000, 5000],
    [-1000000, -5000, 2000],
    [5000, 1000000, 2000]
]


@click.command()
@click.option('-o', '--output', 'output_file', required=True, help='Output file name for the smoothed result')
@click.argument('input_file', required=True)
def smooth(output_file, input_file):
    """
    Smooth trajectories in a Firebird DEX JSON file.

    This command processes trajectories in a Firebird DEX file and applies smoothing
    algorithms to improve visual quality.

    Examples:
      - Smooth trajectories in a file:
          pyrobird smooth input.firebird.json -o smoothed.firebird.json

      - Process simulation output:
          pyrobird smooth simulation.firebird.json -o smooth_sim.firebird.json
    """
    # Load the input DEX file
    dex_data = load_dex_file(input_file)


    # TODO: Apply smoothing algorithms here
    # For now, just copy the data
    smoothed_data = dex_data.copy()

    # Process trajectories and print statistics
    process_trajectories(smoothed_data)

    # Save the result
    try:
        with open(output_file, 'w') as f:
            json.dump(smoothed_data, f, indent=2)
        logger.info(f"Smoothed data saved to {output_file}")
    except Exception as e:
        raise click.FileError(output_file, f"Error saving smoothed data: {e}")


def process_trajectories(dex_data: Dict[str, Any]) -> None:
    """
    Process all trajectories in the DEX data and print statistics.

    Parameters
    ----------
    dex_data : dict
        The loaded DEX data containing events and groups
    """
    events = dex_data.get("events", [])

    total_trajectories = 0
    total_points = 0

    for event_idx, event in enumerate(events):
        event_id = event.get("id", f"event_{event_idx}")
        groups = event.get("groups", [])

        for group in groups:
            group_name = group.get("name", "unnamed")
            group_type = group.get("type", "unknown")

            # Check if this is a trajectory group
            if "PointTrajectory" == group_type:
                # Handle both "trajectories" and "lines" keys (different naming conventions)
                trajectories = group["trajectories"]

                for traj_idx, trajectory in enumerate(trajectories):
                    points = trajectory.get("points", [])
                    num_points = len(points)

                    total_trajectories += 1
                    total_points += num_points

                    logger.info(
                        f"Event '{event_id}', Group '{group_name}', "
                        f"Trajectory {traj_idx}: {num_points} points"
                    )

    logger.info(f"\nTotal: {total_trajectories} trajectories with {total_points} points")


def remove_points_template(trajectory: Dict[str, Any], keep_every_n: int = 2) -> Dict[str, Any]:
    """
    Template function: Remove points from a trajectory to reduce density.

    Parameters
    ----------
    trajectory : dict
        A trajectory object with 'points' array
    keep_every_n : int
        Keep every Nth point (e.g., 2 means keep every other point)

    Returns
    -------
    dict
        Modified trajectory with reduced points

    Example
    -------
    Original trajectory with 100 points:
        points: [[x1,y1,z1,t1,...], [x2,y2,z2,t2,...], ...]

    After keep_every_n=2:
        points: [[x1,y1,z1,t1,...], [x3,y3,z3,t3,...], [x5,y5,z5,t5,...], ...]

    Usage:
        for trajectory in group["trajectories"]:
            trajectory = remove_points_template(trajectory, keep_every_n=3)
    """
    points = trajectory.get("points", [])

    if len(points) <= 2:
        # Don't reduce if trajectory has very few points
        return trajectory

    # Keep first point, every Nth point, and last point
    reduced_points = [points[0]]  # Always keep first point

    for i in range(keep_every_n, len(points) - 1, keep_every_n):
        reduced_points.append(points[i])

    # Always keep last point if not already included
    if len(points) > 1 and (len(points) - 1) % keep_every_n != 0:
        reduced_points.append(points[-1])

    trajectory["points"] = reduced_points
    return trajectory


def add_interpolated_points_template(trajectory: Dict[str, Any], subdivisions: int = 1) -> Dict[str, Any]:
    """
    Template function: Add interpolated points between existing points for smoothing.

    Parameters
    ----------
    trajectory : dict
        A trajectory object with 'points' array
    subdivisions : int
        Number of points to add between each pair of existing points

    Returns
    -------
    dict
        Modified trajectory with additional interpolated points

    Example
    -------
    Original trajectory:
        points: [[0,0,0,0,...], [10,10,10,1,...]]

    After subdivisions=1 (add 1 point between each pair):
        points: [[0,0,0,0,...], [5,5,5,0.5,...], [10,10,10,1,...]]

    After subdivisions=2 (add 2 points between each pair):
        points: [[0,0,0,0,...], [3.33,3.33,3.33,0.33,...], [6.67,6.67,6.67,0.67,...], [10,10,10,1,...]]

    Usage:
        for trajectory in group["trajectories"]:
            trajectory = add_interpolated_points_template(trajectory, subdivisions=2)
    """
    points = trajectory.get("points", [])

    if len(points) < 2 or subdivisions < 1:
        return trajectory

    new_points = []

    for i in range(len(points) - 1):
        # Add the current point
        new_points.append(points[i])

        # Add interpolated points between current and next
        current = points[i]
        next_point = points[i + 1]

        for sub in range(1, subdivisions + 1):
            # Linear interpolation factor
            t = sub / (subdivisions + 1)

            # Interpolate each coordinate
            interpolated = [
                current[j] + t * (next_point[j] - current[j])
                for j in range(min(len(current), len(next_point)))
            ]

            new_points.append(interpolated)

    # Add the last point
    new_points.append(points[-1])

    trajectory["points"] = new_points
    return trajectory
