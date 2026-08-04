# Created by: Dmitry Romanov, 2026
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.

"""
Firebird DEX format version 1.0: constants, the 0.04 upgrade, and structural
validation.

DEX v1 stores entity data in columns (parallel arrays, entity id equals array
index) instead of per-entity objects:

    {
      "type": "firebird-dex-json",
      "version": "1.0",
      "events": [{
        "id": "event_0",
        "pieces": [{
          "name": "BarrelHits", "type": "BoxHit", "version": "1.0",
          "count": 2,
          "columns": {
            "pos": [x0,y0,z0, x1,y1,z1],   // flat, 3 values per hit
            "dim": [...],                  // flat, 3 values per hit
            "time": [t0, t1],
            "edep": [e0, e1]
          }
        }]
      }]
    }

Rules the validator enforces (JSON Schema in dex-schema/ cannot express them):

- a scalar column holds exactly `count` values; a flattened fixed-width vector
  column holds a whole multiple of `count`
- `refs` name existing columns and target existing pieces; reference values
  are integer indexes into the target piece, -1 means "no reference"
- ragged payloads (PointTrajectory `points`) hold exactly `count` entries

A writer declares only the columns it has: simulation output has no
reconstruction columns and vice versa. Readers bind to declared columns.
"""

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

DEX_TYPE = "firebird-dex-json"
DEX_VERSION = "1.0"
PIECE_VERSION = "1.0"


def make_dex(events: List[Dict[str, Any]], origin: Optional[Any] = None) -> Dict[str, Any]:
    """Wraps a list of event dicts into a complete DEX v1 document."""
    return {
        "type": DEX_TYPE,
        "version": DEX_VERSION,
        "origin": origin,
        "events": events,
    }


# ---------------------------------------------------------------------------
# 0.04 -> 1.0 upgrade
# ---------------------------------------------------------------------------

class UnknownPieceTypeError(ValueError):
    """Raised when a 0.04 file contains group types the upgrade cannot convert."""

    def __init__(self, type_names):
        self.type_names = sorted(set(type_names))
        super().__init__(
            f"Cannot upgrade unknown group type(s): {', '.join(self.type_names)}. "
            f"Known types: BoxHit, PointTrajectory, TrackerLinePointTrajectory. "
            f"Convert these groups by hand or drop them with --skip-unknown.")


def _upgrade_box_hit_group(group: Dict[str, Any]) -> Dict[str, Any]:
    """0.04 BoxHit: hits[{pos, dim, t: [t, terr], ed: [e, eerr]}] -> columns."""
    pos, dim, time, time_error, edep, edep_error = [], [], [], [], [], []
    hits = group.get("hits", [])
    for hit in hits:
        pos.extend(hit["pos"])
        dim.extend(hit["dim"])
        t = hit.get("t", [0, 0])
        ed = hit.get("ed", [0, 0])
        time.append(t[0])
        time_error.append(t[1] if len(t) > 1 else 0)
        edep.append(ed[0])
        edep_error.append(ed[1] if len(ed) > 1 else 0)

    piece = {
        "name": group["name"],
        "type": "BoxHit",
        "version": PIECE_VERSION,
        "count": len(hits),
        "columns": {
            "pos": pos,
            "dim": dim,
            "time": time,
            "timeError": time_error,
            "edep": edep,
            "edepError": edep_error,
        },
    }
    if group.get("origin") is not None:
        piece["origin"] = group["origin"]
    return piece


def _upgrade_trajectory_group(group: Dict[str, Any]) -> Dict[str, Any]:
    """0.04 PointTrajectory (or the older TrackerLinePointTrajectory):
    paramColumns + trajectories[{points, params}] -> per-name param columns +
    ragged points. Params and points of one entity share the same index."""
    param_names = group.get("paramColumns", [])
    # The older TrackerLinePointTrajectory kept entities under "lines"
    entities = group.get("trajectories", group.get("lines", []))

    columns: Dict[str, List[Any]] = {name: [] for name in param_names}
    points = []
    for entity in entities:
        params = entity.get("params", [])
        for param_i, name in enumerate(param_names):
            columns[name].append(params[param_i] if param_i < len(params) else None)
        points.append(entity.get("points", []))

    piece = {
        "name": group["name"],
        "type": "PointTrajectory",
        "version": PIECE_VERSION,
        "count": len(entities),
        "columns": columns,
        "pointColumns": group.get("pointColumns", []),
        "points": points,
    }
    if group.get("origin") is not None:
        piece["origin"] = group["origin"]
    return piece


