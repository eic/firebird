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
import { describe, expect, it, beforeEach } from 'vitest';
import { DataExchange, Event } from '@firebird/core';
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
