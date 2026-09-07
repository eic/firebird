/**
 * The routing contract: the control carries facts, the loaders decide.
 *
 * These specs pin the part that is easy to get wrong later - that a `.root`
 * file goes to whichever loader recognizes what is INSIDE it, and that no
 * format knowledge leaked into the router itself.
 */

import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type {
  DataSource,
  EventDataLoader,
  FileContentProbe,
  GeometryDataLoader,
} from '@firebird/core';
import { EVENT_LOADERS, GEOMETRY_LOADERS } from '../firebird/tokens';
import { FileOpenRouterService } from './file-open-router.service';
import { RootFileService } from './root-file.service';

const GEOMETRY_PROBE: FileContentProbe = {
  name: 'epic_craterlake.root',
  entries: [
    { name: 'Default', className: 'TGeoManager' },
    { name: 'StreamerInfo', className: 'TList' },
  ],
};

const EVENTS_PROBE: FileContentProbe = {
  name: 'reco.edm4eic.root',
  entries: [
    { name: 'events', className: 'TTree' },
    { name: 'StreamerInfo', className: 'TList' },
  ],
};

const HISTOGRAM_PROBE: FileContentProbe = {
  name: 'plots.root',
  entries: [{ name: 'hMass', className: 'TH1F' }],
};

class FakeGeometryLoader implements GeometryDataLoader {
  readonly meta = { id: 'fake-geometry', label: 'Fake geometry', fileExtensions: ['.root'] };
  load = vi.fn(async () => ({ root: null }));
  canLoad(source: DataSource): boolean {
    return name(source).endsWith('.root');
  }
  canLoadContent(probe: FileContentProbe): boolean {
    return probe.entries.some(entry => entry.className === 'TGeoManager');
  }
}

class FakeEventLoader implements EventDataLoader {
  readonly meta = { id: 'fake-events', label: 'Fake events', fileExtensions: ['.root'] };
  loadEvents = vi.fn(async () => null);
  canLoad(source: DataSource): boolean {
    return name(source).endsWith('.root');
  }
  canLoadContent(probe: FileContentProbe): boolean {
    return probe.entries.some(entry => entry.name === 'events' && entry.className === 'TTree');
  }
}

/** A loader that claims a name nothing else does, and cannot be probed. */
class FakeDexLoader implements EventDataLoader {
  readonly meta = { id: 'fake-dex', label: 'Fake DEX', fileExtensions: ['.firebird.json'] };
  loadEvents = vi.fn(async () => null);
  canLoad(source: DataSource): boolean {
    return name(source).endsWith('.firebird.json');
  }
}

function name(source: DataSource): string {
  return typeof source === 'string' ? source : source.name;
}

describe('FileOpenRouterService', () => {
  let probe: ReturnType<typeof vi.fn>;

  function setup(probeResult: FileContentProbe): FileOpenRouterService {
    probe = vi.fn(async () => probeResult);
    TestBed.configureTestingModule({
      providers: [
        { provide: GEOMETRY_LOADERS, useValue: [new FakeGeometryLoader()], multi: false },
        { provide: EVENT_LOADERS, useValue: [new FakeDexLoader(), new FakeEventLoader()], multi: false },
        { provide: RootFileService, useValue: { probe } },
      ],
    });
    return TestBed.inject(FileOpenRouterService);
  }

  beforeEach(() => TestBed.resetTestingModule());

  it('sends a ROOT file holding a TGeoManager to the geometry loader', async () => {
    const router = setup(GEOMETRY_PROBE);
    const route = await router.route('epic_craterlake.root');
    expect(route.kind).toBe('geometry');
    expect(probe).toHaveBeenCalledOnce();
  });

  it('sends a ROOT file holding an events tree to the event loader', async () => {
    const router = setup(EVENTS_PROBE);
    const route = await router.route('reco.edm4eic.root');
    expect(route.kind).toBe('events');
  });

  it('routes a dropped File the same way as a URL', async () => {
    const router = setup(EVENTS_PROBE);
    const file = new File([new Uint8Array(4)], 'dropped.root');
    const route = await router.route(file);
    expect(route.kind).toBe('events');
    expect(probe).toHaveBeenCalledWith(file);
  });

  it('reports what an unrecognized ROOT file holds instead of guessing', async () => {
    const router = setup(HISTOGRAM_PROBE);
    const route = await router.route('plots.root');
    expect(route.kind).toBe('unknown');
    if (route.kind === 'unknown') {
      expect(route.message).toContain('hMass (TH1F)');
      // StreamerInfo is noise in a message meant for a human
      expect(route.message).not.toContain('StreamerInfo');
    }
  });

  it('does not probe when the name is already unambiguous', async () => {
    const router = setup(EVENTS_PROBE);
    const route = await router.route('sample.firebird.json');
    expect(route.kind).toBe('events');
    if (route.kind === 'events') expect(route.loader.meta.id).toBe('fake-dex');
    expect(probe).not.toHaveBeenCalled();
  });

  it('says so when nothing claims the source', async () => {
    const router = setup(EVENTS_PROBE);
    const route = await router.route('notes.txt');
    expect(route.kind).toBe('unknown');
    if (route.kind === 'unknown') expect(route.message).toContain('No loader claims');
    expect(probe).not.toHaveBeenCalled();
  });
});
