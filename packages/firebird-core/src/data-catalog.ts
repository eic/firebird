/**
 * Data catalog: the datasets an installation offers to open — named presets
 * (geometry + events), tagged so a UI can filter them by physics facets, and
 * plain URL lists for manual pick.
 *
 * Plain TS on purpose: pyrobird serves the same JSON shape through
 * config.jsonc (`dataCatalog`), a remote catalog file has this shape too, and
 * experiment packs contribute it through `withDataCatalog()` in the Angular
 * app. Helpers here are pure so the same filtering runs in any host.
 */

/** One dataset: what to load, and how it is described and tagged. */
export interface DataCatalogEntry {
  /** Display name in preset lists. */
  name: string;
  /** One or two sentences shown under the name. */
  description?: string;
  /** Web page with more information about the dataset. */
  link?: string;
  /** Detector geometry URL. Absent: keep whatever geometry is loaded/configured. */
  geometry?: string;
  /** Event data URL: a DEX file, or a ROOT file the loaders can convert. */
  events?: string;
  /** Event numbers to convert when `events` is a ROOT file: '0', '0-4', '1,3'. */
  eventRange?: string;
  /** Collection groups to convert when `events` is a ROOT file ('' or absent = all). */
  collections?: string;
  /**
   * Facet values, e.g. `{ process: 'dis-nc', beam: '10x100', minQ2: '1000' }`.
   * Keys are free; the facets an installation declares decide which keys a
   * physics-selection UI turns into choices.
   */
  tags?: Record<string, string>;
}

/** Description of one tag value: what a UI shows when the value is chosen. */
export interface DataCatalogFacetValue {
  /** Chip caption; the raw tag value when absent. */
  label?: string;
  /** Explanation shown when the value is selected. */
  description?: string;
  /** Web page with more information. */
  link?: string;
}

/** One selectable dimension of the physics picker: a tag key with its known values. */
export interface DataCatalogFacet {
  /** Tag key in `DataCatalogEntry.tags`. */
  key: string;
  /** Row caption, e.g. 'Process', 'Beam'. */
  label: string;
  /**
   * Known values in display order, with captions and descriptions. Values
   * that entries use but this map omits are still offered, after these, in
   * first-seen order.
   */
  values?: Record<string, DataCatalogFacetValue>;
}

/** Everything one source (pack, server, remote file) contributes. */
export interface DataCatalog {
  entries?: DataCatalogEntry[];
  facets?: DataCatalogFacet[];
  /** Extra geometry URLs offered for manual pick, beyond those of `entries`. */
  geometrySources?: string[];
  /** Extra event data URLs offered for manual pick, beyond those of `entries`. */
  eventSources?: string[];
}

/** Merges catalogs in order; facets with the same key merge their value maps (later wins). */
export function mergeDataCatalogs(catalogs: ReadonlyArray<DataCatalog | null | undefined>): DataCatalog {
  const merged: Required<DataCatalog> = { entries: [], facets: [], geometrySources: [], eventSources: [] };
  const facetsByKey = new Map<string, DataCatalogFacet>();
  for (const catalog of catalogs) {
    if (!catalog) continue;
    merged.entries.push(...(catalog.entries ?? []));
    merged.geometrySources.push(...(catalog.geometrySources ?? []));
    merged.eventSources.push(...(catalog.eventSources ?? []));
    for (const facet of catalog.facets ?? []) {
      const existing = facetsByKey.get(facet.key);
      if (existing) {
        facetsByKey.set(facet.key, { ...existing, ...facet, values: { ...existing.values, ...facet.values } });
      } else {
        facetsByKey.set(facet.key, { ...facet, values: { ...facet.values } });
      }
    }
  }
  merged.facets = [...facetsByKey.values()];
  return merged;
}

/** Distinct values of `key` across entries: the facet's declared order first, then first-seen order. */
export function facetValues(entries: ReadonlyArray<DataCatalogEntry>, facet: DataCatalogFacet): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    const value = entry.tags?.[facet.key];
    if (value !== undefined) seen.add(value);
  }
  const declared = Object.keys(facet.values ?? {}).filter(value => seen.has(value));
  const undeclared = [...seen].filter(value => !(value in (facet.values ?? {})));
  return [...declared, ...undeclared];
}

/** Entries whose tags carry every selected value (an empty selection matches all). */
export function matchEntries(
  entries: ReadonlyArray<DataCatalogEntry>,
  selectedTags: Readonly<Record<string, string>>,
): DataCatalogEntry[] {
  const wanted = Object.entries(selectedTags);
  return entries.filter(entry => wanted.every(([key, value]) => entry.tags?.[key] === value));
}

/** Distinct, order-preserving list of geometry URLs the catalog offers. */
export function catalogGeometrySources(catalog: DataCatalog): string[] {
  return distinct([
    ...(catalog.entries ?? []).map(entry => entry.geometry),
    ...(catalog.geometrySources ?? []),
  ]);
}

/** Distinct, order-preserving list of event data URLs the catalog offers. */
export function catalogEventSources(catalog: DataCatalog): string[] {
  return distinct([
    ...(catalog.entries ?? []).map(entry => entry.events),
    ...(catalog.eventSources ?? []),
  ]);
}

function distinct(values: ReadonlyArray<string | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}
