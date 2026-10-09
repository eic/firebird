/**
 * Built-in data loaders, registered through the same GEOMETRY_LOADERS /
 * EVENT_LOADERS tokens that user extensions get (built-ins are first
 * consumers of the extension API). The display asks each loader `canLoad()`
 * in registration order; the first taker loads the source (see tokens.ts for
 * the rule). A loader returns the data; EventDisplayService shows it.
 *
 * A `.root` file is ambiguous by name - it holds detector geometry OR events -
 * so the ROOT loaders also implement `canLoadContent()`, which the routing
 * control uses after probing a picked or dropped file. Each loader keeps the
 * knowledge of what its own format looks like; the control only carries the
 * probe around.
 *
 * Bundle note: these classes are referenced from app.config (the initial
 * bundle), so the services that do the work (GeometryService, RootFileService,
 * DataModelService) come from the display entry through a DYNAMIC import at
 * load time. A static import would drag three.js and the whole display stack
 * into the initial bundle.
 */

import { Injectable, Injector, inject } from '@angular/core';
// The /loaders subpath (initial-bundle file): the core root would pull the
// painter modules and with them three.js.
import { matchesFileExtensions, sourceName } from '@dexvis/firebird-core/loaders';
import type { Object3D } from 'three';
import type {
  DataExchange,
  DataLoaderMeta,
  DataSource,
  EventDataLoader,
  FileContentProbe,
  GeometryDataLoader,
  LoaderContext,
} from '@dexvis/firebird-core';
import {
  ConfigService,
  ROOT_COLLECTIONS_CONFIG,
  ROOT_EVENT_RANGE_CONFIG,
  TRAJECTORY_EXCLUDED_COLLECTIONS_CONFIG,
} from '@dexvis/firebird-ng/api';

/** Sources the browser can byte-range on its own, with no server helping. */
function isDirectlyReadable(source: DataSource): boolean {
  if (typeof source !== 'string') return true; // a picked/dropped file
  const lower = source.toLowerCase();
  return lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('asset://');
}

/**
 * Parses a comma-separated config list ('tracker_hits,mc_particles') into its
 * trimmed names. An empty list gives undefined: the converter's default.
 */
function parseListConfig(value: string): string[] | undefined {
  const names = value.split(',').map(name => name.trim()).filter(Boolean);
  return names.length ? names : undefined;
}

/** Firebird DEX event files (.firebird.json / .firebird.zip), by URL or picked/dropped. */
@Injectable()
export class DexEventLoader implements EventDataLoader {
  readonly meta: DataLoaderMeta = {
    id: 'firebird-dex',
    label: 'Firebird DEX events (json/zip)',
    fileExtensions: ['.firebird.json', '.firebird.zip', '.firebird.json.zip', '.json', '.zip'],
  };

  private injector = inject(Injector);

  canLoad(source: DataSource): boolean {
    return matchesFileExtensions(source, this.meta);
  }

  async loadEvents(source: DataSource, context: LoaderContext): Promise<DataExchange> {
    const { DataModelService } = await import('@dexvis/firebird-ng/display');
    const dataModel = this.injector.get(DataModelService);
    // A picked/dropped file is read in place, never uploaded
    if (typeof source !== 'string') return dataModel.readDexFile(source);
    return dataModel.fetchDex(context.resolveUrl(source), { name: source, signal: context.signal });
  }
}

/**
 * EDM4eic / EDM4hep ROOT files converted IN THE BROWSER by @dexvis/root2dex.
 *
 * Claims what the browser can byte-range itself: http(s) and asset URLs, and
 * files the user picked or dropped. Everything else with a `.root` name -
 * `root://` XRootD URLs above all, and paths that pyrobird serves from its work
 * directory - falls through to Edm4eicEventLoader, which keeps going through
 * pyrobird's convert endpoint. Registration order encodes that: this loader is
 * asked first, the server one remains the fallback.
 *
 * Installations that would rather always convert server-side can set
 * `events.rootConverter` to 'server'.
 */
@Injectable()
export class Root2DexEventLoader implements EventDataLoader {
  readonly meta: DataLoaderMeta = {
    id: 'root2dex',
    label: 'EDM4eic/EDM4hep ROOT file (in-browser conversion)',
    fileExtensions: ['.root'],
    // The open-event panel can report the event count and let the user pick
    // a range before converting
    offersEventPicker: true,
  };

  private injector = inject(Injector);
  private config = inject(ConfigService);

