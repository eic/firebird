/**
 * A data-model component for "TrackerLinePointTrajectory" typed data.
 *
 * This represents data in the Firebird Dex format:
 *
 *   {
 *     "name": "CentralTrackSegments",
 *     "type": "TrackerLinePointTrajectory",
 *     "originType": [...],
 *     "paramColumns": [...],
 *     "pointColumns": [...],
 *     "lines": [
 *       {
 *         "points": [ [x, y, z, t, dx, dy, dz, dt], ... ],
 *         "params": [ ... ]
 *       },
 *       ...
 *     ]
 *   }
 *
 * For example, each "line" may correspond to one track segment,
 * and "points" is an array of arrays containing position/time/uncertainties.
 */

import {
  EntryComponent,
  EntryComponentFactory,
  registerComponentFactory
} from "./entry-component";

/**
 * Representation of a single line in the trajectory.
 */
export interface TrackerLineSegment {
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
export class PointTrajectoryComponent extends EntryComponent {
  static type = "TrackerLinePointTrajectory";

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
   * The lines array, each containing a set of points and the param array.
   */
  lines: TrackerLineSegment[] = [];

  constructor(name: string, originType?: string) {
    super(name, PointTrajectoryComponent.type, originType);
  }

  /**
   * Convert this component to a Dex-format JS object
   */
  override toDexObject(): any {
    // Serialize lines
    const linesObj = this.lines.map((line) => {
      return {
        points: line.points,
        params: line.params
      };
    });

    return {
      name: this.name,
      type: this.type,
      originType: this.originType,
      paramColumns: this.paramColumns,
      pointColumns: this.pointColumns,
      lines: linesObj
    };
  }
}

/**
 * Factory class to deserialize from the Dex object to our component instance.
 */
export class TrackerLinePointTrajectoryComponentFactory implements EntryComponentFactory {
  type = PointTrajectoryComponent.type;

  fromDexObject(obj: any): PointTrajectoryComponent {
    const comp = new PointTrajectoryComponent(obj["name"], obj["originType"]);

    // paramColumns
    if (Array.isArray(obj["paramColumns"])) {
      comp.paramColumns = [...obj["paramColumns"]];
    }

    // pointColumns
    if (Array.isArray(obj["pointColumns"])) {
      comp.pointColumns = [...obj["pointColumns"]];
    }

    // lines
    comp.lines = [];
    if (Array.isArray(obj["lines"])) {
      for (const lineObj of obj["lines"]) {
        comp.lines.push({
          points: Array.isArray(lineObj["points"]) ? lineObj["points"] : [],
          params: Array.isArray(lineObj["params"]) ? lineObj["params"] : []
        });
      }
    }
    return comp;
  }
}

/** Register the factory so it gets picked up by the Entry deserialization. */
registerComponentFactory(new TrackerLinePointTrajectoryComponentFactory());