_GROUP_UPGRADERS = {
    "BoxHit": _upgrade_box_hit_group,
    "PointTrajectory": _upgrade_trajectory_group,
    "TrackerLinePointTrajectory": _upgrade_trajectory_group,
}


def upgrade_dex(dex_data: Dict[str, Any], skip_unknown: bool = False) -> Dict[str, Any]:
    """
    Converts a DEX 0.04 document to version 1.0.

    Parameters
    ----------
    dex_data : dict
        Parsed 0.04 document (top-level dict with "events", each event with "groups").
    skip_unknown : bool
        Drop groups with types the upgrade does not know (with a warning)
        instead of raising UnknownPieceTypeError.

    Returns
    -------
    dict
        A new DEX v1 document. The input is not modified.
    """
    version = str(dex_data.get("version", ""))
    if version == DEX_VERSION:
        logger.info("File is already DEX %s, nothing to upgrade", DEX_VERSION)
        return dex_data

    unknown_types = []
    for event in dex_data.get("events", []):
        for group in event.get("groups", []):
            if group.get("type") not in _GROUP_UPGRADERS:
                unknown_types.append(str(group.get("type")))
    if unknown_types and not skip_unknown:
        raise UnknownPieceTypeError(unknown_types)

    events = []
    for event in dex_data.get("events", []):
        pieces = []
        for group in event.get("groups", []):
            upgrader = _GROUP_UPGRADERS.get(group.get("type"))
            if upgrader is None:
                logger.warning("Dropping group '%s' of unknown type '%s'",
                               group.get("name"), group.get("type"))
                continue
            pieces.append(upgrader(group))
        events.append({"id": event.get("id"), "pieces": pieces})

    origin = dex_data.get("origin")
    return make_dex(events, origin)


# ---------------------------------------------------------------------------
# Structural validation
# ---------------------------------------------------------------------------

def validate_dex(dex_data: Dict[str, Any]) -> None:
    """
    Validates a DEX v1 document structurally. Raises ValueError listing every
    problem found; returns None when the document is valid.

    Checks all base rules plus known piece types (BoxHit column layout,
    PointTrajectory points/pointColumns). Unknown piece types are checked
    against the base piece rules only.
    """
    problems = collect_dex_problems(dex_data)
    if problems:
        raise ValueError("Not a valid DEX 1.0 document:\n  - " + "\n  - ".join(problems))