  canLoad(source: DataSource): boolean {
    if (this.config.getConfigOrCreate<string>('events.rootConverter', 'browser').value === 'server') {
      return false;
    }
    return matchesFileExtensions(source, this.meta) && isDirectlyReadable(source);
  }

  /** A podio event file has an 'events' TTree at the top level. */
  canLoadContent(probe: FileContentProbe): boolean {
    return probe.entries.some(entry => entry.name === 'events' && entry.className === 'TTree');
  }

  async loadEvents(source: DataSource, context: LoaderContext): Promise<DataExchange> {
    const entries = this.config.declare(ROOT_EVENT_RANGE_CONFIG).value || ROOT_EVENT_RANGE_CONFIG.default;
    const collections = parseListConfig(this.config.declare(ROOT_COLLECTIONS_CONFIG).value || '');
    const trajectoryExcludedCollections = parseListConfig(this.config.declare(TRAJECTORY_EXCLUDED_COLLECTIONS_CONFIG).value || '');
    const { DataModelService, RootFileService } = await import('@dexvis/firebird-ng/display');
    context.signal.throwIfAborted();

    // A handle of its own: the data selector's picker keeps its file open on
    // another handle, and an overlapping load opens its own. Closing it
    // rejects the conversion in flight, which is how a newer load stops it.
    const rootFile = this.injector.get(RootFileService).createHandle();
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      rootFile.close();
    };
    context.signal.addEventListener('abort', close, { once: true });
    try {
      await rootFile.open(source);
      const converted = await rootFile.convert(entries, { collections, trajectoryExcludedCollections });
      for (const warning of converted.warnings) {
        console.warn(`[root2dex] ${warning}`);
      }
      return this.injector.get(DataModelService).parseDex(converted.dex, sourceName(source));
    } catch (error) {
      context.signal.throwIfAborted();
      throw error;
    } finally {
      context.signal.removeEventListener('abort', close);
      close();
    }
  }
}

/**
 * EDM4eic / EDM4hep ROOT files converted server-side through the pyrobird
 * convert endpoint, which detects the data model itself. This is the path for
 * XRootD (`root://`) sources: pyrobird opens them remotely and converts.
 */
@Injectable()
export class Edm4eicEventLoader implements EventDataLoader {
  readonly meta: DataLoaderMeta = {
    id: 'edm4eic-root',
    label: 'EDM4eic/EDM4hep ROOT file (server conversion)',
    fileExtensions: ['.root'],
    urlSchemes: ['root://'],
  };

  private injector = inject(Injector);
  private config = inject(ConfigService);

  canLoad(source: DataSource): boolean {
    // The endpoint takes a URL/path the server can reach; a local file has none
    return typeof source === 'string' && matchesFileExtensions(source, this.meta);
  }

  async loadEvents(source: DataSource, context: LoaderContext): Promise<DataExchange> {
    const eventRange = this.config.declare(ROOT_EVENT_RANGE_CONFIG).value || ROOT_EVENT_RANGE_CONFIG.default;
    const collections = parseListConfig(this.config.declare(ROOT_COLLECTIONS_CONFIG).value || '');
    const { DataModelService } = await import('@dexvis/firebird-ng/display');
    // The convert endpoint resolves the source on the server: no resolveUrl here
    return this.injector.get(DataModelService).fetchRootConversion(source as string, eventRange, collections, context.signal);
  }
}

/** ROOT TGeo detector geometry, loaded via jsroot in the geometry worker. */
@Injectable()
export class RootGeometryLoader implements GeometryDataLoader {
  readonly meta: DataLoaderMeta = {
    id: 'root-geometry',
    label: 'ROOT TGeo geometry',
    fileExtensions: ['.root'],
  };

  /** TGeo lengths are centimeters. */
  readonly millimetersPerUnit = 10;

  private injector = inject(Injector);

  canLoad(source: DataSource): boolean {
    return matchesFileExtensions(source, this.meta);
  }

  /** A geometry file has a TGeoManager at the top level (usually 'Default'). */
  canLoadContent(probe: FileContentProbe): boolean {
    return probe.entries.some(entry => entry.className === 'TGeoManager');
  }

  async load(source: DataSource, context: LoaderContext): Promise<Object3D> {
    const { GeometryService } = await import('@dexvis/firebird-ng/display');
    return this.injector.get(GeometryService).loadGeometry(source, { signal: context.signal });
  }
}
