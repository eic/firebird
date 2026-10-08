/**
 * Firebird's contributions to the shared startup machinery: the URL
 * shorthand grammar (`dex`, `geometry`, `event`), the server config
 * defaults, and event piece factory registration in provideFirebird().
 * The mechanism itself (config.* params, ?cmd=, server-before-URL ordering)
 * is covered by the @dexvis/app-features suite.
 */
import { TestBed } from '@angular/core/testing';
import { ApplicationInitStatus, Injectable, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CommandBusService, ServerConfigService, UrlStartupService, withCommandHandler } from '@dexvis/app-features';
import { getEventPieceFactory } from '@dexvis/firebird-core/model/event-piece';
import type { EventPiece, EventPieceFactory } from '@dexvis/firebird-core';
import { provideFirebird, withEventPiece, withFirebirdUrlShorthands } from './firebird-features';
import {
  CameraPresetCommandHandler,
  OpenDexCommandHandler,
  OpenGeometryCommandHandler,
  ShowEventCommandHandler,
} from './builtin-command-handlers';
import { defaultFirebirdConfig, ServerConfig } from '../services/server-config';

@Injectable()
class SpecPieceFactory implements EventPieceFactory {
  readonly type = 'spec.FirebirdFeaturesPiece';
  fromDexObject(): EventPiece { throw new Error('not used'); }
}

describe('Firebird URL shorthands', () => {
  let service: UrlStartupService;
  let commandBus: CommandBusService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        ...withFirebirdUrlShorthands().providers,
        // The built-in handlers build the shorthand commands (fromUrlArg).
        ...withCommandHandler(OpenGeometryCommandHandler).providers,
        ...withCommandHandler(OpenDexCommandHandler).providers,
        ...withCommandHandler(ShowEventCommandHandler).providers,
        ...withCommandHandler(CameraPresetCommandHandler).providers,
      ],
    });
    service = TestBed.inject(UrlStartupService);
    commandBus = TestBed.inject(CommandBusService);
    TestBed.inject(ServerConfigService).setUnitTestConfig({});
  });

  it('turns dex/geometry/event shorthands into queued commands', () => {
    service.parse(new URLSearchParams('?dex=asset://data/sample.firebird.zip&geometry=epic://epic.root&event=2'));
    expect(commandBus.peekStartupCommands()).toEqual([
      { type: 'open-geometry', url: 'epic://epic.root', source: 'url' },
      { type: 'open-dex', url: 'asset://data/sample.firebird.zip', source: 'url' },
      { type: 'show-event', index: 2, source: 'url' },
    ]);
  });

  it('skips empty shorthands and queues them before ?cmd=', () => {
    service.parse(new URLSearchParams('?cmd=camera-preset:farforward&dex=&event=1'));
    expect(commandBus.peekStartupCommands()).toEqual([
      { type: 'show-event', index: 1, source: 'url' },
      { type: 'camera-preset', name: 'farforward', source: 'url' },
    ]);
  });
});

describe('provideFirebird', () => {
  it('boots with Firebird server config defaults, registers piece factories, and queues server commands', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideFirebird(withEventPiece(SpecPieceFactory)),
      ],
    });
    const serverConfig = TestBed.inject<ServerConfigService<ServerConfig>>(ServerConfigService);
    // Before the load answers, the config is Firebird's defaults.
    expect(serverConfig.configSignal()).toEqual(defaultFirebirdConfig);
    expect(getEventPieceFactory('spec.FirebirdFeaturesPiece')).toBeInstanceOf(SpecPieceFactory);

    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne('assets/config.jsonc').flush(JSON.stringify({
      servedByPyrobird: true,
      startupCommands: ['show-event:4'],
    }));
    await TestBed.inject(ApplicationInitStatus).donePromise;

    expect(serverConfig.config.servedByPyrobird).toBe(true);
    expect(serverConfig.config.apiBaseUrl).toBe(''); // default kept
    expect(TestBed.inject(CommandBusService).peekStartupCommands().map(c => [c.type, c.source]))
      .toEqual([['show-event', 'server']]);
    httpMock.verify();
  });
});
