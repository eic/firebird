# Created by: Dmitry Romanov, 2024
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.

import json
import click
import logging
import math
from typing import Dict, Any, List

from pyrobird.dex_utils import load_dex_file

# Configure logging
logger = logging.getLogger(__name__)

# z-min, z-max, r (cylindrical coordinates)
cut_volumes = [
    [-5000, 5000, 5000],
    [-1000000, -5000, 1500],
    [5000, 1000000, 1500]
]

@click.command()
@click.option('-o', '--output', 'output_file', required=True, help='Output file name for the smoothed result')
@click.option('--step-time', 'step_time', type=float, default=0.2, help='Time step in nanoseconds for interpolation (default: 0.2)')
@click.argument('input_file', required=True)
def smooth(output_file, input_file, step_time):
    """
    Smooth trajectories in a Firebird DEX JSON file.

    This command processes trajectories in a Firebird DEX file and applies:
    1. Time-based sorting of trajectory points
    2. Cutting points outside detector volumes
    3. Time-based interpolation for smooth visualization

    Examples:
      - Smooth trajectories with default 0.2 ns time step:
          pyrobird smooth input.firebird.json -o smoothed.firebird.json

      - Smooth with custom time step:
          pyrobird smooth input.firebird.json -o smoothed.firebird.json --step-time 0.1
    """
    # Load the input DEX file
    dex_data = load_dex_file(input_file)

    # Apply smoothing algorithms
    logger.info("Applying trajectory smoothing...")
    smoothed_data = apply_smoothing(dex_data, step_time)

    # Process trajectories and print statistics
    #process_trajectories(smoothed_data)

    # Save the result
    try:
        with open(output_file, 'w') as f:
            json.dump(smoothed_data, f, indent=2)
        logger.info(f"Smoothed data saved to {output_file}")
    except Exception as e:
        raise click.FileError(output_file, f"Error saving smoothed data: {e}")


def apply_smoothing(dex_data: Dict[str, Any], step_time: float) -> Dict[str, Any]:
    """
    Apply smoothing to all trajectories in the DEX data.

    Parameters
    ----------
    dex_data : dict
        The loaded DEX data containing events and groups
    step_time : float
        Time step in nanoseconds for interpolation

    Returns
    -------
    dict
        Modified DEX data with smoothed trajectories
    """
    total_before = 0
    total_after = 0
    trajectories_processed = 0

    for event_id, group_name, trajectory in iterate_trajectories(dex_data):
        points = trajectory.get("points", [])
        original_count = len(points)
        total_before += original_count


        # Step 1: Sort points by time (time is at index 3) - ASCENDING order
        points.sort(key=lambda p: p[3] if len(p) > 3 else 0)

        # Step 2: Cut points outside volumes
        points = cut_points_outside_volumes(points)

        # Step 3: Add time-based interpolation
        points = add_time_interpolation(points, step_time)

        trajectory["points"] = points
        total_after += len(points)
        trajectories_processed += 1

        logger.debug(f"Trajectory {trajectories_processed}: {original_count} -> {len(points)} points")

    logger.info(f"Processed {trajectories_processed} trajectories")
    logger.info(f"Total points: {total_before} -> {total_after}")

    return dex_data


def iterate_trajectories(dex_data: Dict[str, Any]):
    """
    Generator that iterates through all trajectories in the DEX data.

    Parameters
    ----------
    dex_data : dict
        The loaded DEX data containing events and groups

    Yields
    ------
    tuple
        (event_id, group_name, trajectory) for each trajectory found
    """
    events = dex_data.get("events", [])

    for event_idx, event in enumerate(events):
        event_id = event.get("id", f"event_{event_idx}")
        groups = event.get("groups", [])

        for group in groups:
            group_name = group.get("name", "unnamed")
            group_type = group.get("type", "unknown")

            # Check if this is a trajectory group
            if group_type == "PointTrajectory":
                trajectories = group.get("trajectories", [])

                for trajectory in trajectories:
                    yield event_id, group_name, trajectory


def is_point_in_volumes(point: List[float], volumes: List[List[float]]) -> bool:
    """
    Check if a point is inside any of the cylindrical volumes.

    Parameters
    ----------
    point : list
        Point coordinates [x, y, z, t, ...]
    volumes : list
        List of volumes, each defined as [z_min, z_max, r_max]

    Returns
    -------
    bool
        True if point is inside at least one volume
    """
    if len(point) < 3:
        return False

    x, y, z = point[0], point[1], point[2]
    r = math.sqrt(x * x + y * y)

    for volume in volumes:
        z_min, z_max, r_max = volume
        if z_min <= z <= z_max and r <= r_max:
            return True

    return False


def cut_points_outside_volumes(points: List[List[float]]) -> List[List[float]]:
    """
    Remove points outside volumes and all subsequent points.
    As soon as a point is found outside all volumes, cut the trajectory there.

    Parameters
    ----------
    points : list
        List of trajectory points

    Returns
    -------
    list
        Truncated list of points (all inside volumes)
    """
    result = []

    for point in points:
        if not is_point_in_volumes(point, cut_volumes):
            # Stop at first point outside all volumes
            break
        result.append(point)

    return result


def add_time_interpolation(points: List[List[float]], step_time: float) -> List[List[float]]:
    """
    Add interpolated points when time gap between consecutive points exceeds 2*step_time.

    Parameters
    ----------
    points : list
        List of trajectory points [x, y, z, t, dx, dy, dz, dt]
    step_time : float
        Time step in nanoseconds

    Returns
    -------
    list
        List with interpolated points added

    Example
    -------
    If point1 has time 2.1 and point2 has time 2.45, with step_time=0.1:
    - Time difference = 0.35 ns
    - Since 0.35 > 2*0.1, add points at times: 2.2, 2.3, 2.4
    """
    if len(points) < 2:
        return points

    result = []

    for i in range(len(points) - 1):
        current = points[i]
        next_point = points[i + 1]

        # Add current point
        result.append(current)

        # Check if we have time information (at index 3)
        if len(current) < 4 or len(next_point) < 4:
            continue

        current_time = current[3]
        next_time = next_point[3]
        time_diff = next_time - current_time

        # If time gap is large enough, add interpolated points
        if time_diff > 2 * step_time:
            # Calculate times for interpolated points
            t = current_time + step_time

            while t < next_time:
                # Calculate interpolation factor (0 to 1)
                alpha = (t - current_time) / time_diff

                # Interpolate all coordinates
                interpolated = [
                    current[k] + alpha * (next_point[k] - current[k])
                    for k in range(len(current))
                ]

                # Set exact time value (to avoid floating point drift)
                interpolated[3] = t

                result.append(interpolated)
                t += step_time

    # Add the last point
    if points:
        result.append(points[-1])

    return result


def process_trajectories(dex_data: Dict[str, Any]) -> None:
    """
    Process all trajectories in the DEX data and print statistics.

    Parameters
    ----------
    dex_data : dict
        The loaded DEX data containing events and groups
    """
    total_trajectories = 0
    total_points = 0

    for traj_idx, (event_id, group_name, trajectory) in enumerate(iterate_trajectories(dex_data)):
        points = trajectory.get("points", [])
        num_points = len(points)

        total_trajectories += 1
        total_points += num_points

        logger.info(
            f"Event '{event_id}', Group '{group_name}', "
            f"Trajectory {traj_idx}: {num_points} points"
        )

    logger.info(f"\nTotal: {total_trajectories} trajectories with {total_points} points")
