import { Injectable, computed, inject, signal } from '@angular/core';
// Subpath import: this service is reachable from the initial bundle, and the
// core barrel re-exports the painters, which pull three.js into startup.
import {
  DataCatalog,
  DataCatalogEntry,
  catalogEventSources,
  catalogGeometrySources,
  mergeDataCatalogs,
} from '@dexvis/firebird-core/data-catalog';
import { DATA_CATALOGS } from '../tokens';
import { ConfigService, ServerConfigService, isPersistableUrl } from '@dexvis/app-features';
import type { ServerConfig } from './server-config';
import { UrlService } from './url.service';

/** Config key: URL of a remote catalog JSON file (a `DataCatalog` object), '' = none. */
export const CATALOG_URL_CONFIG_KEY = 'catalog.url';

/**
 * The merged data catalog: what the data selector offers as presets, physics
 * facets and manual pick lists.
 *
 * Sources, merged in this order (later entries append; same-key facets merge):
 * 1. `withDataCatalog()` features of the packs the app is assembled from
 * 2. the server's config.jsonc `dataCatalog` object (pyrobird passes it through)
 * 3. a remote catalog file named by the `catalog.url` config key
 *
 * The remote file is fetched on the first `ensureRemoteLoaded()` call — the
 * data selector makes it when it opens — never at app start, so a slow or
 * missing catalog host does not delay every page load.
 */
@Injectable({ providedIn: 'root' })
export class DataCatalogService {
  private readonly packCatalogs = inject(DATA_CATALOGS, { optional: true }) ?? [];
  private readonly serverConfig = inject<ServerConfigService<ServerConfig>>(ServerConfigService);
  private readonly config = inject(ConfigService);
  private readonly urls = inject(UrlService);

  private readonly remoteCatalog = signal<DataCatalog | null>(null);
  private remoteLoad: Promise<void> | null = null;

  /** Error text of the last failed remote fetch, for the UI to show. */
  readonly remoteError = signal<string | null>(null);

  private readonly catalogUrl = this.config.declare<string>({
    key: CATALOG_URL_CONFIG_KEY,
    default: '',
    validator: isPersistableUrl,
    label: 'Remote data catalog URL',
    group: 'Data',
  });

  /** Everything merged. Recomputes when the server config or the remote catalog arrives. */
  readonly catalog = computed<DataCatalog>(() => mergeDataCatalogs([
    ...this.packCatalogs,
    this.serverConfig.configSignal().dataCatalog,
    this.remoteCatalog(),
  ]));

  readonly entries = computed<DataCatalogEntry[]>(() => this.catalog().entries ?? []);
  readonly facets = computed(() => this.catalog().facets ?? []);
  readonly geometrySources = computed(() => catalogGeometrySources(this.catalog()));
  readonly eventSources = computed(() => catalogEventSources(this.catalog()));

  /** True when no source contributed anything. Catalog-only tabs hide themselves then. */
  readonly isEmpty = computed(() =>
    this.entries().length === 0 && this.geometrySources().length === 0 && this.eventSources().length === 0);

  /** Fetches the `catalog.url` file once. Resolves (never rejects) — failures land in `remoteError`. */
  ensureRemoteLoaded(): Promise<void> {
    if (this.remoteLoad) return this.remoteLoad;
    const url = (this.catalogUrl.value || '').trim();
    if (!url) return Promise.resolve();
    this.remoteLoad = (async () => {
      try {
        const response = await fetch(this.urls.resolveDownloadUrl(url));
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
        const catalog = await response.json() as DataCatalog;
        if (!catalog || typeof catalog !== 'object') throw new Error('not a JSON object');
        this.remoteCatalog.set(catalog);
        this.remoteError.set(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[DataCatalog] failed to load remote catalog '${url}': ${message}`);
        this.remoteError.set(`Remote catalog '${url}' failed to load: ${message}`);
      }
    })();
    return this.remoteLoad;
  }
}
