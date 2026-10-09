import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, expect, it, beforeEach } from 'vitest';
import { DATA_CATALOGS } from '../tokens';
import { ConfigService } from '@dexvis/app-features';
import { DataSelectionService, SELECTION_CONFIG_KEYS, isRootSource } from './data-selection.service';

const catalog = {
  entries: [
    { name: 'nc', geometry: 'g/full.root', events: 'd/nc.firebird.zip', tags: { process: 'dis-nc' } },
    { name: 'geometry only', geometry: 'g/full.root' },
  ],
};

describe('DataSelectionService', () => {
  let service: DataSelectionService;
  let config: ConfigService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: DATA_CATALOGS, useValue: catalog, multi: true }],
    });
    service = TestBed.inject(DataSelectionService);
    config = TestBed.inject(ConfigService);
  });

  const value = (key: string) => config.getConfig<string>(key)?.value;

  it('routes .root event sources to the ROOT key and clears the DEX key, and vice versa', () => {
    expect(isRootSource('https://h/x.root?stamp=1')).toBe(true);
    expect(isRootSource('https://h/x.firebird.zip')).toBe(false);

    service.apply({ events: 'https://h/events.root', eventRange: '0-4' });
    expect(value(SELECTION_CONFIG_KEYS.rootEvents)).toBe('https://h/events.root');
    expect(value(SELECTION_CONFIG_KEYS.dexEvents)).toBe('');
    expect(value(SELECTION_CONFIG_KEYS.rootEventRange)).toBe('0-4');

    service.apply({ events: 'd/nc.firebird.zip' });
    expect(value(SELECTION_CONFIG_KEYS.dexEvents)).toBe('d/nc.firebird.zip');
    expect(value(SELECTION_CONFIG_KEYS.rootEvents)).toBe('');
  });

  it('leaves undefined fields alone and clears empty ones', () => {
    service.apply({ geometry: 'g/full.root', events: 'd/nc.firebird.zip' });
    service.apply({ events: '' });
    expect(value(SELECTION_CONFIG_KEYS.geometry)).toBe('g/full.root');
    expect(value(SELECTION_CONFIG_KEYS.dexEvents)).toBe('');
  });

  it('stashes picked files instead of writing them to config, handing them out once', () => {
    const file = new File(['x'], 'local.root');
    service.apply({ geometry: 'g/full.root' });
    service.apply({ geometry: file, events: file });
    expect(value(SELECTION_CONFIG_KEYS.geometry)).toBe('g/full.root');
    expect(value(SELECTION_CONFIG_KEYS.dexEvents)).toBe('');
    expect(value(SELECTION_CONFIG_KEYS.rootEvents)).toBe('');
    expect(service.takePickedGeometryFile()).toBe(file);
    expect(service.takePickedGeometryFile()).toBeNull();
    expect(service.takePickedEventsFile()).toBe(file);
  });

  it('derives the active catalog entry from the configured values and reloads an attached display', () => {
    const reloads: unknown[] = [];
    service.attachDisplay(parts => reloads.push(parts));
    service.apply(service.selectionForEntry(catalog.entries[0]));
    expect(service.activeEntry()?.name).toBe('nc');
    expect(reloads).toEqual([{ geometry: true, events: true }]);

    // An events-only change leaves the geometry alone
    service.apply({ collections: 'tracks' });
    expect(reloads[1]).toEqual({ geometry: false, events: true });
    service.apply({});
    expect(reloads.length).toBe(2);

    service.apply(service.selectionForEntry(catalog.entries[1]));
    expect(value(SELECTION_CONFIG_KEYS.dexEvents)).toBe('');
    expect(service.activeEntry()?.name).toBe('geometry only');
    expect(service.draft()).toEqual({});
  });
});
