/**
 * provideFirebird() installs Firebird's built-ins as named sub-features, and
 * every registry follows one precedence rule: registration order, a later
 * contribution with the id of an earlier one replacing it in place,
 * `withoutFeatures()` dropping parts by feature id. Development builds warn
 * when two packs register factories for one piece type.
 */
import { TestBed } from '@angular/core/testing';
import { ApplicationInitStatus, Injectable, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  AppCommand,
  AppFeatureInput,
  CommandBusService,
  CommandHandler,
  ConfigService,
  SERVER_CONFIG_OPTIONS,
  URL_ALIASES,
  URL_SHORTHANDS,
  withCommandHandler,
  withoutFeatures,
  withServerConfig,
  withUrlAlias,
  withUrlShorthand,
} from '@dexvis/app-features';
import { getEventPieceFactory } from '@dexvis/firebird-core/model';
import type { DataExchange, DataLoaderMeta, EventDataLoader, EventPiece, EventPieceFactory } from '@dexvis/firebird-core';
import { EventPiecePainter } from '@dexvis/firebird-core';
import { provideFirebird } from './provide-firebird';
import {
  DATA_SELECTOR_TABS,
  defaultFirebirdConfig,
  firebirdFeatures,
  firebirdPack,
  GEOMETRY_CUT_LIST_CONFIG,
  GEOMETRY_ROOT_FILTER_CONFIG,
  GEOMETRY_THEME_CONFIG,
  GEOMETRY_THEMES,
  injectCameraPresets,
  injectEventLoaders,
  injectGeometryLoaders,
  LAZY_THREE_EXTENSIONS,
  PAINTERS,
  resolveRootGeometryRules,
  ROOT_GEOMETRY_RULES,
  selectRootGeometryLoadRules,
  TRAJECTORY_EXCLUDED_COLLECTIONS_CONFIG,
  withCameraPreset,
  withDataSelectorTab,
  withEventLoader,
  withEventPiece,
  withGeometryTheme,
  withPainter,
} from '@dexvis/firebird-ng/api';
import { withFirebirdBuiltins } from './with-firebird-builtins';

function boot(...features: AppFeatureInput[]): void {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideFirebird(...features),
    ],
  });
}

/** Runs the app initializers: config defaults, then the server config (answered with an empty one). */
async function initialize(): Promise<void> {
  const initStatus = TestBed.inject(ApplicationInitStatus);
  TestBed.inject(HttpTestingController).expectOne('assets/config.jsonc').flush('{}');
  await initStatus.donePromise;
}

const eventLoaderIds = () => TestBed.runInInjectionContext(() => injectEventLoaders().map(loader => loader.meta.id));
const tabIds = () => (TestBed.inject(DATA_SELECTOR_TABS, null) ?? []).map(tab => tab.id);
const cameraPresetNames = () => TestBed.runInInjectionContext(() => injectCameraPresets().map(preset => preset.name));

@Injectable()
class PackDexLoader implements EventDataLoader {
  readonly meta: DataLoaderMeta = { id: 'firebird-dex', label: 'Pack DEX', fileExtensions: ['.json'] };
  canLoad(): boolean { return true; }
  loadEvents(): Promise<DataExchange> { return Promise.reject(new Error('not called in this spec')); }
}

@Injectable()
class PackCameraPresetHandler implements CommandHandler {
  readonly type = 'camera-preset';
  readonly executed: AppCommand[] = [];
  execute(command: AppCommand): void { this.executed.push(command); }
}

/** A replacement decoder for the built-in BoxHit type. */
@Injectable()
class PackBoxHitFactory implements EventPieceFactory {
  readonly type = 'BoxHit';
  fromDexObject(): EventPiece { throw new Error('not used'); }
}

/** Two packs that both ship a decoder for one piece type. */
@Injectable()
class RingFactoryA implements EventPieceFactory {
  readonly type = 'spec.Ring';
  fromDexObject(): EventPiece { throw new Error('not used'); }
}

@Injectable()
class RingFactoryB implements EventPieceFactory {
  readonly type = 'spec.Ring';
  fromDexObject(): EventPiece { throw new Error('not used'); }
}

