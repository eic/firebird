import { Injectable, computed, inject, signal } from '@angular/core';
import type { DataCatalogEntry, DataSource } from '@dexvis/firebird-core';
import { ConfigService } from '@dexvis/app-features';
import { DataCatalogService } from './data-catalog.service';
import {
  DEX_EVENTS_SOURCE_CONFIG,
  GEOMETRY_URL_CONFIG,
  ROOT_COLLECTIONS_CONFIG,
  ROOT_EVENT_RANGE_CONFIG,
  ROOT_EVENTS_SOURCE_CONFIG,
} from '../config-keys';

/**
 * What the user chose in the data selector. Each field: `undefined` = leave
 * the current setting alone, `''` = clear it, a string = a URL, a File = a
 * picked/dropped local file (read in place, never uploaded, never persisted).
 */
export interface DataSelection {
  geometry?: DataSource | '';
  events?: DataSource | '';
  /** Event numbers to convert when `events` is a ROOT file: '0', '0-4', '1,3'. */
  eventRange?: string;
  /** Collection groups to convert when `events` is a ROOT file ('' = all). */
  collections?: string;
  /** Catalog entry the selection came from, when it did. */
  entry?: DataCatalogEntry;
}

/** Which halves of a selection changed — what a display reload has to touch. */
export interface SelectionParts {
  geometry: boolean;
  events: boolean;
}

/**
 * Config keys the selection writes. Deep links, pyrobird config and yaml use
 * the same keys; their defaults and validators live in `config-keys.ts`.
 */
export const SELECTION_CONFIG_KEYS = {
  geometry: GEOMETRY_URL_CONFIG.key,
  dexEvents: DEX_EVENTS_SOURCE_CONFIG.key,
  rootEvents: ROOT_EVENTS_SOURCE_CONFIG.key,
  rootEventRange: ROOT_EVENT_RANGE_CONFIG.key,
  rootCollections: ROOT_COLLECTIONS_CONFIG.key,
} as const;

/** A `.root` source goes to the ROOT event keys, anything else to the DEX key. */
export function isRootSource(source: DataSource): boolean {
  const name = typeof source === 'string' ? source.split('?')[0].split('#')[0] : source.name;
  return /\.root$/i.test(name);
}

/**
 * The one "apply" path of the data selector, shared by the display toolbar
 * panel and the config page: the selection is written to the config keys
 * (`geometry.selectedGeometry`, `events.dexEventsSource`, ...), and a live
 * display then reloads from those keys — the same load the display runs at
 * startup. The config page has no display; it writes the keys and navigates,
 * and the display page picks them up on init.
 *
 * Picked local Files cannot live in config (a blob URL dies with the page and
 * loses the file name that decides the loader), so they wait in a stash that
 * the display's config load consumes first. The config keys keep their last
 * URL meanwhile: after a reload the URL loads again, the file is gone.
 */
@Injectable({ providedIn: 'root' })
export class DataSelectionService {
  private readonly config = inject(ConfigService);
  private readonly catalog = inject(DataCatalogService);

  /** The selection tabs build up; the host's Show button applies it. */
  readonly draft = signal<DataSelection>({});

  private pickedGeometryFile: File | null = null;
  private pickedEventsFile: File | null = null;
  private displayReload: ((parts: SelectionParts) => void) | null = null;
  /** Parts applied while no display was attached; the next display mount loads them. */
  private pendingReload: SelectionParts = { geometry: false, events: false };

  private readonly geometryKey = this.config.declare(GEOMETRY_URL_CONFIG);
  private readonly dexEventsKey = this.config.declare(DEX_EVENTS_SOURCE_CONFIG);
  private readonly rootEventsKey = this.config.declare(ROOT_EVENTS_SOURCE_CONFIG);
  private readonly rootEventRangeKey = this.config.declare(ROOT_EVENT_RANGE_CONFIG);
  private readonly rootCollectionsKey = this.config.declare(ROOT_COLLECTIONS_CONFIG);

  /** Configured geometry URL (reactive). */
  readonly configuredGeometry = computed(() => this.geometryKey.valueSignal() || '');
  /** Configured events URL — the DEX key, or the ROOT key when the DEX key is empty (reactive). */
  readonly configuredEvents = computed(() => this.dexEventsKey.valueSignal() || this.rootEventsKey.valueSignal() || '');
  readonly configuredEventRange = computed(() => this.rootEventRangeKey.valueSignal() || ROOT_EVENT_RANGE_CONFIG.default);
  readonly configuredCollections = computed(() => this.rootCollectionsKey.valueSignal() || '');

