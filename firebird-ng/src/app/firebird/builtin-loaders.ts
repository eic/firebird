/**
 * Built-in data loaders, registered through the same GEOMETRY_LOADERS /
 * EVENT_LOADERS tokens that user extensions get (built-ins are first
 * consumers of the extension API). Selection is registry-driven: the
 * open-geometry / open-dex command handlers ask each loader `canLoad()`
 * in registration order; first taker wins.
 *
 * A `.root` file is ambiguous by name - it holds detector geometry OR events -
 * so the ROOT loaders also implement `canLoadContent()`, which the routing
 * control uses after probing a picked or dropped file. Each loader keeps the
 * knowledge of what its own format looks like; the control only carries the
 * probe around.
 *
 * Bundle note: these classes are referenced from app.config (the initial
 * bundle), so they resolve EventDisplayService — and with it three.js and the
 * whole display stack — through DYNAMIC imports at load time. A static import
 * here would drag the display chunk into the initial bundle.
 */

import { Injectable, Injector, inject } from '@angular/core';
// Deep import (initial-bundle file): loaders.ts is plain TS; the core barrel
// would pull painter modules and with them three.js.
import { matchesFileExtensions } from "@firebird/core/loaders";
import type {
  DataExchange,
  DataLoaderMeta,
  DataSource,
  EventDataLoader,
  FileContentProbe,
  GeometryDataLoader,
  LoadedGeometry,
} from '@firebird/core';
import { ConfigService } from '../services/config.service';
import type { EventDisplayService } from '../services/event-display.service';

async function resolveEventDisplay(injector: Injector): Promise<EventDisplayService> {
  const module = await import('../services/event-display.service');
  return injector.get(module.EventDisplayService);
}

/** Sources the browser can byte-range on its own, with no server helping. */
function isDirectlyReadable(source: DataSource): boolean {
  if (typeof source !== 'string') return true; // a picked/dropped file
  const lower = source.toLowerCase();
  return lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('asset://');
}

/**
 * Parses the `events.rootCollections` config value — a comma-separated list of
 * collection groups ('tracker_hits,mc_particles'), same names as `pyrobird
 * convert --collections`. Empty means all groups; both ROOT event loaders
 * (browser and server conversion) honor it, and the open-event panel offers
 * the same choice as checkboxes.
 */
function parseCollectionsConfig(value: string): string[] | undefined {
  const groups = value.split(',').map(group => group.trim()).filter(Boolean);
  return groups.length ? groups : undefined;
}

/** Firebird DEX event files (.firebird.json / .firebird.zip), by URL or picked/dropped. */
@Injectable()
export class DexEventLoader implements EventDataLoader {
  readonly meta: DataLoaderMeta = {
    id: 'firebird-dex',
    label: 'Firebird DEX events (json/zip)',
    fileExtensions: ['.firebird.json', '.firebird.zip', '.firebird.json.zip', '.json', '.zip'],
    urlSchemes: ['asset://'],
  };

  private injector = inject(Injector);

  canLoad(source: DataSource): boolean {
    return matchesFileExtensions(source, this.meta);
  }

  async loadEvents(source: DataSource): Promise<DataExchange | null> {
    const display = await resolveEventDisplay(this.injector);
    if (typeof source === 'string') {
      return display.loadDexData(source);
    }
    // A picked/dropped file is read in place, never uploaded. Dynamic import:
    // this class is in the initial bundle and the reader pulls JSZip.
    const { readDexFile } = await import('../utils/data-fetching.utils');
    const dex = await readDexFile(source);
    return display.showDexDocument(dex);
  }
}

/**
 * EDM4eic / EDM4hep ROOT files converted IN THE BROWSER by @firebird/root2dex.
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

  async loadEvents(source: DataSource): Promise<DataExchange | null> {
    const entries = this.config.getConfigOrCreate<string>('events.rootEventRange', '0').value || '0';
    const collections = parseCollectionsConfig(
      this.config.getConfigOrCreate<string>('events.rootCollections', '').value || '');
    const { RootFileService } = await import('../services/root-file.service');
    const rootFiles = this.injector.get(RootFileService);
    const display = await resolveEventDisplay(this.injector);

    await rootFiles.open(source);
    const converted = await rootFiles.convert(entries, collections);
    for (const warning of converted.warnings) {
      console.warn(`[root2dex] ${warning}`);
    }
    // Only a URL is worth remembering as "already loaded"; a picked file is not
    return display.showDexDocument(
      converted.dex,
      typeof source === 'string' ? source : undefined,
    );
  }
}

/**
 * EDM4eic ROOT files converted server-side through the pyrobird convert
 * endpoint. This is the path for XRootD (`root://`) sources: pyrobird opens
 * them remotely and converts, exactly as before.
 */
@Injectable()
export class Edm4eicEventLoader implements EventDataLoader {
  readonly meta: DataLoaderMeta = {
    id: 'edm4eic-root',
    label: 'EDM4eic ROOT file (server conversion)',
    fileExtensions: ['.root'],
    urlSchemes: ['root://'],
  };

  private injector = inject(Injector);
  private config = inject(ConfigService);

  canLoad(source: DataSource): boolean {
    // The endpoint takes a URL/path the server can reach; a local file has none
    return typeof source === 'string' && matchesFileExtensions(source, this.meta);
  }

  async loadEvents(source: DataSource): Promise<DataExchange | null> {
    const eventRange = this.config.getConfig<string>('events.rootEventRange')?.value || '0';
    const collections = parseCollectionsConfig(
      this.config.getConfigOrCreate<string>('events.rootCollections', '').value || '');
    const display = await resolveEventDisplay(this.injector);
    return display.loadRootData(source as string, eventRange, collections);
  }
}

/** ROOT TGeo detector geometry, loaded via jsroot in the geometry worker. */
@Injectable()
export class RootGeometryLoader implements GeometryDataLoader {
  readonly meta: DataLoaderMeta = {
    id: 'root-geometry',
    label: 'ROOT TGeo geometry',
    fileExtensions: ['.root'],
    urlSchemes: ['epic://'],
  };

  private injector = inject(Injector);

  canLoad(source: DataSource): boolean {
    return matchesFileExtensions(source, this.meta);
  }

  /** A geometry file has a TGeoManager at the top level (usually 'Default'). */
  canLoadContent(probe: FileContentProbe): boolean {
    return probe.entries.some(entry => entry.className === 'TGeoManager');
  }

  async load(source: DataSource): Promise<LoadedGeometry> {
    const display = await resolveEventDisplay(this.injector);
    return await display.loadGeometry(source);
  }
}
