/**
 * Loader contracts for the extension system.
 *
 * A loader teaches Firebird to open a file format or URL scheme. Loaders are
 * core citizens (plain TS, worker-safe interfaces); the Angular layer collects
 * implementations through the `GEOMETRY_LOADERS` / `EVENT_LOADERS` DI tokens
 * (`withGeometryLoader()` / `withEventLoader()`).
 *
 * A loader returns data and never touches the display: the display picks the
 * first registered loader whose `canLoad()` claims a source, hands it a
 * `LoaderContext`, and puts what the loader returns on screen. Failures are
 * rejections that carry the reason (HTTP status, unsupported version, ...):
 * the display shows that message to the user.
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
  /**
   * Optional URL schemes this loader claims, e.g. ['root://']. A scheme
   * claims only a source whose file name has no extension or one listed in
   * `fileExtensions`: `root://host//run.root` and `root://host//run` match
   * ['root://'], `root://host//run.firebird.zip` does not. Another loader's
   * format therefore never lands here because of its scheme.
   */
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

/** What the display hands a loader with each load. */
export interface LoaderContext {
  /**
   * Turns a URL alias (`asset://`, a pack's alias such as `exp://`) or a path
   * the server serves into a URL `fetch()` can read. Absolute http(s) URLs
   * come back unchanged.
   */
  resolveUrl(url: string): string;
  /**
   * Aborted when a newer load of the same kind (geometry, or events)
   * replaces this one. Pass it to `fetch()`, stop work when it fires, and
   * reject with `signal.reason`; the display drops the result either way.
   */
  readonly signal: AbortSignal;
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
 * The first registered loader whose `canLoad()` returns true loads it.
 */
export interface GeometryDataLoader extends DataLoaderBase {
  /**
   * Millimeters per length unit of the geometry `load()` returns: 10 for
   * ROOT TGeo (centimeters). The display scales the geometry container by
   * it, so detector and event data (millimeters) line up. Default 1.
   */
  readonly millimetersPerUnit?: number;
  /**
   * Loads the geometry and resolves to its root object; the display adds it
   * to the scene, replacing the previous geometry. Rejects with the reason
   * when the source cannot be loaded.
   */
  load(source: DataSource, context: LoaderContext): Promise<Object3D>;
}

/**
 * Opens event data from a URL, path, or local file.
 * The first registered loader whose `canLoad()` returns true loads it.
 */
export interface EventDataLoader extends DataLoaderBase {
  /**
   * Loads the events and resolves to the parsed DEX container
   * (`DataExchange.fromDexObj()`); the display shows its first event.
   * Rejects with the reason (HTTP status, unsupported DEX version, entries
   * outside the file) when the source cannot be loaded.
   */
  loadEvents(source: DataSource, context: LoaderContext): Promise<DataExchange>;
}

/** The name to match against: the URL itself, or a picked file's name. */
export function sourceName(source: DataSource): string {
  return typeof source === 'string' ? source : source.name;
}

/**
 * True when the last path segment of a URL or path carries a file extension.
 * The host of a URL is not a path segment: `root://host.org` has none.
 */
function hasFileExtension(path: string): boolean {
  const schemeEnd = path.indexOf('://');
  const afterScheme = schemeEnd >= 0 ? path.slice(schemeEnd + 3) : path;
  const pathStart = schemeEnd >= 0 ? afterScheme.indexOf('/') : 0;
  if (pathStart < 0) return false;
  const lastSegment = afterScheme.slice(pathStart).split('/').pop() ?? '';
  return lastSegment.lastIndexOf('.') > 0;
}

/**
 * Shared helper: does the loader claim the source by its name? A source
 * matches when its path ends with one of `meta.fileExtensions`, when it
 * starts with one of `meta.urlSchemes` and has no file extension, or when a
 * query parameter value (download-style URLs) ends with one of the
 * extensions.
 */
export function matchesFileExtensions(source: DataSource, meta: DataLoaderMeta): boolean {
  const name = sourceName(source);
  const matchesPath = (path: string) =>
    meta.fileExtensions.some(ext => path.toLowerCase().endsWith(ext.toLowerCase()));

  const [path, query] = name.split('?');
  if (matchesPath(path)) return true;
  // A scheme never overrides an extension: 'asset://data/x.root' belongs to
  // a .root loader even when another loader claims every asset:// URL
  const matchesScheme = (meta.urlSchemes ?? []).some(scheme => path.toLowerCase().startsWith(scheme.toLowerCase()));
  if (matchesScheme && !hasFileExtension(path)) {
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