  /** The catalog entry whose geometry and events match the configured values, if any. */
  readonly activeEntry = computed<DataCatalogEntry | null>(() => {
    const geometry = this.configuredGeometry();
    const events = this.configuredEvents();
    return this.catalog.entries().find(entry =>
      (entry.geometry ?? '') === geometry && (entry.events ?? '') === events) ?? null;
  });

  /** True when the draft would change something. */
  readonly draftHasChanges = computed(() => {
    const draft = this.draft();
    return draft.geometry !== undefined || draft.events !== undefined
      || draft.eventRange !== undefined || draft.collections !== undefined;
  });

  /**
   * The selection a catalog entry stands for. An entry without geometry keeps
   * the loaded geometry (event-only datasets); an entry without events shows
   * none (a "geometry only" preset clears the events).
   */
  selectionForEntry(entry: DataCatalogEntry): DataSelection {
    const events = entry.events ?? '';
    const isRoot = events !== '' && isRootSource(events);
    return {
      geometry: entry.geometry,
      events,
      eventRange: isRoot ? (entry.eventRange ?? ROOT_EVENT_RANGE_CONFIG.default) : undefined,
      collections: isRoot ? (entry.collections ?? '') : undefined,
      entry,
    };
  }

  updateDraft(patch: DataSelection): void {
    this.draft.update(draft => ({ ...draft, ...patch }));
  }

  clearDraft(): void {
    this.draft.set({});
  }

  /**
   * The display registers how it reloads from config; `apply()` calls it
   * after writing the keys, with the parts the selection touched — an
   * events-only change must not reload the geometry (a picked geometry file
   * has no URL to dedupe on and would be replaced by the configured URL).
   * Registered by EventDisplayService while a display page is mounted, so
   * the selection service never imports the display stack.
   */
  attachDisplay(reload: (parts: SelectionParts) => void): void {
    this.displayReload = reload;
  }

  detachDisplay(): void {
    this.displayReload = null;
  }

  /**
   * Writes the selection to config, stashes picked files, and reloads a live
   * display. Without one (the config page), the applied parts are remembered
   * for the next display mount (`takePendingReload()`): the user asked for
   * them, so that mount loads them even when the config value did not change.
   */
  apply(selection: DataSelection = this.draft()): void {
    if (selection.geometry !== undefined) {
      if (selection.geometry instanceof File) {
        this.pickedGeometryFile = selection.geometry;
      } else {
        this.pickedGeometryFile = null;
        this.geometryKey.value = selection.geometry;
      }
    }
    if (selection.events !== undefined) {
      if (selection.events instanceof File) {
        this.pickedEventsFile = selection.events;
        // A stashed file loads INSTEAD of the URL keys, so both keys are
        // cleared to keep the startup load from also fetching the old URL
        this.dexEventsKey.value = '';
        this.rootEventsKey.value = '';
      } else {
        this.pickedEventsFile = null;
        // One events field, two keys: the other key is cleared so the startup
        // load (which runs both) does not load two datasets
        const isRoot = selection.events !== '' && isRootSource(selection.events);
        this.rootEventsKey.value = isRoot ? selection.events : '';
        this.dexEventsKey.value = isRoot ? '' : selection.events;
      }
    }
    if (selection.eventRange !== undefined) {
      this.rootEventRangeKey.value = selection.eventRange.trim() || ROOT_EVENT_RANGE_CONFIG.default;
    }
    if (selection.collections !== undefined) {
      this.rootCollectionsKey.value = selection.collections;
    }
    this.draft.set({});
    const parts: SelectionParts = {
      geometry: selection.geometry !== undefined,
      events: selection.events !== undefined || selection.eventRange !== undefined || selection.collections !== undefined,
    };
    if (!parts.geometry && !parts.events) return;
    if (this.displayReload) {
      this.displayReload(parts);
    } else {
      this.pendingReload = {
        geometry: this.pendingReload.geometry || parts.geometry,
        events: this.pendingReload.events || parts.events,
      };
    }
  }

  /** Hands out (once) the parts applied while no display was attached. */
  takePendingReload(): SelectionParts {
    const parts = this.pendingReload;
    this.pendingReload = { geometry: false, events: false };
    return parts;
  }

  /** Hands the stashed geometry file to the loader (once). */
  takePickedGeometryFile(): File | null {
    const file = this.pickedGeometryFile;
    this.pickedGeometryFile = null;
    return file;
  }

  /** Hands the stashed events file to the loader (once). */
  takePickedEventsFile(): File | null {
    const file = this.pickedEventsFile;
    this.pickedEventsFile = null;
    return file;
  }
}
