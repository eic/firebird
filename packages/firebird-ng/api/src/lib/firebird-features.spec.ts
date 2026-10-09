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
import { getEventPieceFactory } from '@dexvis/firebird-core/model';
import type { EventPiece, EventPieceFactory } from '@dexvis/firebird-core';
import { EventPiecePainter, type PainterMeta } from '@dexvis/firebird-core';
import {
  firebirdFeatures,
  firebirdPack,
  withCameraPreset,
  withEventPiece,
  withFirebirdUrlShorthands,
  withPainter,
} from './firebird-features';
import { CAMERA_PRESETS, PAINTERS } from './tokens';
import {
  CameraPresetCommandHandler,
  OpenDexCommandHandler,
  OpenGeometryCommandHandler,
  provideFirebird,
  ShowEventCommandHandler,
} from '@dexvis/firebird-ng';
import { defaultFirebirdConfig, ServerConfig } from './services/server-config';

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
    service.parse(new URLSearchParams('?dex=asset://data/sample.firebird.zip&geometry=exp://detector.root&event=2'));
    expect(commandBus.peekStartupCommands()).toEqual([
      { type: 'open-geometry', url: 'exp://detector.root', source: 'url' },
      { type: 'open-dex', url: 'asset://data/sample.firebird.zip', source: 'url' },
      { type: 'show-event', index: 2, source: 'url' },
    ]);
  });

  it('skips empty shorthands and queues them before ?cmd=', () => {
    service.parse(new URLSearchParams('?cmd=camera-preset:endcap&dex=&event=1'));
    expect(commandBus.peekStartupCommands()).toEqual([
      { type: 'show-event', index: 1, source: 'url' },
      { type: 'camera-preset', name: 'endcap', source: 'url' },
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

/** The values a feature contributes to one multi-provider token, in order. */
function contributions(feature: { providers: unknown[] }, token: unknown): unknown[] {
  return (feature.providers as Array<{ provide?: unknown; useValue?: unknown }>)
    .filter(provider => provider.provide === token)
    .map(provider => provider.useValue);
}

describe('firebirdFeatures', () => {
  const endcap = withCameraPreset({ name: 'endcap', position: [0, 0, 9000], target: [0, 0, 0] });
  const barrel = withCameraPreset({ name: 'barrel', position: [9000, 0, 0], target: [0, 0, 0] });

  it('skips falsy entries, so a pack can include features conditionally', () => {
    const debug = false;
    const pack = firebirdFeatures(endcap, debug && barrel, null, undefined, barrel);
    expect(contributions(pack, CAMERA_PRESETS).map(preset => (preset as { name: string }).name)).toEqual(['endcap', 'barrel']);
  });

  it('installs a feature id once: a later contribution replaces the earlier one at its position', () => {
    const closerEndcap = withCameraPreset({ name: 'endcap', position: [0, 0, 5000], target: [0, 0, 0] });
    const pack = firebirdFeatures(endcap, barrel, closerEndcap);
    expect(contributions(pack, CAMERA_PRESETS)).toEqual([
      { name: 'endcap', position: [0, 0, 5000], target: [0, 0, 0] },
      { name: 'barrel', position: [9000, 0, 0], target: [0, 0, 0] },
    ]);
  });

  it('installs a pack passed twice once', () => {
    const pack = firebirdPack('spec-pack', endcap);
    expect(contributions(firebirdFeatures(pack, barrel, pack), CAMERA_PRESETS).length).toBe(2);
  });
});

describe('withPainter', () => {
  class MetaPainter extends EventPiecePainter {
    static meta: PainterMeta = { id: 'spec-meta', forPieceTypes: ['spec.Hits', 'spec.Clusters'] };
    paint(): void { /* nothing to draw */ }
  }

  class PlainPainter extends EventPiecePainter {
    paint(): void { /* nothing to draw */ }
  }

  it('registers the painter for every type its static meta declares', () => {
    expect(contributions(withPainter(MetaPainter), PAINTERS)).toEqual([
      { forPieceType: 'spec.Hits', painterClass: MetaPainter },
      { forPieceType: 'spec.Clusters', painterClass: MetaPainter },
    ]);
  });

  it('registers for the forPieceType option instead of the meta types', () => {
    expect(contributions(withPainter(MetaPainter, { forPieceType: 'spec.Tracks' }), PAINTERS))
      .toEqual([{ forPieceType: 'spec.Tracks', painterClass: MetaPainter }]);
    expect(contributions(withPainter(PlainPainter, { forPieceType: 'spec.Tracks' }), PAINTERS))
      .toEqual([{ forPieceType: 'spec.Tracks', painterClass: PlainPainter }]);
  });

  it('throws for a painter with neither the option nor meta types', () => {
    expect(() => withPainter(PlainPainter))
      .toThrow('withPainter(PlainPainter): pass { forPieceType } or declare static meta.forPieceTypes');
  });
});
