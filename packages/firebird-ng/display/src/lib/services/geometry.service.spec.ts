/**
 * GeometryService and its worker: the worker comes from the application's
 * factory (withWorkers), a failed worker rejects what waits on it and is
 * replaced on the next load, and an aborted load cancels the worker request.
 * The worker is a fake that records requests and answers on demand.
 */

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ServerConfigService } from '@dexvis/app-features';
import { withWorkers } from '@dexvis/firebird-ng/api';
import type { GeometryLoadRequest, WorkerResponse } from '@dexvis/firebird-ng/workers/geometry';
import { GeometryService } from './geometry.service';

class FakeWorker {
  static instances: FakeWorker[] = [];
  readonly requests: Array<{ type: string; requestId: string }> = [];
  onmessage: ((event: { data: WorkerResponse }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: GeometryLoadRequest): void {
    this.requests.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }
}

/** Lets the rule resolution before each worker request run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0));
}

describe('GeometryService worker', () => {
  const worker = (index = 0) => FakeWorker.instances[index];

  function create(registerWorkers = true): GeometryService {
    const startFake = () => new FakeWorker() as unknown as Worker;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        ...(registerWorkers ? withWorkers({ geometry: startFake, rootFile: startFake }).providers : []),
      ],
    });
    TestBed.inject(ServerConfigService).setUnitTestConfig({});
    return TestBed.inject(GeometryService);
  }

  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'time').mockImplementation(() => undefined);
    vi.spyOn(console, 'timeEnd').mockImplementation(() => undefined);
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('names the missing feature when the application registered no workers', async () => {
    await expect(create(false).loadGeometry('https://h/detector.root')).rejects.toThrow('add withWorkers');
  });

  it('rejects the waiting load when the worker fails, and starts a fresh worker for the next', async () => {
    const service = create();
    const load = service.loadGeometry('https://h/detector.root');
    await settle();
    expect(worker().requests).toEqual([expect.objectContaining({ type: 'load' })]);

    worker().onerror?.({ message: 'worker-ABC.js: 404' });
    await expect(load).rejects.toThrow('Geometry worker error: worker-ABC.js: 404');
    expect(worker().terminated).toBe(true);

    void service.loadGeometry('https://h/detector.root').catch(() => undefined);
    await settle();
    expect(FakeWorker.instances.length).toBe(2);
    expect(worker(1).requests).toEqual([expect.objectContaining({ type: 'load' })]);
  });

  it('cancels the worker request when the signal aborts, and rejects with the reason', async () => {
    const service = create();
    const abort = new AbortController();
    const load = service.loadGeometry('https://h/detector.root', { signal: abort.signal });
    await settle();
    const [request] = worker().requests;

    abort.abort(new DOMException('a newer load', 'AbortError'));
    expect(worker().requests[1]).toEqual({ type: 'cancel', requestId: request.requestId });
    worker().onmessage?.({ data: { type: 'cancelled', requestId: request.requestId } });
    await expect(load).rejects.toThrow('a newer load');
  });
});