def collect_dex_problems(dex_data: Dict[str, Any]) -> List[str]:
    """Returns a list of problem descriptions; empty list means valid."""
    problems: List[str] = []

    if not isinstance(dex_data, dict):
        return ["top level is not an object"]
    if dex_data.get("type") != DEX_TYPE:
        problems.append(f'top-level "type" must be "{DEX_TYPE}", got {dex_data.get("type")!r}')
    if str(dex_data.get("version", "")) != DEX_VERSION:
        problems.append(f'top-level "version" must be "{DEX_VERSION}", got {dex_data.get("version")!r}')
    events = dex_data.get("events")
    if not isinstance(events, list):
        problems.append('"events" must be a list')
        return problems

    for event_i, event in enumerate(events):
        where = f"events[{event_i}]"
        if not isinstance(event, dict):
            problems.append(f"{where} is not an object")
            continue
        if "id" not in event:
            problems.append(f'{where} has no "id"')
        pieces = event.get("pieces")
        if not isinstance(pieces, list):
            problems.append(f'{where} has no "pieces" list')
            continue

        piece_counts = {p.get("name"): p.get("count") for p in pieces if isinstance(p, dict)}

        for piece_i, piece in enumerate(pieces):
            pwhere = f"{where}.pieces[{piece_i}]"
            if not isinstance(piece, dict):
                problems.append(f"{pwhere} is not an object")
                continue
            name = piece.get("name")
            pwhere = f"{pwhere} ('{name}')" if name else pwhere

            for field in ("name", "type", "version"):
                if not isinstance(piece.get(field), str):
                    problems.append(f'{pwhere}: "{field}" must be a string')
            count = piece.get("count")
            if not isinstance(count, int) or count < 0:
                problems.append(f'{pwhere}: "count" must be a non-negative integer')
                continue
            columns = piece.get("columns")
            if not isinstance(columns, dict):
                problems.append(f'{pwhere}: "columns" must be an object')
                continue

            for col_name, col in columns.items():
                if not isinstance(col, list):
                    problems.append(f'{pwhere}: column "{col_name}" is not an array')
                    continue
                if count == 0:
                    if len(col) != 0:
                        problems.append(f'{pwhere}: column "{col_name}" has {len(col)} values but count is 0')
                elif len(col) % count != 0:
                    problems.append(f'{pwhere}: column "{col_name}" has {len(col)} values, '
                                    f'not a multiple of count={count}')

            refs = piece.get("refs", {})
            if refs and not isinstance(refs, dict):
                problems.append(f'{pwhere}: "refs" must be an object')
                refs = {}
            for col_name, target in refs.items():
                if col_name not in columns:
                    problems.append(f'{pwhere}: refs declares "{col_name}" but there is no such column')
                    continue
                if target not in piece_counts:
                    problems.append(f'{pwhere}: refs["{col_name}"] targets piece "{target}" '
                                    f'which does not exist in this event')
                    continue
                target_count = piece_counts[target]
                for value_i, value in enumerate(columns[col_name]):
                    if not isinstance(value, int) or value < -1 or (
                            isinstance(target_count, int) and value >= target_count):
                        problems.append(f'{pwhere}: refs column "{col_name}"[{value_i}]={value!r} is not a '
                                        f'valid index into "{target}" (count={target_count})')
                        break

            piece_type = piece.get("type")
            if piece_type == "BoxHit":
                _check_box_hit(piece, pwhere, problems)
            elif piece_type == "PointTrajectory":
                _check_point_trajectory(piece, pwhere, problems)

    return problems


def _check_box_hit(piece, pwhere, problems):
    count = piece["count"]
    columns = piece["columns"]
    for required in ("pos", "dim"):
        col = columns.get(required)
        if col is None:
            problems.append(f'{pwhere}: BoxHit requires column "{required}"')
        elif len(col) != 3 * count:
            problems.append(f'{pwhere}: BoxHit column "{required}" must hold 3*count={3 * count} '
                            f'values, has {len(col)}')
    for scalar in ("time", "timeError", "edep", "edepError"):
        col = columns.get(scalar)
        if col is not None and len(col) != count:
            problems.append(f'{pwhere}: BoxHit column "{scalar}" must hold count={count} '
                            f'values, has {len(col)}')


def _check_point_trajectory(piece, pwhere, problems):
    count = piece["count"]
    point_columns = piece.get("pointColumns")
    if not isinstance(point_columns, list) or not all(isinstance(c, str) for c in point_columns):
        problems.append(f'{pwhere}: PointTrajectory requires "pointColumns" (list of strings)')
        point_columns = None
    points = piece.get("points")
    if not isinstance(points, list):
        problems.append(f'{pwhere}: PointTrajectory requires "points" (one point list per entity)')
        return
    if len(points) != count:
        problems.append(f'{pwhere}: "points" has {len(points)} entries but count={count}')
    tuple_len = len(point_columns) if point_columns else None
    for entity_i, entity_points in enumerate(points):
        if not isinstance(entity_points, list):
            problems.append(f'{pwhere}: points[{entity_i}] is not a list')
            break
        for point in entity_points:
            if not isinstance(point, list) or (tuple_len is not None and len(point) != tuple_len):
                problems.append(f'{pwhere}: points[{entity_i}] holds a point tuple of length '
                                f'{len(point) if isinstance(point, list) else "?"}, '
                                f'expected {tuple_len} (per pointColumns)')
                break
        else:
            continue
        break

    # per-entity scalar columns must be exactly count long (no vector params)
    for col_name, col in piece["columns"].items():
        if isinstance(col, list) and len(col) != count:
            problems.append(f'{pwhere}: PointTrajectory column "{col_name}" must hold '
                            f'count={count} values, has {len(col)}')
