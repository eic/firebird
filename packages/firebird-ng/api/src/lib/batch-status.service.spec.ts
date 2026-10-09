/**
 * BatchStatusService publishes display readiness to `window.firebird`, the
 * contract `pyrobird screenshot` and other headless drivers wait on: `ready`
 * turns true once the startup commands ran and no geometry or event load is
 * in flight, also when a load failed (`errors` then says so).
 */
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { CommandBusService } from '@dexvis/app-features';
import { BatchStatusService } from './batch-status.service';

describe('BatchStatusService', () => {
  let status: BatchStatusService;
  let commandBus: CommandBusService;

  /** Runs the effect that writes window.firebird, then reads it. */
  const published = () => {
    TestBed.tick();
    return window.firebird!;
  };

  beforeEach(() => {
    delete window.firebird;
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    status = TestBed.inject(BatchStatusService);
    commandBus = TestBed.inject(CommandBusService);
  });

  afterEach(() => {
    delete window.firebird;
  });

  it('is not ready before the startup commands ran', () => {
    expect(published()).toEqual({
      geometryReady: false,
      startupCommandsDone: false,
      pendingLoads: 0,
      ready: false,
      errors: [],
    });
  });

  it('is ready once the startup commands ran and nothing is loading', async () => {
    await commandBus.runStartupCommands();
    expect(published()).toMatchObject({ startupCommandsDone: true, geometryReady: true, ready: true });
  });

  it('waits for every geometry and event load in flight', async () => {
    await commandBus.runStartupCommands();
    status.beginGeometryLoad();
    status.beginEventLoad();
    status.beginEventLoad();
    expect(published()).toMatchObject({ pendingLoads: 3, geometryReady: false, ready: false });

    status.endGeometryLoad(true);
    status.endEventLoad();
    expect(published()).toMatchObject({ pendingLoads: 1, geometryReady: true, ready: false });

    status.endEventLoad();
    expect(published()).toMatchObject({ pendingLoads: 0, ready: true });
  });

  it('reports geometry ready after a successful load even before the startup commands ran', () => {
    status.beginGeometryLoad();
    status.endGeometryLoad(true);
    expect(published()).toMatchObject({ geometryReady: true, ready: false });
  });

  it('settles after a failed load and lists the failure in errors', async () => {
    status.beginGeometryLoad();
    status.endGeometryLoad(false);
    status.addError('Geometry: HTTP 404');
    expect(published()).toMatchObject({ geometryReady: false, ready: false });

    await commandBus.runStartupCommands();
    expect(published()).toMatchObject({ geometryReady: true, ready: true, errors: ['Geometry: HTTP 404'] });
  });

  it('never counts below zero when a load ends twice', async () => {
    await commandBus.runStartupCommands();
    status.endEventLoad();
    status.endGeometryLoad(false);
    status.beginEventLoad();
    expect(published()).toMatchObject({ pendingLoads: 1, ready: false });
  });
});
