// box-hit.piece.ts

import {
  EventPiece,
  EventPieceFactory,
  readPieceCount,
  readNumberColumn,
  readOptionalNumberColumn,
} from './event-piece';

/**
 * Box-shaped tracker hits stored in columns (DEX v1): parallel typed arrays,
 * hit id equals array index. There are no per-hit objects — painters read the
 * columns directly.
 *
 * DEX piece layout:
 *
 *   {
 *     "name": "BarrelHits", "type": "BoxHit", "version": "1.0",
 *     "count": 2,
 *     "columns": {
 *       "pos": [x0,y0,z0, x1,y1,z1],   // [mm] flat, 3 values per hit
 *       "dim": [...],                  // [mm] box size, 3 values per hit
 *       "time": [t0, t1],              // [ns] optional
 *       "timeError": [...],            // [ns] optional
 *       "edep": [...],                 // [GeV] optional
 *       "edepError": [...]             // [GeV] optional
 *     }
 *   }
 *
 * Optional columns are null when the writer omitted them (simulation output
 * has no error columns, for example).
 */
export class BoxHitPiece extends EventPiece {

  /** The static type identifier for the BoxHitPiece. */
  static type = 'BoxHit';

  /** Number of hits. */
  count = 0;

  /** Hit centers [mm]: flat x,y,z per hit, `3 * count` values. */
  pos: Float32Array = new Float32Array(0);

  /** Box sizes [mm]: flat dx,dy,dz per hit, `3 * count` values. */
  dim: Float32Array = new Float32Array(0);

  /** Hit times [ns], `count` values, or null when not written. */
  time: Float32Array | null = null;

  /** Time errors [ns], `count` values, or null when not written. */
  timeError: Float32Array | null = null;

  /** Energy deposits [GeV], `count` values, or null when not written. */
  edep: Float32Array | null = null;

  /** Energy deposit errors [GeV], `count` values, or null when not written. */
  edepError: Float32Array | null = null;

  constructor(name: string, origin?: any) {
    super(name, BoxHitPiece.type, origin);
  }

  /** Label with the optional time and energy columns when the writer had them. */
  override entityLabel(hitIndex: number): string {
    let label = `#${hitIndex}`;
    if (this.time !== null) label += ` t=${this.time[hitIndex].toFixed(1)}`;
    if (this.edep !== null) label += ` edep=${this.edep[hitIndex].toExponential(1)}`;
    return label;
  }

  /** Time range over the time column; null when the column is absent or empty. */
  override get timeRange(): [number, number] | null {
    if (this.time === null || this.count === 0) return null;

    let minTime = this.time[0];
    let maxTime = this.time[0];
    for (let i = 1; i < this.count; i++) {
      const t = this.time[i];
      if (t < minTime) minTime = t;
      if (t > maxTime) maxTime = t;
    }
    return [minTime, maxTime];
  }

  toDexObject(): any {
    const columns: any = {
      pos: Array.from(this.pos),
      dim: Array.from(this.dim),
    };
    if (this.time !== null) columns.time = Array.from(this.time);
    if (this.timeError !== null) columns.timeError = Array.from(this.timeError);
    if (this.edep !== null) columns.edep = Array.from(this.edep);
    if (this.edepError !== null) columns.edepError = Array.from(this.edepError);

    const result: any = {
      name: this.name,
      type: this.type,
      version: '1.0',
      count: this.count,
      columns: columns,
    };
    if (this.origin !== undefined) result.origin = this.origin;
    return result;
  }
}

/**
 * Factory for creating instances of BoxHitPiece from deserialized DEX data.
 * Column lengths are checked loudly — a malformed file throws instead of
 * rendering shifted hits.
 */
export class BoxHitPieceFactory implements EventPieceFactory {
  /** The type of the piece that this factory creates. */
  type: string = BoxHitPiece.type;

  fromDexObject(obj: any): BoxHitPiece {
    const result = new BoxHitPiece(obj['name'], obj['origin']);
    result.count = readPieceCount(obj);
    result.pos = readNumberColumn(obj, 'pos', result.count, 3);
    result.dim = readNumberColumn(obj, 'dim', result.count, 3);
    result.time = readOptionalNumberColumn(obj, 'time', result.count);
    result.timeError = readOptionalNumberColumn(obj, 'timeError', result.count);
    result.edep = readOptionalNumberColumn(obj, 'edep', result.count);
    result.edepError = readOptionalNumberColumn(obj, 'edepError', result.count);
    return result;
  }
}
