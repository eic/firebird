/**
 * Loader contracts for the extension system.
 *
 * A loader teaches Firebird to open a file format or URL scheme. Loaders are
 * core citizens (plain TS, worker-safe interfaces); the Angular layer collects
 * implementations through the `GEOMETRY_LOADERS` / `EVENT_LOADERS` DI tokens
 * (`withGeometryLoader()` / `withEventLoader()`), and pickers such as the
 * open-geometry/open-dex command handlers select a loader by `canLoad()`.
 *
 * `meta.fileExtensions` and `meta.urlSchemes` are static declarations that
 * drive UI (open-dialog filters, drop zones) without the loader writing UI code.
 */

import type { Object3D } from "three";
import type { DataExchange } from "./model/data-exchange";

/** Static, declarative description of what a loader can open. */
export interface DataLoaderMeta {
  /** Unique id, e.g. 'root-geometry' or 'firebird-dex'. */
  id: string;
  /** Human-readable label for menus and error messages. */
  label: string;
  /** Extensions this loader claims, with dots: ['.root', '.firebird.json']. */
  fileExtensions: string[];
  /** Optional URL schemes this loader claims, e.g. ['epic://']. */
  urlSchemes?: string[];
}

/** Result of a geometry load. `root` is null when the load was cancelled. */
export interface LoadedGeometry {
  root: Object3D | null;
  cancelled?: boolean;
}

/**
 * Opens detector geometry from a URL or file path.
 * First registered loader whose `canLoad()` returns true wins.
 */
export interface GeometryDataLoader {
  readonly meta: DataLoaderMeta;
  canLoad(source: string): boolean;
  load(source: string): Promise<LoadedGeometry>;
}

/**
 * Opens event data from a URL or file path, producing a DataExchange
 * (the parsed DEX event container). Returns null on failure.
 */
export interface EventDataLoader {
  readonly meta: DataLoaderMeta;
  canLoad(source: string): boolean;
  loadEvents(source: string): Promise<DataExchange | null>;
}

/** Shared helper: does the source path/URL end with one of the extensions? */
export function matchesFileExtensions(source: string, meta: DataLoaderMeta): boolean {
  const path = source.split('?')[0].toLowerCase();
  return meta.fileExtensions.some(ext => path.endsWith(ext.toLowerCase()))
    || (meta.urlSchemes ?? []).some(scheme => source.toLowerCase().startsWith(scheme.toLowerCase()));
}
