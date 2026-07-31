/**
 * Built-in data loaders, registered through the same GEOMETRY_LOADERS /
 * EVENT_LOADERS tokens that user extensions get (built-ins are first
 * consumers of the extension API). Selection is registry-driven: the
 * open-geometry / open-dex command handlers ask each loader `canLoad()`
 * in registration order; first taker wins.
 *
 * Bundle note: these classes are referenced from app.config (the initial
 * bundle), so they resolve EventDisplayService — and with it three.js and the
 * whole display stack — through DYNAMIC imports at load time. A static import
 * here would drag the display chunk into the initial bundle.
 */

import { Injectable, Injector, inject } from '@angular/core';
// Deep import (initial-bundle file): loaders.ts is plain TS; the core barrel
// would pull painter modules and with them three.js.
import { matchesFileExtensions } from '@firebird/core/loaders';
import type {
  DataExchange,
  DataLoaderMeta,
  EventDataLoader,
  GeometryDataLoader,
  LoadedGeometry,
} from '@firebird/core';
import { ConfigService } from '../services/config.service';
import type { EventDisplayService } from '../services/event-display.service';

async function resolveEventDisplay(injector: Injector): Promise<EventDisplayService> {
  const module = await import('../services/event-display.service');
  return injector.get(module.EventDisplayService);
}

/** Firebird DEX event files (.firebird.json / .firebird.zip). */
@Injectable()
export class DexEventLoader implements EventDataLoader {
  readonly meta: DataLoaderMeta = {
    id: 'firebird-dex',
    label: 'Firebird DEX events (json/zip)',
    fileExtensions: ['.firebird.json', '.firebird.zip', '.firebird.json.zip', '.json', '.zip'],
    urlSchemes: ['asset://'],
  };

  private injector = inject(Injector);

  canLoad(source: string): boolean {
    return matchesFileExtensions(source, this.meta);
  }

  async loadEvents(source: string): Promise<DataExchange | null> {
    const display = await resolveEventDisplay(this.injector);
    return display.loadDexData(source);
  }
}

/** EDM4eic ROOT files, converted server-side through the pyrobird convert endpoint. */
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

  canLoad(source: string): boolean {
    return matchesFileExtensions(source, this.meta);
  }

  async loadEvents(source: string): Promise<DataExchange | null> {
    const eventRange = this.config.getConfig<string>('events.rootEventRange')?.value || '0';
    const display = await resolveEventDisplay(this.injector);
    return display.loadRootData(source, eventRange);
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

  canLoad(source: string): boolean {
    return matchesFileExtensions(source, this.meta);
  }

  async load(source: string): Promise<LoadedGeometry> {
    const display = await resolveEventDisplay(this.injector);
    return await display.loadGeometry(source);
  }
}
