# Created by: Dmitry Romanov, 2024
# This file is part of Firebird Event Display and is licensed under GPL-3.0-or-later.
# See the LICENSE file in the project root for full license information.

import click
import logging
import math
from typing import Dict, Any, List, NamedTuple, Optional

from pyrobird.dex import validate_dex
from pyrobird.dex_utils import load_dex_file, write_dex_json

# Configure logging
logger = logging.getLogger(__name__)

# z-min, z-max, r (cylindrical coordinates)
cut_volumes = [
    [-5000, 5000, 5000],
    [-1000000, -5000, 1500],
    [5000, 1000000, 1500]
]

# The most trajectory points smooth writes by default. A browser inflates the
# JSON into one string, which Chrome caps at 512 MiB; at about 86 bytes per
# point (measured on a smoothed beam background file) 5 M points are about
# 430 MB of JSON.
DEFAULT_MAX_POINTS = 5_000_000


class SmoothingTooLargeError(click.ClickException):
    """The smoothed output would hold more points than allowed."""


class PointLayout(NamedTuple):
    """Indexes of the x, y, z and t columns in a piece's point tuples; None when absent."""
    x: Optional[int]
    y: Optional[int]
    z: Optional[int]
    t: Optional[int]


def point_layout(piece: Dict[str, Any]) -> PointLayout:
    """Reads where x, y, z and t sit in the point tuples from the piece's pointColumns."""
    columns = piece.get("pointColumns") or []

    def index_of(name):
        return columns.index(name) if name in columns else None

    return PointLayout(index_of("x"), index_of("y"), index_of("z"), index_of("t"))


@click.command()
@click.option('-o', '--output', 'output_file', required=True, help='Output file name for the smoothed result')
@click.option('--step-time', 'step_time', type=float, default=0.2, help='Time step in nanoseconds for interpolation (default: 0.2)')
@click.option('--max-points', 'max_points', type=int, default=DEFAULT_MAX_POINTS,
              help=f'Most trajectory points the output may hold in total; a larger result is refused '
                   f'before it is built. 0 disables the check (default: {DEFAULT_MAX_POINTS}).')
@click.argument('input_file', required=True)
def smooth(output_file, input_file, step_time, max_points):
    """
    Smooth trajectories in a Firebird DEX JSON file.

    This command processes trajectories in a Firebird DEX file and applies:
    1. Time-based sorting of trajectory points
    2. Cutting points outside detector volumes
    3. Time-based interpolation for smooth visualization

    The x, y, z and t point columns are found by name in each piece's
    pointColumns; a piece without t is cut but not sorted or interpolated.

    Input and output can be .json files or .zip archives holding one
    (an output name ending in .zip writes a zip-compressed result).

    Interpolation fills time gaps in steps of --step-time, so long gaps
    multiply the point count. When the result would exceed --max-points,
    the command stops before building it; raise --step-time or --max-points.

    Examples:
      - Smooth trajectories with default 0.2 ns time step:
          pyrobird smooth input.firebird.json -o smoothed.firebird.json

      - Smooth with custom time step:
          pyrobird smooth input.firebird.json -o smoothed.firebird.json --step-time 0.1

      - Smooth a zipped file into a zipped result:
          pyrobird smooth events.firebird.zip -o events_s.firebird.zip
    """
    # Load the input DEX file (.json or .zip)
    dex_data = load_dex_file(input_file)

    # Apply smoothing algorithms
    logger.info("Applying trajectory smoothing...")
    smoothed_data = apply_smoothing(dex_data, step_time, max_points or None)
    try:
        validate_dex(smoothed_data)
    except ValueError as e:
        raise click.ClickException(f"The smoothed result is not valid DEX, nothing was written. {e}")

    # Save the result
    try:
        write_dex_json(smoothed_data, output_file)
        logger.info(f"Smoothed data saved to {output_file}")
    except Exception as e:
        raise click.FileError(output_file, f"Error saving smoothed data: {e}")


