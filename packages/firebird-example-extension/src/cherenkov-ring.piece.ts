/**
 * Model side of the example extension: a data type Firebird has never heard
 * of (Cherenkov rings from a RICH detector) arrives in DEX and is decoded
 * into a typed EventPiece.
 *
 * This file is a @firebird/core citizen: plain TS, worker-safe, no Angular.
 * Only the registration lines (see index.ts) are Angular.
 *
 * The DEX v1 piece is columnar — parallel arrays, ring id == array index:
 *
 *   {
 *     "name": "ExampleRings", "type": "example.CherenkovRing", "version": "1.0",
 *     "count": 2,
 *     "columns": {
 *       "center": [x0,y0,z0, x1,y1,z1],  // [mm] flat, 3 values per ring
 *       "radius": [600, 450],            // [mm]
 *       "nPhotons": [14, 9],
 *       "time": [5, 4],                  // [ns]
 *       "track": [0, -1]                 // optional: index into a trajectory piece
 *     },
 *     "refs": { "track": "ExampleTracks" }
 *   }
 *
 * The optional "track" column shows the v1 reference mechanism: its values are
 * entity indexes into the piece named by refs (-1 = no reference), so linking
 * is a plain array lookup — no id maps.
 */

// Deep import on purpose: the factory is registered from app.config (initial
// bundle), and the @firebird/core barrel re-exports painter modules that pull
// three.js. The model module is plain TS.
import {
  EntityRefLink,
  EventPiece,
  EventPieceFactory,
  readPieceCount,
  readNumberColumn,
  readOptionalNumberColumn,
} from '@firebird/core/model/event-piece';

export class CherenkovRingPiece extends EventPiece {
  /** Namespaced type string: reverse-dns-lite prefix prevents collisions
   * between experiment packages; bare names are reserved for core types. */
  static type = 'example.CherenkovRing';

  /** Number of rings. */
  count = 0;

  /** Ring centers [mm]: flat x,y,z per ring, `3 * count` values. */
  center: Float32Array = new Float32Array(0);

  /** Ring radii [mm], `count` values. */
  radius: Float32Array = new Float32Array(0);

  /** Detected photons per ring, `count` values, or null when not written. */
  nPhotons: Float32Array | null = null;

  /** Ring production times [ns], `count` values, or null when not written. */
  time: Float32Array | null = null;

  /** Ring -> trajectory references (-1 = none), or null when not written. */
  track: Float32Array | null = null;

  /** Name of the piece the `track` column points into (from `refs`). */
  trackPieceName: string | null = null;

  constructor(name: string, origin?: any) {
    super(name, CherenkovRingPiece.type, origin);
  }

  /** Ring label: radius, plus photon count when written. */
  override entityLabel(ringIndex: number): string {
    let label = `#${ringIndex} r=${this.radius[ringIndex].toFixed(0)}`;
    if (this.nPhotons !== null) label += ` nphot=${this.nPhotons[ringIndex]}`;
    return label;
  }

  /** The ring -> trajectory reference, when the writer declared it. */
  override entityRefs(ringIndex: number): EntityRefLink[] {
    if (this.track === null || this.trackPieceName === null) return [];
    const target = this.track[ringIndex];
    if (target < 0) return [];
    return [{ column: 'track', targetPiece: this.trackPieceName, targetIndex: Math.floor(target) }];
  }

  static fromDexObject(obj: any): CherenkovRingPiece {
    const piece = new CherenkovRingPiece(obj['name'], obj['origin']);
    piece.count = readPieceCount(obj);
    piece.center = readNumberColumn(obj, 'center', piece.count, 3);
    piece.radius = readNumberColumn(obj, 'radius', piece.count);
    piece.nPhotons = readOptionalNumberColumn(obj, 'nPhotons', piece.count);
    piece.time = readOptionalNumberColumn(obj, 'time', piece.count);
    piece.track = readOptionalNumberColumn(obj, 'track', piece.count);
    piece.trackPieceName = obj['refs']?.['track'] ?? null;
    return piece;
  }

  override toDexObject(): any {
    const columns: any = {
      center: Array.from(this.center),
      radius: Array.from(this.radius),
    };
    if (this.nPhotons !== null) columns.nPhotons = Array.from(this.nPhotons);
    if (this.time !== null) columns.time = Array.from(this.time);
    if (this.track !== null) columns.track = Array.from(this.track);

    const result: any = {
      name: this.name,
      type: this.type,
      version: '1.0',
      count: this.count,
      columns: columns,
    };
    if (this.trackPieceName !== null) result.refs = { track: this.trackPieceName };
    if (this.origin !== undefined) result.origin = this.origin;
    return result;
  }

  override get timeRange(): [number, number] | null {
    if (this.time === null || this.count === 0) return null;
    let minTime = this.time[0];
    let maxTime = this.time[0];
    for (let i = 1; i < this.count; i++) {
      if (this.time[i] < minTime) minTime = this.time[i];
      if (this.time[i] > maxTime) maxTime = this.time[i];
    }
    return [minTime, maxTime];
  }
}

export class CherenkovRingPieceFactory implements EventPieceFactory {
  type = CherenkovRingPiece.type;

  fromDexObject(obj: any): EventPiece {
    return CherenkovRingPiece.fromDexObject(obj);
  }
}
