/**
 * Which event is selected right after a load.
 *
 * `currentEntry` is a linkedSignal that follows `entries`, so it has already
 * settled on the first event by the time the loader publishes them. Adopting
 * events must therefore SELECT the first one, not step to the "next" - with one
 * event that wrapped around and looked correct, with several it showed the
 * second event while the painter drew the first.
 */

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';
import { ServerConfigService } from '@dexvis/app-features';
import { DataExchange, Event } from '@dexvis/firebird-core';
import { DataModelService } from './data-model.service';

function dexDocument(eventIds: string[]): unknown {
  return {
    type: 'firebird-dex-json',
    version: '1.0',
    events: eventIds.map(id => ({ id, pieces: [] })),
  };
}

describe('DataModelService entry selection', () => {
  let service: DataModelService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    service = TestBed.inject(DataModelService);
  });

  it('selects the first event of a multi-event document', () => {
    const data = service.loadDexObject(dexDocument(['0', '1', '2']));
    expect(data).toBeInstanceOf(DataExchange);
    expect(service.entries().length).toBe(3);
    expect(service.currentEntry()?.id).toBe('0');
  });

  it('selects the only event of a single-event document', () => {
    service.loadDexObject(dexDocument(['7']));
    expect(service.currentEntry()?.id).toBe('7');
  });

  it('rejects an object that is not DEX', () => {
    expect(service.loadDexObject({ type: 'something-else' })).toBeNull();
  });

  it('still steps forward when asked to', () => {
    service.loadDexObject(dexDocument(['0', '1', '2']));
    service.setNextEntry();
    expect(service.currentEntry()?.id).toBe('1');
    service.setNextEntry();
    service.setNextEntry();
    // wraps around
    expect((service.currentEntry() as Event).id).toBe('0');
  });
});

describe('DataModelService server conversion', () => {
  let service: DataModelService;
  const requested: string[] = [];

  beforeEach(() => {
    requested.length = 0;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    // Served by pyrobird: the convert endpoint lives at the API base URL
    TestBed.inject(ServerConfigService).setUnitTestConfig({ servedByPyrobird: true, apiBaseUrl: 'http://localhost:5454' });
    service = TestBed.inject(DataModelService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("asks the server to detect the data model ('auto'), so EDM4hep files convert too", async () => {
    vi.stubGlobal('fetch', async (input: string) => {
      requested.push(String(input));
      return new Response(JSON.stringify(dexDocument(['0', '1'])), { status: 200 });
    });
    const data = await service.fetchRootConversion('root://host//data/sim.edm4hep.root', '0-1', ['mc_trajectories']);
    expect(requested).toEqual([
      'http://localhost:5454/api/v1/convert/auto/0-1?f=' +
        encodeURIComponent('root://host//data/sim.edm4hep.root') + '&collections=mc_trajectories',
    ]);
    expect(data.events.map(event => event.id)).toEqual(['0', '1']);
    // Fetching does not replace the loaded events; the display adopts them
    expect(service.entries()).toEqual([]);
  });

  it("rejects with the server's reason for an out-of-range request", async () => {
    vi.stubGlobal('fetch', async () => new Response(
      JSON.stringify({ error: "For entries='0-5': Event 2-5 is out of range: the file holds 2 events (0..1)" }),
      { status: 400, statusText: 'BAD REQUEST' }));
    await expect(service.fetchRootConversion('root://host//f.root', '0-5'))
      .rejects.toThrow(/HTTP 400 BAD REQUEST: For entries='0-5': Event 2-5 is out of range/);
  });

  it('rejects an old DEX version with the upgrade command', () => {
    expect(() => service.parseDex({ ...dexDocument(['0']) as object, version: '0.04' }, 'old.firebird.json'))
      .toThrow(/pyrobird upgrade/);
    expect(() => service.parseDex({ type: 'other' }, 'x.json')).toThrow("'x.json' is not a Firebird DEX document");
  });
});