describe('provideFirebird built-ins', () => {
  beforeEach(() => localStorage.clear());

  it('installs every built-in part', () => {
    boot();
    expect(TestBed.inject(SERVER_CONFIG_OPTIONS).defaults).toBe(defaultFirebirdConfig);
    expect(TestBed.inject(URL_SHORTHANDS).map(shorthand => shorthand.param)).toEqual(['geometry', 'dex', 'event']);
    expect(eventLoaderIds()).toEqual(['firebird-dex', 'root2dex', 'edm4eic-root']);
    expect(TestBed.runInInjectionContext(() => injectGeometryLoaders().map(loader => loader.meta.id))).toEqual(['root-geometry']);
    expect(tabIds()).toEqual(['presets', 'physics', 'manual']);
    expect(TestBed.inject(LAZY_THREE_EXTENSIONS, null)?.length).toBe(1);
    expect(TestBed.inject(GEOMETRY_THEMES, null)?.map(theme => theme.id)).toEqual(['grey']);
    expect(cameraPresetNames()).toEqual(['front', 'back', 'right', 'left', 'top', 'bottom', 'home']);
    expect(TestBed.inject(CommandBusService).knownTypes).toEqual(expect.arrayContaining([
      'open-geometry', 'open-dex', 'show-event', 'set-config', 'camera-preset', 'animate-collision',
    ]));
  });

  it('installs the built-ins once when the application passes them again', () => {
    boot(withFirebirdBuiltins());
    expect(eventLoaderIds()).toEqual(['firebird-dex', 'root2dex', 'edm4eic-root']);
    expect(tabIds()).toEqual(['presets', 'physics', 'manual']);
    expect(TestBed.inject(LAZY_THREE_EXTENSIONS, null)?.length).toBe(1);
  });

  it('leaves the geometry pipeline off: no theme, no edit rules, no cut list', async () => {
    boot();
    await initialize();
    const config = TestBed.inject(ConfigService);
    const filterName = config.declare(GEOMETRY_ROOT_FILTER_CONFIG).value;
    const cutListName = config.declare(GEOMETRY_CUT_LIST_CONFIG).value;
    expect(filterName).toBe('off');
    expect(cutListName).toBe('off');
    expect(config.declare(GEOMETRY_THEME_CONFIG).value).toBe('off');
    // What a geometry load posts to the worker (GeometryService builds it the same way)
    const rules = await resolveRootGeometryRules(TestBed.inject(ROOT_GEOMETRY_RULES, null) ?? []);
    expect(selectRootGeometryLoadRules(rules, filterName, cutListName)).toEqual({ editRules: [], cutList: [] });
  });

  it('keeps every sim hit collection in MC-truth trajectories until a pack lists some', async () => {
    boot();
    await initialize();
    expect(TestBed.inject(ConfigService).declare(TRAJECTORY_EXCLUDED_COLLECTIONS_CONFIG).value).toBe('');
  });

  it('drops a built-in part by its feature id', () => {
    boot(withoutFeatures('firebird.navigation-cube', 'data-selector-tab:physics', 'firebird.server-conversion'));
    expect(TestBed.inject(LAZY_THREE_EXTENSIONS, null)).toBeNull();
    expect(tabIds()).toEqual(['presets', 'manual']);
    expect(eventLoaderIds()).toEqual(['firebird-dex', 'root2dex']);
  });
});

/** An event loader class with its own id that claims nothing. */
function specLoader(id: string) {
  @Injectable()
  class SpecLoader implements EventDataLoader {
    readonly meta: DataLoaderMeta = { id, label: id, fileExtensions: [`.${id}`] };
    canLoad(): boolean { return false; }
    loadEvents(): Promise<DataExchange> { return Promise.reject(new Error('not called in this spec')); }
  }
  return SpecLoader;
}

class PackBoxHitPainter extends EventPiecePainter {
  paint(): void { /* nothing to draw */ }
}

describe('registration order', () => {
  it('registers the application features after the built-ins, depth first in argument order', () => {
    boot(
      firebirdPack('outer', withEventLoader(specLoader('a')), firebirdFeatures(withEventLoader(specLoader('b')))),
      withEventLoader(specLoader('c')),
    );
    expect(eventLoaderIds()).toEqual(['firebird-dex', 'root2dex', 'edm4eic-root', 'a', 'b', 'c']);
  });

  it('keeps a built-in painter the default of its type when a pack adds another', () => {
    boot(firebirdPack('pack', withPainter(PackBoxHitPainter, { forPieceType: 'BoxHit' })));
    const boxHitPainters = (TestBed.inject(PAINTERS, null) ?? []).filter(painter => painter.forPieceType === 'BoxHit');
    expect(boxHitPainters.length).toBe(2);
    expect(boxHitPainters[0].load).toBeTypeOf('function');
    expect(boxHitPainters[1].painterClass).toBe(PackBoxHitPainter);
  });
});

describe('dropping a pack', () => {
  it('restores the built-in parts the pack had replaced', () => {
    const load = () => Promise.resolve(class {});
    boot(
      firebirdPack('my-experiment',
        withCameraPreset({ name: 'home', position: [0, 7000, 0], target: [0, 0, 0], up: [1, 0, 0] }),
        withDataSelectorTab({ id: 'manual', label: 'Pack manual', order: 30, load }),
      ),
      withoutFeatures('my-experiment'),
    );
    const home = TestBed.runInInjectionContext(() => injectCameraPresets().find(preset => preset.name === 'home'));
    expect(home).toEqual({ name: 'home', direction: [0, 1, 0], up: [1, 0, 0], fitGeometry: true });
    const manual = (TestBed.inject(DATA_SELECTOR_TABS, null) ?? []).find(tab => tab.id === 'manual');
    expect(manual?.label).toBe('Manual');
  });
});

