/**
 * Decides WHICH registered loader should open a file the user picked, dropped
 * or typed a URL for.
 *
 * This is the control that routes; it holds no format knowledge of its own.
 * A `.root` file is claimed by name from both registries - the same extension
 * carries a detector geometry or a podio event tree - so when the name is
 * ambiguous the router probes the file for neutral facts (its top-level keys)
 * and asks each loader `canLoadContent()`. The geometry loader knows what a
 * TGeoManager looks like, the event loader knows what an 'events' TTree looks
 * like, and neither piece of knowledge lives here.
 *
 * The router only decides. Loading is the caller's move, so a UI can open a
 * range picker for events but load geometry straight away.
 */

import { Injectable, inject } from '@angular/core';
import type {
  DataSource,
  EventDataLoader,
  FileContentProbe,
  GeometryDataLoader,
} from '@firebird/core';
import { sourceName } from '@firebird/core/loaders';
import { EVENT_LOADERS, GEOMETRY_LOADERS } from '../firebird/tokens';
import { RootFileService } from './root-file.service';

/** Where a source should go, and who takes it there. */
export type FileRoute =
  | { kind: 'geometry'; loader: GeometryDataLoader; probe?: FileContentProbe }
  | { kind: 'events'; loader: EventDataLoader; probe?: FileContentProbe }
  | { kind: 'unknown'; probe?: FileContentProbe; message: string };

@Injectable({ providedIn: 'root' })
export class FileOpenRouterService {
  private geometryLoaders = inject(GEOMETRY_LOADERS, { optional: true }) ?? [];
  private eventLoaders = inject(EVENT_LOADERS, { optional: true }) ?? [];
  private rootFiles = inject(RootFileService);

  async route(source: DataSource): Promise<FileRoute> {
    const name = sourceName(source);
    const geometryClaims = this.geometryLoaders.filter(loader => loader.canLoad(source));
    const eventClaims = this.eventLoaders.filter(loader => loader.canLoad(source));

    // Unambiguous by name: one registry claims it, take the first taker
    if (geometryClaims.length && !eventClaims.length) {
      return { kind: 'geometry', loader: geometryClaims[0] };
    }
    if (eventClaims.length && !geometryClaims.length) {
      return { kind: 'events', loader: eventClaims[0] };
    }
    if (!geometryClaims.length && !eventClaims.length) {
      return { kind: 'unknown', message: `No loader claims '${name}'. ${this.knownFormats()}` };
    }

    // Both claim the name. Only ROOT files are ambiguous this way, and only a
    // ROOT file can be probed - anything else is a registration mistake worth
    // reporting rather than guessing about.
    if (!name.split('?')[0].toLowerCase().endsWith('.root')) {
      return {
        kind: 'unknown',
        message:
          `Both a geometry and an event loader claim '${name}', and it cannot be ` +
          `inspected to tell them apart`,
      };
    }

    const probe = await this.rootFiles.probe(source);
    const geometry = geometryClaims.find(loader => loader.canLoadContent?.(probe));
    if (geometry) return { kind: 'geometry', loader: geometry, probe };
    const events = eventClaims.find(loader => loader.canLoadContent?.(probe));
    if (events) return { kind: 'events', loader: events, probe };

    return { kind: 'unknown', probe, message: this.describeUnrecognized(name, probe) };
  }

  private describeUnrecognized(name: string, probe: FileContentProbe): string {
    const contents = probe.entries
      .filter(entry => entry.name !== 'StreamerInfo')
      .map(entry => `${entry.name} (${entry.className})`)
      .join(', ');
    return (
      `'${name}' is a ROOT file, but nothing in it is recognized` +
      (contents ? `. It holds: ${contents}` : ' — it looks empty') +
      `. Firebird reads detector geometry (TGeoManager) and podio event trees ('events').`
    );
  }

  private knownFormats(): string {
    const all = [...this.geometryLoaders, ...this.eventLoaders];
    return `Known formats: ${all.map(l => `${l.meta.label} (${l.meta.fileExtensions.join(', ')})`).join('; ')}`;
  }
}
