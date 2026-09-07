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
 *
 * Two-stage claiming: `canLoad()` decides from the source alone (extension,
 * scheme) and is enough for formats whose name says what they are. When the
 * name is ambiguous - a `.root` file holds detector geometry OR events, and
 * nothing outside tells you which - the control that opened the file probes
 * its contents and asks `canLoadContent()`. Each loader keeps the knowledge of
 * what its own format looks like inside; the control only carries facts around.
 */

import type { Object3D } from "three";
import type { DataExchange } from "./model/data-exchange";

/**
 * What a loader can be pointed at: a URL or path, or a file the user picked or
 * dropped (which is never uploaded - loaders read it in place).
 */
export type DataSource = string | File;

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
  /**
   * True when the loader's format supports the interactive open flow: report
   * the event count first, let the user pick a range, convert on demand (the
   * ROOT converter does this). Loaders without it load the whole source in
   * one `loadEvents` call — the open-event panel shows the result directly
   * instead of offering the picker.
   */
  offersEventPicker?: boolean;
}

/** One top-level object inside a container file, with the class it holds. */
export interface ContentEntry {
  name: string;
  className: string;
}

/**
 * Neutral facts about what a container file holds - no interpretation. For a
 * ROOT file these are its top-level keys, so a detector geometry shows up as
 * `{name: 'Default', className: 'TGeoManager'}` and event data as
 * `{name: 'events', className: 'TTree'}`.
 */
export interface FileContentProbe {
  /** File name or URL the probe was taken from. */
  name: string;
  entries: ContentEntry[];
}

/** Result of a geometry load. `root` is null when the load was cancelled. */
export interface LoadedGeometry {
  root: Object3D | null;
  cancelled?: boolean;
}

/** What every loader declares, whatever it loads. */
interface DataLoaderBase {
  readonly meta: DataLoaderMeta;
  /** Claims a source by its name alone (extension, scheme). */
  canLoad(source: DataSource): boolean;
  /**
   * Optional: claims a source by what is INSIDE it. Asked only when the name
   * was ambiguous. A loader that does not implement it is never selected by
   * content.
   */
  canLoadContent?(probe: FileContentProbe): boolean;
}

/**
 * Opens detector geometry from a URL, path, or local file.
 * First registered loader whose `canLoad()` returns true wins.
 */
export interface GeometryDataLoader extends DataLoaderBase {
  load(source: DataSource): Promise<LoadedGeometry>;
}

/**
 * Opens event data from a URL, path, or local file, producing a DataExchange
 * (the parsed DEX event container). Returns null on failure.
 */
export interface EventDataLoader extends DataLoaderBase {
  loadEvents(source: DataSource): Promise<DataExchange | null>;
}

/** The name to match against: the URL itself, or a picked file's name. */
export function sourceName(source: DataSource): string {
  return typeof source === 'string' ? source : source.name;
}

/** Shared helper: does the source path/URL end with one of the extensions? */
export function matchesFileExtensions(source: DataSource, meta: DataLoaderMeta): boolean {
  const name = sourceName(source);
  const matchesPath = (path: string) =>
    meta.fileExtensions.some(ext => path.toLowerCase().endsWith(ext.toLowerCase()));

  const [path, query] = name.split('?');
  if (matchesPath(path)) return true;
  if ((meta.urlSchemes ?? []).some(scheme => name.toLowerCase().startsWith(scheme.toLowerCase()))) {
    return true;
  }

  // Download-style URLs carry the file name in a query parameter
  // (pyrobird: /api/v1/download?f=events.firebird.zip) — match those values too
  if (query) {
    for (const pair of query.split('&')) {
      const value = pair.split('=')[1];
      if (!value) continue;
      try {
        if (matchesPath(decodeURIComponent(value))) return true;
      } catch {
        // Malformed percent-encoding: not a file name worth matching
      }
    }
  }
  return false;
}
