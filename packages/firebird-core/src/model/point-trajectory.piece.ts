/**
 * A data-model piece for "PointTrajectory" typed data (DEX v1).
 *
 * Track parameters live in per-name columns (parallel arrays, trajectory id
 * equals array index). The per-trajectory point lists are ragged, so they
 * stay nested: `points[i]` is the point-tuple list of trajectory i, tuple
 * layout declared by `pointColumns`.
 *
 *   {
 *     "name": "CentralTrackSegments",
 *     "type": "PointTrajectory",
 *     "version": "1.0",
 *     "count": 2,
 *     "columns": { "theta": [...], "phi": [...], "pdg": [...] },
 *     "pointColumns": ["x", "y", "z", "t", "dx", "dy", "dz", "dt"],
 *     "points": [ [[x,y,z,t,...], ...], [[x,y,z,t,...], ...] ],
 *     "refs": { "particle": "McParticles" }        // optional
 *   }
 *
 * A writer declares only the columns it has: a simulation writer has pdg and
 * momentum, a reconstruction writer has theta/phi/qOverP. Readers bind to
 * declared columns, never to a fixed set.
 */

import {
  EntityRefLink,
  EventPiece,
  EventPieceFactory,
  readPieceCount,
} from './event-piece';

/** Common PDG codes -> short particle names, for entity labels. */
const PDG_NAMES: Record<number, string> = {
  11: 'e-', [-11]: 'e+', 13: 'mu-', [-13]: 'mu+', 22: 'gamma', [-22]: 'opt.photon',
  211: 'pi+', [-211]: 'pi-', 321: 'K+', [-321]: 'K-', 111: 'pi0',
  2212: 'p', [-2212]: 'p~', 2112: 'n', [-2112]: 'n~',
};

/** One parameter column: numbers for measured values, strings for labels. */
export type ParamColumn = (number | string | null)[];

export class PointTrajectoryPiece extends EventPiece {
  static type = 'PointTrajectory';

  /** Number of trajectories. */
  count = 0;

  /**
   * Parameter columns by name; each holds `count` values, trajectory id is
   * the index. Example keys: "theta", "phi", "q_over_p", "pdg", "charge".
   */
  columns: Record<string, ParamColumn> = {};

  /**
   * The point columns define the meaning of each entry in a point tuple.
   * Example: ["x","y","z","t","dx","dy","dz","dt"]
   */
  pointColumns: string[] = [];

  /**
   * Ragged per-trajectory point lists: `points[i]` belongs to trajectory i
   * and holds point tuples laid out per `pointColumns`.
   */
  points: number[][][] = [];

  /** Reference declarations: column name -> target piece name; -1 = no reference. */
  refs: Record<string, string> = {};

  constructor(name: string, origin?: any) {
    super(name, PointTrajectoryPiece.type, origin);
  }

  /** Reads one parameter of one trajectory; null when the column is absent. */
  param(columnName: string, trajectoryIndex: number): number | string | null {
    const column = this.columns[columnName];
    if (column === undefined) return null;
    const value = column[trajectoryIndex];
    return value === undefined ? null : value;
  }

  /**
   * Label from the columns painters already use for naming: type or pdg
   * (mapped to a particle name), charge as a fallback, momentum when the
   * writer declared px/py/pz.
   */
  override entityLabel(trajectoryIndex: number): string {
    let name = '';
    const type = this.param('type', trajectoryIndex);
    const pdg = this.param('pdg', trajectoryIndex);
    const charge = this.param('charge', trajectoryIndex);
    if (typeof type === 'string' && type) {
      name = type;
    } else if (typeof pdg === 'number') {
      name = PDG_NAMES[Math.floor(pdg)] ?? `pdg=${Math.floor(pdg)}`;
    } else if (typeof charge === 'number') {
      name = charge > 0 ? 'q+' : charge < 0 ? 'q-' : 'q0';
    }

    let momentum = '';
    const px = this.param('px', trajectoryIndex);
    const py = this.param('py', trajectoryIndex);
    const pz = this.param('pz', trajectoryIndex);
    if (typeof px === 'number' && typeof py === 'number' && typeof pz === 'number') {
      momentum = ` p=${(Math.sqrt(px * px + py * py + pz * pz) / 1000).toFixed(2)}`;
    }

    return `#${trajectoryIndex}${name ? ' ' + name : ''}${momentum}`;
  }

