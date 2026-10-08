/**
 * Feature composition and the startup sequence of provideAppFeatures():
 * feature defaults -> server config -> URL, with the full precedence chain
 * `defaults < server < localStorage < URL < runtime` checked end to end.
 */
import { TestBed } from '@angular/core/testing';
import {
  ApplicationInitStatus,
  InjectionToken,
  inject,
  provideAppInitializer,
  provideZonelessChangeDetection,
} from '@angular/core';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  AppFeature,
  appFeatures,
  contributeClass,
  contributeValue,
  provideAppFeatures,
  withConfigDefaults,
  withUrlAlias,
  withUrlShorthand,
} from './features';
import { CONFIG_DEFAULTS, URL_ALIASES, URL_SHORTHANDS } from './tokens';
import { ConfigService } from './config.service';
import { CommandBusService } from './command-bus.service';
import { DEFAULT_SERVER_CONFIG_URL } from './server-config.service';

const WIDGETS = new InjectionToken<Array<{ name: string }>>('spec.widgets');

class ClassWidget {
  readonly name = 'class-widget';
}

/** Collects the multi-provider values of `token` for `features`. */
function collect<T>(token: InjectionToken<T[]>, ...features: AppFeature[]): T[] {
  TestBed.configureTestingModule({ providers: appFeatures(...features).providers });
  return TestBed.inject(token);
}

describe('appFeatures composition', () => {
  it('flattens arrays, skips falsy entries, and keeps argument order', () => {
    const flag = false as boolean;
    const composed = appFeatures(
      contributeValue(WIDGETS, { name: 'a' }),
      [contributeValue(WIDGETS, { name: 'b' }), contributeValue(WIDGETS, { name: 'c' })],
      flag && contributeValue(WIDGETS, { name: 'skipped' }),
      null,
      undefined,
      appFeatures(contributeValue(WIDGETS, { name: 'd' })),
    );
    expect(collect(WIDGETS, composed).map(w => w.name)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('contributeClass instantiates the class through DI', () => {
    const widgets = collect(WIDGETS, contributeClass(WIDGETS, ClassWidget));
    expect(widgets[0]).toBeInstanceOf(ClassWidget);
  });

  it('the built-in with*() functions contribute to their tokens', () => {
    TestBed.configureTestingModule({
      providers: appFeatures(
        withConfigDefaults({ 'a.b': 1 }),
        withUrlAlias('data://', 'https://host/data/'),
        withUrlShorthand('file', 'open-file'),
      ).providers,
    });
    expect(TestBed.inject(CONFIG_DEFAULTS)).toEqual([{ 'a.b': 1 }]);
    expect(TestBed.inject(URL_ALIASES)).toEqual([{ prefix: 'data://', base: 'https://host/data/' }]);
    expect(TestBed.inject(URL_SHORTHANDS)).toEqual([{ param: 'file', commandType: 'open-file' }]);
  });
});

describe('provideAppFeatures startup', () => {
  const KEY = 'spec.features.layered';
  const originalUrl = window.location.href;

  beforeEach(() => {
    localStorage.removeItem(KEY);
    localStorage.removeItem(`${KEY}.time`);
  });

  afterEach(() => {
    window.history.replaceState(null, '', originalUrl);
    localStorage.removeItem(KEY);
    localStorage.removeItem(`${KEY}.time`);
  });

  /**
   * Boots the test module through provideAppFeatures, answers the server
   * config request with `serverFile`, and waits for the app initializers.
   */
  async function boot(serverFile: object, ...features: AppFeature[]): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideAppFeatures(...features),
      ],
    });
    // Injecting anything creates the module and starts the initializers.
    const initStatus = TestBed.inject(ApplicationInitStatus);
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(DEFAULT_SERVER_CONFIG_URL).flush(JSON.stringify(serverFile));
    await initStatus.donePromise;
    httpMock.verify();
  }

  it('runs feature initializers, then defaults -> server -> URL, and queues URL commands', async () => {
    window.history.replaceState(null, '', '/?file=https%3A%2F%2Fhost%2Fa.root&cmd=show-event:1');
    const seenAtFeatureInit: unknown[] = [];
    await boot(
      { startupCommands: ['open-file:https://host/server.root'] },
      withUrlShorthand('file', 'open-file'),
      {
        providers: [provideAppInitializer(() => {
          // A feature initializer declares its key before the shared startup runs.
          seenAtFeatureInit.push(inject(ConfigService).declare({ key: KEY, default: 'code' }).value);
        })],
      },
      withConfigDefaults({ [KEY]: 'pack' }),
    );
    expect(seenAtFeatureInit).toEqual(['code']);
    expect(TestBed.inject(ConfigService).getConfigOrThrow(KEY).value).toBe('pack');
    expect(TestBed.inject(CommandBusService).peekStartupCommands().map(c => [c.type, c.source])).toEqual([
      ['open-file', 'server'],
      ['open-file', 'url'],
      ['show-event', 'url'],
    ]);
  });

  it('resolves defaults < server < localStorage < URL < runtime end to end', async () => {
    const declare = () => TestBed.inject(ConfigService).declare({ key: KEY, default: 'code' });

    // defaults: the pack default replaces the code default
    await boot({}, withConfigDefaults({ [KEY]: 'pack' }));
    expect(declare().value).toBe('pack');

    // server beats defaults
    TestBed.resetTestingModule();
    await boot({ userConfigs: { [KEY]: 'server' } }, withConfigDefaults({ [KEY]: 'pack' }));
    expect(declare().value).toBe('server');

    // localStorage beats server
    TestBed.resetTestingModule();
    localStorage.setItem(KEY, 'stored');
    await boot({ userConfigs: { [KEY]: 'server' } }, withConfigDefaults({ [KEY]: 'pack' }));
    expect(declare().value).toBe('stored');

    // URL beats localStorage, and is not persisted
    TestBed.resetTestingModule();
    window.history.replaceState(null, '', `/?config.${KEY}=url`);
    await boot({ userConfigs: { [KEY]: 'server' } }, withConfigDefaults({ [KEY]: 'pack' }));
    const property = declare();
    expect(property.value).toBe('url');
    expect(localStorage.getItem(KEY)).toBe('stored');

    // runtime beats URL, persists, and ends the session override
    property.value = 'runtime';
    expect(property.value).toBe('runtime');
    expect(property.hasSessionOverride).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('runtime');
  });
});