def apply_smoothing(dex_data: Dict[str, Any], step_time: float,
                    max_points: Optional[int] = None) -> Dict[str, Any]:
    """
    Apply smoothing to all trajectories in the DEX data.

    Sorts and cuts every trajectory first and predicts the point count of
    the interpolation, so an oversized result is refused before any
    interpolated point is built. The input is changed only after the check.

    Parameters
    ----------
    dex_data : dict
        The loaded DEX data containing events and pieces
    step_time : float
        Time step in nanoseconds for interpolation
    max_points : int, optional
        Most points the smoothed trajectories may hold in total. None means
        no limit.

    Returns
    -------
    dict
        Modified DEX data with smoothed trajectories

    Raises
    ------
    SmoothingTooLargeError
        If the result would hold more than `max_points` points.
    """
    total_before = 0
    predicted_total = 0
    prepared = []

    for piece, trajectory_index, points in iterate_trajectories(dex_data):
        layout = point_layout(piece)
        total_before += len(points)

        # Step 1: Sort points by time - ASCENDING order
        if layout.t is not None:
            points = sorted(points, key=lambda p: p[layout.t])

        # Step 2: Cut points outside volumes
        points = cut_points_outside_volumes(points, layout)

        predicted_total += len(points) + count_interpolated_points(points, step_time, layout.t)
        prepared.append((piece, trajectory_index, points, layout))

    if max_points is not None and predicted_total > max_points:
        raise SmoothingTooLargeError(
            f"Smoothing would grow {total_before} trajectory points to about {predicted_total}, "
            f"more than --max-points={max_points}. Long time gaps multiply the points: "
            f"raise --step-time (now {step_time} ns), or raise --max-points if a browser can still load the result.")

    total_after = 0
    for trajectories_processed, (piece, trajectory_index, points, layout) in enumerate(prepared, start=1):
        original_count = len(piece["points"][trajectory_index])

        # Step 3: Add time-based interpolation
        if layout.t is not None:
            points = add_time_interpolation(points, step_time, layout.t)

        piece["points"][trajectory_index] = points
        total_after += len(points)

        logger.debug(f"Trajectory {trajectories_processed}: {original_count} -> {len(points)} points")

    logger.info(f"Processed {len(prepared)} trajectories")
    logger.info(f"Total points: {total_before} -> {total_after}")

    return dex_data


def iterate_trajectories(dex_data: Dict[str, Any]):
    """
    Generator that iterates through all trajectories in the DEX data.

    Parameters
    ----------
    dex_data : dict
        The loaded DEX data containing events and pieces

    Yields
    ------
    tuple
        (piece, trajectory_index, points) for each trajectory found; points is
        the point-tuple list of piece["points"][trajectory_index]
    """
    events = dex_data.get("events", [])

    for event in events:
        for piece in event.get("pieces", []):
            if piece.get("type") == "PointTrajectory":
                for trajectory_index, points in enumerate(piece.get("points", [])):
                    yield piece, trajectory_index, points


def is_point_in_volumes(point: List[float], volumes: List[List[float]], layout: PointLayout) -> bool:
    """
    Check if a point is inside any of the cylindrical volumes.

    Parameters
    ----------
    point : list
        One point tuple
    volumes : list
        List of volumes, each defined as [z_min, z_max, r_max]
    layout : PointLayout
        Where x, y and z sit in the tuple

    Returns
    -------
    bool
        True if point is inside at least one volume
    """
    x, y, z = point[layout.x], point[layout.y], point[layout.z]
    r = math.sqrt(x * x + y * y)

    for volume in volumes:
        z_min, z_max, r_max = volume
        if z_min <= z <= z_max and r <= r_max:
            return True

    return False


def cut_points_outside_volumes(points: List[List[float]], layout: PointLayout) -> List[List[float]]:
    """
    Remove points outside volumes and all subsequent points.
    As soon as a point is found outside all volumes, cut the trajectory there.
    A piece without x, y or z columns is returned unchanged.

    Parameters
    ----------
    points : list
        List of trajectory points
    layout : PointLayout
        Where x, y and z sit in the point tuples

    Returns
    -------
    list
        Truncated list of points (all inside volumes)
    """
    if None in (layout.x, layout.y, layout.z):
        return points

    result = []

    for point in points:
        if not is_point_in_volumes(point, cut_volumes, layout):
            # Stop at first point outside all volumes
            break
        result.append(point)

    return result


def count_interpolated_points(points: List[List[float]], step_time: float, time_index: Optional[int]) -> int:
    """
    Predicts how many points `add_time_interpolation` inserts, without building them.

    Each gap longer than 2*step_time gets one point per step strictly
    inside the gap. Floating point steps may differ from this count by one
    point per gap.
    """
    if time_index is None:
        return 0
    inserted = 0
    for current, next_point in zip(points, points[1:]):
        time_diff = next_point[time_index] - current[time_index]
        if time_diff > 2 * step_time:
            inserted += max(0, math.ceil(time_diff / step_time) - 1)
    return inserted


def add_time_interpolation(points: List[List[float]], step_time: float, time_index: int) -> List[List[float]]:
    """
    Add interpolated points when time gap between consecutive points exceeds 2*step_time.

    Parameters
    ----------
    points : list
        List of trajectory points, e.g. [x, y, z, t, dx, dy, dz, dt]
    step_time : float
        Time step in nanoseconds
    time_index : int
        Where t sits in the point tuples (the piece's pointColumns tell)

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

        current_time = current[time_index]
        next_time = next_point[time_index]
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
                interpolated[time_index] = t

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
        The loaded DEX data containing events and pieces
    """
    total_trajectories = 0
    total_points = 0

    for traj_idx, (piece, trajectory_index, points) in enumerate(iterate_trajectories(dex_data)):
        num_points = len(points)

        total_trajectories += 1
        total_points += num_points

        logger.debug(f"Piece '{piece.get('name')}', trajectory {trajectory_index}: {num_points} points")

    logger.info(f"\nTotal: {total_trajectories} trajectories with {total_points} points")
