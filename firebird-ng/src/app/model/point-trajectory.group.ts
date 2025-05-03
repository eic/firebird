/**
 * A data-model component for "PointTrajectory" typed data.
 *
 * This represents data in the Firebird Dex format:
 *
 *   {
 *     "name": "CentralTrackSegments",
 *     "type": "PointTrajectory",
 *     "origin": [...],
 *     "paramColumns": [...],
 *     "pointColumns": [...],
 *     "trajectories": [
 *       {
 *         "points": [ [x, y, z, t, dx, dy, dz, dt], ... ],
 *         "params": [ ... ]
 *       },
 *       ...
 *     ]
 *   }
 *
 * For example, each trajectory may correspond to one track segment,
 * and "points" is an array of arrays containing position/time/uncertainties.
 */

import {
  EventGroup,
  EventGroupFactory,
  registerEventGroupFactory
} from "./event-group";

/**
 * Representation of a single line in the trajectory.
 */
export interface PointTrajectory {
  /**
   * Array of points, each point is a numeric array matching the "pointColumns"
   * e.g. [ x, y, z, t, dx, dy, dz, dt ] or however many columns.
   */
  points: number[][];
  /**
   * Array of track parameters matching "paramColumns"
   * e.g. [theta, phi, qOverP, pdg, etc...]
   */
  params: number[];
}

/**
 * The main component class that holds multiple lines (track segments)
 * along with the definitions of paramColumns and pointColumns.
 */
export class PointTrajectoryGroup extends EventGroup {
  static type = "PointTrajectory";

  /**
   * The param columns define the meaning of the `params` array in each line.
   * Example: ["theta","phi","qOverP","charge","pdg"]
   */
  paramColumns: string[] = [];

  /**
   * The point columns define the meaning of the each entry in `points`.
   * Example: ["x","y","z","t","dx","dy","dz","dt"]
   */
  pointColumns: string[] = [];

  /**
   * Trajectory that is built connecting points
   */
  trajectories: PointTrajectory[] = [];

  constructor(name: string, origin?: string) {
    super(name, PointTrajectoryGroup.type, origin);
  }

  /** calculate time range */
  /** calculate time range */
  override get timeRange(): [number, number] | null {
    // Check if there are any lines
    if (this.trajectories.length === 0) return null;

    // Find the index of time column
    const timeIndex = this.pointColumns.indexOf("t");

    // If time column doesn't exist, return null
    if (timeIndex === -1) return null;

    // Check if there are any points in any line
    let hasPoints = false;
    for (const line of this.trajectories) {
      if (line.points.length > 0) {
        hasPoints = true;
        break;
      }
    }
    if (!hasPoints) return null;

    // Initialize min and max times as null
    let minTime: number | null = null;
    let maxTime: number | null = null;

    // Loop through all lines and points
    for (const line of this.trajectories) {
      for (const point of line.points) {
        const time = point[timeIndex];

        // Skip if time is null
        if (time == null) continue;

        // Initialize min/max if not initialized yet
        if (minTime === null) minTime = time;
        if (maxTime === null) maxTime = time;

        // Update min/max
        if (time < minTime) minTime = time;
        if (time > maxTime) maxTime = time;
      }
    }

    // Return range if both min and max are not null
    if (minTime !== null && maxTime !== null) {
      return [minTime, maxTime];
    }

    return null;
  }

  /**
   * Convert this component to a Dex-format JS object
   */
  override toDexObject(): any {
    // Serialize lines
    const trajectoriesObj = this.trajectories.map((trajectory) => {
      return {
        points: trajectory.points,
        params: trajectory.params
      };
    });

    return {
      name: this.name,
      type: this.type,
      origin: this.origin,
      paramColumns: this.paramColumns,
      pointColumns: this.pointColumns,
      trajectories: trajectoriesObj
    };
  }
}

/**
 * Factory class to deserialize from the Dex object to our component instance.
 */
export class PointTrajectoryGroupFactory implements EventGroupFactory {
  type = PointTrajectoryGroup.type;

  fromDexObject(obj: any): PointTrajectoryGroup {
    const comp = new PointTrajectoryGroup(obj["name"], obj["origin"]);

    // paramColumns
    if (Array.isArray(obj["paramColumns"])) {
      comp.paramColumns = [...obj["paramColumns"]];
    }

    // pointColumns
    if (Array.isArray(obj["pointColumns"])) {
      comp.pointColumns = [...obj["pointColumns"]];
    }

    // trajectories
    comp.trajectories = [];
    if (Array.isArray(obj["trajectories"])) {
      for (const lineObj of obj["trajectories"]) {
        comp.trajectories.push({
          points: Array.isArray(lineObj["points"]) ? lineObj["points"] : [],
          params: Array.isArray(lineObj["params"]) ? lineObj["params"] : []
        });
      }
    }
    return comp;
  }
}

/** Register the factory so it gets picked up by the Entry deserialization. */
registerEventGroupFactory(new PointTrajectoryGroupFactory());
