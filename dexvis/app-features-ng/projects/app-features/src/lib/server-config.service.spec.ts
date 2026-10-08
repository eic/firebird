/**
 * ServerConfigService: JSONC fetch and parse, merge over the defaults, the
 * SERVER layer feed, and the failure path.
 */
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ServerConfigBase, ServerConfigService, DEFAULT_SERVER_CONFIG_URL } from './server-config.service';
import { ConfigService } from './config.service';
import { appFeatures, withServerConfig } from './features';

/** An application's server config shape. */
interface TestServerConfig extends ServerConfigBase {
  apiBaseUrl: string;
  logLevel: string;
  servedByBackend: boolean;
}

const defaults: TestServerConfig = { apiBaseUrl: '', logLevel: 'warn', servedByBackend: false, configs: [] };

function setup(options?: { url?: string; defaults?: TestServerConfig }) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      ...(options ? appFeatures(withServerConfig(options)).providers : []),
    ],
  });
  return {
    service: TestBed.inject<ServerConfigService<TestServerConfig>>(ServerConfigService),
    httpMock: TestBed.inject(HttpTestingController),
    configService: TestBed.inject(ConfigService),
  };
}

describe('ServerConfigService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify(); // No outstanding requests.
  });

  it('fetches and parses JSONC data (comments allowed) and merges it over the defaults', async () => {
    const { service, httpMock } = setup({ defaults });
    const loadPromise = service.loadConfig();

    const req = httpMock.expectOne(DEFAULT_SERVER_CONFIG_URL);
    expect(req.request.method).toBe('GET');
    req.flush('{\n  // set by the backend\n  "apiBaseUrl": "http://localhost:5454", "logLevel": "info"\n}');
    await loadPromise;

    expect(service.config.apiBaseUrl).toBe('http://localhost:5454');
    expect(service.config.logLevel).toBe('info');
    expect(service.config.servedByBackend).toBe(false); // from the defaults
    expect(service.configSignal().apiBaseUrl).toBe('http://localhost:5454');
  });

  it('starts from a copy of the defaults before the load', () => {
    const { service } = setup({ defaults });
    expect(service.configSignal()).toEqual(defaults);
    expect(service.configSignal()).not.toBe(defaults);
  });

  it('fetches from the URL given through withServerConfig', async () => {
    const { service, httpMock } = setup({ url: 'cfg/app.jsonc' });
    const loadPromise = service.loadConfig();
    httpMock.expectOne('cfg/app.jsonc').flush('{}');
    await loadPromise;
    expect(service.configSignal()).toEqual({});
  });

  it('feeds configs and userConfigs into the SERVER layer, including keys declared later', async () => {
    const { service, httpMock, configService } = setup({ defaults });
    const early = configService.declare({ key: 'spec.server.early', default: 1 });
    const loadPromise = service.loadConfig();
    httpMock.expectOne(DEFAULT_SERVER_CONFIG_URL).flush(JSON.stringify({
      configs: [{ key: 'spec.server.early', value: 2 }, { key: 'spec.server.novalue' }],
      userConfigs: { 'spec.server.late': 'from-server' },
    }));
    await loadPromise;

    expect(early.value).toBe(2);
    const late = configService.declare({ key: 'spec.server.late', default: 'from-code' });
    expect(late.value).toBe('from-server');
    const noValue = configService.declare({ key: 'spec.server.novalue', default: 'kept' });
    expect(noValue.value).toBe('kept');
  });

  it('keeps the defaults when the file cannot be fetched', async () => {
    const { service, httpMock } = setup({ defaults });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const loadPromise = service.loadConfig();
    httpMock.expectOne(DEFAULT_SERVER_CONFIG_URL).flush('missing', { status: 404, statusText: 'Not Found' });
    await loadPromise;
    expect(service.config).toEqual(defaults);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('setUnitTestConfig merges over the defaults without a request', () => {
    const { service } = setup({ defaults });
    service.setUnitTestConfig({ logLevel: 'debug' });
    expect(service.config).toEqual({ ...defaults, logLevel: 'debug' });
  });
});
