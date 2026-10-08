/**
 * RootFileService handles: each client works on its own handle id, closing a
 * handle touches only that handle, and overlapping opens show the latest.
 * The worker is replaced by a fake that records requests and answers on
 * demand.
 */

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerConfigService } from '@dexvis/app-features';
import { RootFileService } from './root-file.service';
import type { RootFileRequest, RootFileResponse } from '../workers/root-file.protocol';

class FakeWorker {
  static instances: FakeWorker[] = [];
  readonly requests: RootFileRequest[] = [];
  onmessage: ((event: { data: RootFileResponse }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: RootFileRequest): void {
    this.requests.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Answers an open request. */
  opened(request: RootFileRequest, entryCount: number): void {
    this.onmessage?.({
      data: {
        type: 'opened',
        requestId: request.requestId,
        sourceName: `file-${request.requestId}`,
        model: 'edm4eic',
        entryCount,
        collectionGroups: ['tracker_hits'],
      },
    });
  }
}

describe('RootFileService handles', () => {
  let service: RootFileService;
  const worker = () => FakeWorker.instances[0];

  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    TestBed.inject(ServerConfigService).setUnitTestConfig({});
    service = TestBed.inject(RootFileService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sends each handle its own id, and closing one rejects only its own requests', async () => {
    const picker = service.createHandle();
    const display = service.createHandle();
    const pickerOpen = picker.open('https://h/a.root');
    const displayOpen = display.open('https://h/b.root');
    const [openA, openB] = worker().requests;
    expect(openA).toEqual(expect.objectContaining({ type: 'open', handle: picker.id }));
    expect(openB).toEqual(expect.objectContaining({ type: 'open', handle: display.id }));
    expect(picker.id).not.toBe(display.id);

    picker.close();
    await expect(pickerOpen).rejects.toThrow('The ROOT file was closed');
    expect(worker().requests[2]).toEqual(expect.objectContaining({ type: 'close', handle: picker.id }));
    expect(worker().terminated).toBe(false);

    worker().opened(openB, 7);
    expect((await displayOpen).entryCount).toBe(7);
    expect(display.openedFile()?.entryCount).toBe(7);
    expect(display.busy()).toBe(false);
  });

  it('shows the latest open of a handle when an older one answers later', async () => {
    const handle = service.createHandle();
    const first = handle.open('https://h/old.root');
    const second = handle.open('https://h/new.root');
    const [openOld, openNew] = worker().requests;
    worker().opened(openNew, 2);
    await second;
    worker().opened(openOld, 99);
    await first;
    expect(handle.openedFile()?.entryCount).toBe(2);
  });

  it('starts a fresh worker after the worker failed', async () => {
    const handle = service.createHandle();
    const open = handle.open('https://h/a.root');
    worker().onerror?.({ message: 'chunk failed to load' });
    await expect(open).rejects.toThrow('ROOT file worker error: chunk failed to load');
    expect(worker().terminated).toBe(true);
    void handle.open('https://h/a.root').catch(() => undefined);
    expect(FakeWorker.instances.length).toBe(2);
  });
});
