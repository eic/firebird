/**
 * The code samples of README.md, compiled and run. Keep both in sync: a
 * sample that changes here changes in the README too.
 */
import { TestBed } from '@angular/core/testing';
import {
  ApplicationConfig,
  ApplicationInitStatus,
  Component,
  Injectable,
  InjectionToken,
  OnInit,
  Type,
  inject,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  AppCommand,
  AppFeature,
  COMMAND_HANDLERS,
  CommandBusService,
  CommandHandler,
  ConfigService,
  ServerConfigBase,
  ServerConfigService,
  appFeatures,
  buildDeepLink,
  contributeClass,
  isPersistableUrl,
  provideAppFeatures,
  withCommandHandler,
  withConfigDefaults,
  withConfigStorage,
  withServerConfig,
  withUrlShorthand,
} from '../public-api';

// README "Quick start": the command handler
@Injectable()
export class OpenFileCommandHandler implements CommandHandler {
  readonly type = 'open-file';
  readonly opened: string[] = [];

  fromUrlArg(arg: string): AppCommand {
    return { type: this.type, url: arg };
  }

  execute(command: AppCommand): void {
    this.opened.push(String(command['url']));
  }
}

// README "Quick start": app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(withFetch()),
    provideAppFeatures(
      withServerConfig({ defaults: { apiBaseUrl: '' } }),
      withConfigDefaults({ 'viewer.theme': 'dark' }),
      withCommandHandler(OpenFileCommandHandler),
      withUrlShorthand('file', 'open-file'),   // ?file=<url> = ?cmd=open-file:<url>
    ),
  ],
};

// README "Quick start": the page that runs the startup commands
@Component({ selector: 'app-viewer', template: '' })
export class ViewerComponent implements OnInit {
  private readonly commandBus = inject(CommandBusService);

  ngOnInit(): void {
    void this.commandBus.runStartupCommands();
  }
}

// README "Features and feature packs"
export function withFilePack(options: { verbose?: boolean } = {}): AppFeature {
  return appFeatures(
    withCommandHandler(OpenFileCommandHandler),
    withUrlShorthand('file', 'open-file'),
    options.verbose && withConfigDefaults({ 'log.level': 'debug' }),
  );
}

export interface Exporter {
  readonly format: string;
  export(data: unknown): string;
}

export const EXPORTERS = new InjectionToken<Exporter[]>('my-app.exporters');

export function withExporter(exporter: Type<Exporter>): AppFeature {
  return contributeClass(EXPORTERS, exporter);
}

// README "Server config"
export interface MyServerConfig extends ServerConfigBase {
  apiBaseUrl: string;
}

@Injectable()
class JsonExporter implements Exporter {
  readonly format = 'json';
  export(data: unknown): string { return JSON.stringify(data); }
}

describe('README samples', () => {
  const originalUrl = window.location.href;

  afterEach(() => {
    window.history.replaceState(null, '', originalUrl);
    localStorage.removeItem('viewer.theme');
    localStorage.removeItem('viewer.theme.time');
  });

  it('quick start: ?file= opens the file when the viewer page initializes', async () => {
    window.history.replaceState(null, '', '/viewer?file=https://host/run1.root');
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
    const initStatus = TestBed.inject(ApplicationInitStatus);
    TestBed.inject(HttpTestingController).expectOne('assets/config.jsonc').flush('{}');
    await initStatus.donePromise;

    const commandBus = TestBed.inject(CommandBusService);
    TestBed.createComponent(ViewerComponent).detectChanges();
    while (!commandBus.startupCommandsDone()) {
      await new Promise(resolve => setTimeout(resolve));
    }

    const handler = TestBed.inject(COMMAND_HANDLERS).find(h => h.type === 'open-file') as OpenFileCommandHandler;
    expect(handler.opened).toEqual(['https://host/run1.root']);
    expect(TestBed.inject(ConfigService).getConfigOrCreate('viewer.theme', 'code').value).toBe('dark');
    expect(TestBed.inject<ServerConfigService<MyServerConfig>>(ServerConfigService).configSignal().apiBaseUrl).toBe('');
  });

  it('feature packs compose conditionally, and contributed classes come from DI', () => {
    TestBed.configureTestingModule({
      providers: [
        ...withFilePack({ verbose: true }).providers,
        ...withExporter(JsonExporter).providers,
      ],
    });
    const exporters = TestBed.inject(EXPORTERS);
    expect(exporters.map(e => e.format)).toEqual(['json']);
    expect(withFilePack().providers.length).toBe(2);
    expect(withFilePack({ verbose: true }).providers.length).toBe(3);
  });

  it('layered config: declare, read, write', () => {
    TestBed.runInInjectionContext(() => {
      const theme = inject(ConfigService).declare({
        key: 'viewer.theme',
        default: 'dark',
        label: 'Theme',
        options: ['dark', 'light'],
      });
      theme.valueSignal();   // reactive read
      theme.value = 'light'; // runtime write: persists to localStorage
      expect(theme.valueSignal()).toBe('light');
      expect(localStorage.getItem('viewer.theme')).toBe('light');
    });
  });

  it('layered config: a URL-valued key with isPersistableUrl', () => {
    localStorage.setItem('viewer.fileUrl', 'blob:https://host/5b1c');
    TestBed.runInInjectionContext(() => {
      const fileUrl = inject(ConfigService).declare({
        key: 'viewer.fileUrl',
        default: '',
        validator: isPersistableUrl,
      });
      expect(fileUrl.value).toBe('');
    });
    localStorage.removeItem('viewer.fileUrl');
  });

  it('layered config: storage prefix', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideAppFeatures(
          withConfigStorage({ prefix: 'eiceye.' }),   // 'viewer.theme' is stored as 'eiceye.viewer.theme'
        ),
      ],
    });
    TestBed.inject(ConfigService).declare({ key: 'viewer.theme', default: 'dark' }).value = 'light';
    expect(localStorage.getItem('eiceye.viewer.theme')).toBe('light');
    localStorage.removeItem('eiceye.viewer.theme');
    localStorage.removeItem('eiceye.viewer.theme.time');
  });

  it('URL startup: buildDeepLink encodes every value', () => {
    const link = buildDeepLink('https://host/viewer', {
      params: { file: 'https://bucket.example/run1.root?X-Amz-Signature=a+b&X-Amz-Expires=600' },
      config: { 'viewer.theme': 'light' },
      commands: ['camera-preset:top', { type: 'show-event', arg: 3 }],
    });
    expect(link).toBe('https://host/viewer?file=https://bucket.example/run1.root%3FX-Amz-Signature%3Da%2Bb%26X-Amz-Expires%3D600'
      + '&config.viewer.theme=light&cmd=camera-preset:top;show-event:3');
  });

  it('server config: typed injection', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), ...withServerConfig({ defaults: { apiBaseUrl: 'http://localhost:8000' } }).providers],
    });
    TestBed.runInInjectionContext(() => {
      const serverConfig = inject<ServerConfigService<MyServerConfig>>(ServerConfigService);
      const apiBaseUrl = serverConfig.configSignal().apiBaseUrl;
      expect(apiBaseUrl).toBe('http://localhost:8000');
    });
  });

  it('commands: dispatch from code', async () => {
    TestBed.configureTestingModule({ providers: withCommandHandler(OpenFileCommandHandler).providers });
    await TestBed.runInInjectionContext(async () => {
      await inject(CommandBusService).dispatch({ type: 'open-file', url: 'a.root', source: 'ui' });
    });
    expect(TestBed.inject(CommandBusService).knownTypes).toEqual(['open-file']);
  });
});