describe('registry precedence: a later registration with the same id replaces the earlier one in place', () => {
  it('data selector tabs, by tab id', () => {
    const load = () => Promise.resolve(class {});
    boot(firebirdPack('pack', withDataSelectorTab({ id: 'manual', label: 'My files', order: 30, load })));
    const tabs = TestBed.inject(DATA_SELECTOR_TABS, null) ?? [];
    expect(tabs.map(tab => `${tab.id}:${tab.label}`)).toEqual(['presets:Presets', 'physics:Physics', 'manual:My files']);
  });

  it('event loaders, by meta.id: the replacement keeps the built-in place in the claiming order', () => {
    boot(firebirdPack('pack', withEventLoader(PackDexLoader)));
    expect(eventLoaderIds()).toEqual(['firebird-dex', 'root2dex', 'edm4eic-root']);
    expect(TestBed.runInInjectionContext(() => injectEventLoaders()[0])).toBeInstanceOf(PackDexLoader);
  });

  it('command handlers, by type', async () => {
    boot(firebirdPack('pack', withCommandHandler(PackCameraPresetHandler)));
    await TestBed.inject(CommandBusService).dispatch({ type: 'camera-preset', name: 'top' });
    const handler = TestBed.inject(CommandBusService) as unknown as { handlersByType: Map<string, CommandHandler> };
    expect(handler.handlersByType.get('camera-preset')).toBeInstanceOf(PackCameraPresetHandler);
  });

  it('camera presets, by name', () => {
    boot(firebirdPack('pack', withCameraPreset({ name: 'home', position: [0, 1, 2], target: [0, 0, 0] })));
    expect(cameraPresetNames()).toEqual(['front', 'back', 'right', 'left', 'top', 'bottom', 'home']);
    const home = TestBed.runInInjectionContext(() => injectCameraPresets().find(preset => preset.name === 'home'));
    expect(home).toEqual({ name: 'home', position: [0, 1, 2], target: [0, 0, 0] });
  });

  it('geometry themes, by id', () => {
    const load = () => Promise.resolve([]);
    boot(firebirdPack('pack', withGeometryTheme({ id: 'grey', label: 'Pack grey', load })));
    expect(TestBed.inject(GEOMETRY_THEMES, null)?.map(theme => theme.label)).toEqual(['Pack grey']);
  });

  it('URL aliases, by prefix', () => {
    boot(firebirdPack('a', withUrlAlias('data://', 'https://a/')), firebirdPack('b', withUrlAlias('data://', 'https://b/')));
    expect(TestBed.inject(URL_ALIASES)).toEqual([{ prefix: 'data://', base: 'https://b/' }]);
  });

  it('piece factories, by type: a pack replaces a built-in decoder without a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    boot(firebirdPack('pack', withEventPiece(PackBoxHitFactory)));
    TestBed.inject(ApplicationInitStatus);
    expect(getEventPieceFactory('BoxHit')).toBeInstanceOf(PackBoxHitFactory);
    expect(warn.mock.calls.map(call => String(call[0]))).not.toContainEqual(expect.stringContaining('Piece type'));
    warn.mockRestore();
  });

  it('two packs shipping factories for one piece type draw a development warning that names both', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    boot(firebirdPack('pack-a', withEventPiece(RingFactoryA)), firebirdPack('pack-b', withEventPiece(RingFactoryB)));
    TestBed.inject(ApplicationInitStatus);
    expect(getEventPieceFactory('spec.Ring')).toBeInstanceOf(RingFactoryB);
    const message = warn.mock.calls.map(call => String(call[0])).find(text => text.includes(`Piece type 'spec.Ring'`));
    expect(message).toContain('RingFactoryA (pack-a)');
    expect(message).toContain('RingFactoryB (pack-b)');
    warn.mockRestore();
  });

  it('a pack that replaces a built-in feature by id draws no collision warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    boot(firebirdPack('pack', withCameraPreset({ name: 'home', position: [0, 1, 2], target: [0, 0, 0] })));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('the server config and the URL shorthands are built-in parts: a pack replaces them without a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    boot(firebirdPack('pack', withUrlShorthand('dex', 'open-file'), withServerConfig({ url: 'my/config.jsonc' })));
    expect(warn).not.toHaveBeenCalled();
    expect(TestBed.inject(URL_SHORTHANDS)).toContainEqual({ param: 'dex', commandType: 'open-file' });
    expect(TestBed.inject(SERVER_CONFIG_OPTIONS)).toEqual({ url: 'my/config.jsonc' });
    warn.mockRestore();
  });
});
