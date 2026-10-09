/**
 * Firebird DEX format version 1.0: the document shape this package emits.
 *
 * DEX v1 is columnar - an event holds `pieces`, each piece holds parallel
 * `columns` arrays where the entity id equals the array index. A writer
 * declares only the columns it has: simulation output has no reconstruction
 * columns and vice versa.
 *
 * These are the plain JSON structures, not the runtime model classes. The app
 * hands the document to `DataExchange.fromDexObj()`; batch tools write it out
 * as JSON.
 */

export const DEX_TYPE = 'firebird-dex-json';
export const DEX_VERSION = '1.0';
export const PIECE_VERSION = '1.0';

/** One named block of typed entity data inside an event. */
export interface DexPiece {
  name: string;
  type: string;
  version: string;
  /** Free-form provenance: which ROOT collection and C++ type this came from. */
  origin?: unknown;
  count: number;
  /** Parallel arrays; a fixed-width vector column is flattened (pos = xyz per entity). */
  columns: Record<string, unknown[]>;
  /** Index columns into other pieces of the same event; -1 means "no reference". */
  refs?: Record<string, string>;
  /** PointTrajectory: the names of the per-point tuple values. */
  pointColumns?: string[];
  /** PointTrajectory: ragged payload, one point list per entity. */
  points?: number[][][];
}

export interface DexEvent {
  id: string | number;
  pieces: DexPiece[];
}

export interface DexDocument {
  type: string;
  version: string;
  origin: unknown;
  events: DexEvent[];
}

/** Wraps a list of event objects into a complete DEX v1 document. */
export function makeDex(events: DexEvent[], origin: unknown = null): DexDocument {
  return {
    type: DEX_TYPE,
    version: DEX_VERSION,
    origin,
    events,
  };
}