  /** Resolves the `refs` declaration for one trajectory (-1 = no reference). */
  override entityRefs(trajectoryIndex: number): EntityRefLink[] {
    const links: EntityRefLink[] = [];
    for (const [column, targetPiece] of Object.entries(this.refs)) {
      const value = this.param(column, trajectoryIndex);
      if (typeof value === 'number' && value >= 0) {
        links.push({ column, targetPiece, targetIndex: Math.floor(value) });
      }
    }
    return links;
  }

  /** calculate time range */
  override get timeRange(): [number, number] | null {
    if (this.count === 0) return null;

    // Find the index of time column
    const timeIndex = this.pointColumns.indexOf("t");
    if (timeIndex === -1) return null;

    let minTime: number | null = null;
    let maxTime: number | null = null;

    for (const trajectoryPoints of this.points) {
      for (const point of trajectoryPoints) {
        const time = point[timeIndex];
        if (time == null) continue;
        if (minTime === null || time < minTime) minTime = time;
        if (maxTime === null || time > maxTime) maxTime = time;
      }
    }

    if (minTime !== null && maxTime !== null) {
      return [minTime, maxTime];
    }
    return null;
  }

  /**
   * Convert this piece to a DEX v1 piece object
   */
  override toDexObject(): any {
    const result: any = {
      name: this.name,
      type: this.type,
      version: '1.0',
      count: this.count,
      columns: { ...this.columns },
      pointColumns: [...this.pointColumns],
      points: this.points,
    };
    if (Object.keys(this.refs).length > 0) result.refs = { ...this.refs };
    if (this.origin !== undefined) result.origin = this.origin;
    return result;
  }
}

/**
 * Factory class to deserialize from the DEX piece object to our piece instance.
 * Sizes are checked loudly — a malformed file throws instead of pairing
 * parameters with the wrong trajectory.
 */
export class PointTrajectoryPieceFactory implements EventPieceFactory {
  type = PointTrajectoryPiece.type;

  fromDexObject(obj: any): PointTrajectoryPiece {
    const piece = new PointTrajectoryPiece(obj["name"], obj["origin"]);
    piece.count = readPieceCount(obj);

    if (Array.isArray(obj["pointColumns"])) {
      piece.pointColumns = [...obj["pointColumns"]];
    }

    const points = obj["points"];
    if (!Array.isArray(points) || points.length !== piece.count) {
      throw new Error(`DEX piece '${piece.name}': "points" must hold count=${piece.count} ` +
        `entries, got ${Array.isArray(points) ? points.length : typeof points}`);
    }

    const columns = obj["columns"] ?? {};
    for (const columnName of Object.keys(columns)) {
      const column = columns[columnName];
      if (!Array.isArray(column) || column.length !== piece.count) {
        throw new Error(`DEX piece '${piece.name}': column "${columnName}" must hold ` +
          `count=${piece.count} values (trajectory id must equal array index)`);
      }
      piece.columns[columnName] = column;
    }

    if (obj["refs"] && typeof obj["refs"] === 'object') {
      piece.refs = { ...obj["refs"] };
    }

    // Copy point lists sorted by time so partial-track painting can assume
    // monotonic time per trajectory
    const sortStart = performance.now();
    const timeIndex = piece.pointColumns.indexOf("t");
    let totalPoints = 0;
    piece.points = points.map((trajectoryPoints: number[][]) => {
      const copy = Array.isArray(trajectoryPoints) ? [...trajectoryPoints] : [];
      totalPoints += copy.length;
      if (timeIndex !== -1 && copy.length > 1) {
        copy.sort((a, b) => {
          if (a.length <= timeIndex || b.length <= timeIndex) return 0;
          return a[timeIndex] - b[timeIndex];
        });
      }
      return copy;
    });
    const sortMs = performance.now() - sortStart;
    if (sortMs > 10) {
      console.log(`[load-timing] adopt PointTrajectory '${piece.name}': copy+sort ` +
        `${sortMs.toFixed(1)} ms (${piece.count} trajectories, ${totalPoints} points)`);
    }

    return piece;
  }
}
