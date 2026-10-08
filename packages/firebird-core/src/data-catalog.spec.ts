import { describe, expect, it } from 'vitest';
import {
  DataCatalogEntry,
  catalogEventSources,
  catalogGeometrySources,
  facetValues,
  matchEntries,
  mergeDataCatalogs,
} from './data-catalog';

const entries: DataCatalogEntry[] = [
  { name: 'nc 10x100', geometry: 'g/full.root', events: 'd/nc_10x100.zip', tags: { process: 'dis-nc', beam: '10x100' } },
  { name: 'cc 10x100', geometry: 'g/full.root', events: 'd/cc_10x100.zip', tags: { process: 'dis-cc', beam: '10x100' } },
  { name: 'nc 18x275', geometry: 'g/tracking.root', events: 'd/nc_18x275.zip', tags: { process: 'dis-nc', beam: '18x275' } },
  { name: 'geometry only', geometry: 'g/full.root' },
];

describe('data catalog helpers', () => {
  it('matches entries on every selected tag; empty selection matches all', () => {
    expect(matchEntries(entries, {}).length).toBe(4);
    expect(matchEntries(entries, { process: 'dis-nc' }).map(e => e.name)).toEqual(['nc 10x100', 'nc 18x275']);
    expect(matchEntries(entries, { process: 'dis-nc', beam: '10x100' }).map(e => e.name)).toEqual(['nc 10x100']);
    expect(matchEntries(entries, { process: 'dis-cc', beam: '18x275' })).toEqual([]);
  });

  it('lists facet values in declared order first, then first-seen', () => {
    const facet = { key: 'beam', label: 'Beam', values: { '18x275': { label: '18 x 275' }, '5x41': {} } };
    // 5x41 is declared but unused, so it is not offered
    expect(facetValues(entries, facet)).toEqual(['18x275', '10x100']);
    expect(facetValues(entries, { key: 'process', label: 'Process' })).toEqual(['dis-nc', 'dis-cc']);
  });

  it('merges catalogs and their facet value maps', () => {
    const merged = mergeDataCatalogs([
      { entries: entries.slice(0, 1), facets: [{ key: 'beam', label: 'Beam', values: { '10x100': { label: 'a' } } }] },
      null,
      { entries: entries.slice(1), facets: [{ key: 'beam', label: 'Beam energy', values: { '18x275': {} } }], geometrySources: ['g/extra.root'] },
    ]);
    expect(merged.entries.length).toBe(4);
    expect(merged.facets).toEqual([{ key: 'beam', label: 'Beam energy', values: { '10x100': { label: 'a' }, '18x275': {} } }]);
    expect(catalogGeometrySources(merged)).toEqual(['g/full.root', 'g/tracking.root', 'g/extra.root']);
    expect(catalogEventSources(merged)).toEqual(['d/nc_10x100.zip', 'd/cc_10x100.zip', 'd/nc_18x275.zip']);
  });
});
