/**
 * UrlService against the real ConfigService: the backend keys the config
 * page writes (`server.useApi`, `server.url`) are the keys this service
 * reads, through every config source.
 */
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { ConfigService, ServerConfigService, URL_ALIASES } from '@dexvis/app-features';
import { UrlService } from './url.service';
import { BACKEND_URL_CONFIG, BACKEND_USE_API_CONFIG } from '../config-keys';
import { defaultFirebirdConfig, type ServerConfig } from './server-config';

describe('UrlService', () => {
  let serverConfig: WritableSignal<ServerConfig>;
  let config: ConfigService;

  /** Creates the service; config sources set before this call act as pending layers. */
  function createService(): UrlService {
    return TestBed.inject(UrlService);
  }

  /** What the config page's controls do: a runtime write of the declared key. */
  function useBackend(url?: string): void {
    config.declare(BACKEND_USE_API_CONFIG).value = true;
    if (url !== undefined) config.declare(BACKEND_URL_CONFIG).value = url;
  }

  beforeEach(() => {
    localStorage.clear();
    serverConfig = signal<ServerConfig>({ ...defaultFirebirdConfig });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        // The real ConfigService (root); the server config is a plain signal holder
        { provide: ServerConfigService, useValue: { configSignal: serverConfig } },
        // Aliases are DI-contributed (withUrlAlias feature)
        { provide: URL_ALIASES, useValue: { prefix: 'exp://', base: 'https://data.example.org/artifacts/' }, multi: true },
      ],
    });
    config = TestBed.inject(ConfigService);
  });

  describe('backend selection', () => {
    it('has no backend on a static deployment by default', () => {
      const service = createService();
      expect(service.isBackendAvailable()).toBe(false);
      expect(service.serverAddress()).toBe('');
    });

    it('reads the keys the config page writes, with the page default URL', () => {
      const service = createService();
      useBackend();
      expect(service.isBackendAvailable()).toBe(true);
      expect(service.serverAddress()).toBe('http://localhost:5454');
      // One canonical property per key: the page and the service share it
      expect(config.getConfig('server.useApi')).toBe(config.declare(BACKEND_USE_API_CONFIG));
    });

    it('follows a changed backend URL and drops a trailing slash', () => {
      const service = createService();
      useBackend('http://customserver:1234/');
      expect(service.serverAddress()).toBe('http://customserver:1234');
    });

    it('takes the backend from a deep link (?config.server.useApi=true) before anything declared it', () => {
      config.applySessionValue('server.useApi', 'true');
      config.applySessionValue('server.url', 'http://linked:5454');
      const service = createService();
      expect(service.isBackendAvailable()).toBe(true);
      expect(service.serverAddress()).toBe('http://linked:5454');
      expect(localStorage.getItem('server.useApi')).toBeNull();
    });

    it('keeps a saved choice across sessions', () => {
      localStorage.setItem('server.useApi', 'true');
      localStorage.setItem('server.url', 'http://saved:5454');
      const service = createService();
      expect(service.serverAddress()).toBe('http://saved:5454');
    });

    it('prefers the serving pyrobird over a configured backend, once its config arrives', () => {
      const service = createService();
      useBackend('http://other:1234');
      serverConfig.set({ ...defaultFirebirdConfig, servedByPyrobird: true, apiAvailable: true, apiBaseUrl: 'http://served:5454' });
      expect(service.isBackendAvailable()).toBe(true);
      expect(service.serverAddress()).toBe('http://served:5454');
    });

    it('ignores a blob: backend URL', () => {
      localStorage.setItem('server.useApi', 'true');
      localStorage.setItem('server.url', 'blob:http://localhost/5b1c');
      const service = createService();
      expect(service.serverAddress()).toBe(BACKEND_URL_CONFIG.default);
    });
  });

  describe('resolveDownloadUrl', () => {
    it('uses the download endpoint for a plain path when a backend is configured (Case 1.2)', () => {
      const service = createService();
      useBackend();
      expect(service.resolveDownloadUrl('/path/to/file.root'))
        .toBe('http://localhost:5454/api/v1/download?f=%2Fpath%2Fto%2Ffile.root');
    });

    it('resolves local:// through the download endpoint (Case 1.2)', () => {
      const service = createService();
      useBackend();
      expect(service.resolveDownloadUrl('local://subdir/file.root'))
        .toBe('http://localhost:5454/api/v1/download?f=subdir%2Ffile.root');
    });

    it('passes a local:// path through unresolved when no backend is available', () => {
      const service = createService();
      expect(service.resolveDownloadUrl('local://file.root')).toBe('file.root');
    });

    it('encodes the input URL in the download endpoint', () => {
      const service = createService();
      useBackend();
      expect(service.resolveDownloadUrl('/path with spaces/file.root'))
        .toBe('http://localhost:5454/api/v1/download?f=%2Fpath%20with%20spaces%2Ffile.root');
    });

    it('leaves absolute URLs as they are (Case 1.1)', () => {
      const service = createService();
      useBackend();
      expect(service.resolveDownloadUrl('https://example.com/file.root')).toBe('https://example.com/file.root');
    });
  });

  describe('resolveConvertUrl', () => {
    it('builds the convert URL when a backend is configured', () => {
      const service = createService();
      useBackend();
      const inputUrl = 'https://example.com/file.root';
      expect(service.resolveConvertUrl(inputUrl, 'edm4eic', 'all'))
        .toBe(`http://localhost:5454/api/v1/convert/edm4eic/all?f=${encodeURIComponent(inputUrl)}`);
    });

    it('resolves asset:// before converting', () => {
      const service = createService();
      useBackend();
      const baseUri = document.baseURI.endsWith('/') ? document.baseURI : `${document.baseURI}/`;
      const resolvedAssetUrl = `${baseUri}assets/data/sample.dat`;
      expect(service.resolveConvertUrl('asset://data/sample.dat', 'edm4eic', 'all'))
        .toBe(`http://localhost:5454/api/v1/convert/edm4eic/all?f=${encodeURIComponent(resolvedAssetUrl)}`);
    });

    it('resolves local:// before converting', () => {
      const service = createService();
      useBackend();
      expect(service.resolveConvertUrl('local://sim.edm4eic.root', 'edm4eic', '0'))
        .toBe('http://localhost:5454/api/v1/convert/edm4eic/0?f=sim.edm4eic.root');
    });

    it('resolves a pack alias before converting', () => {
      const service = createService();
      useBackend();
      const resolvedAliasUrl = 'https://data.example.org/artifacts/some/path/file.root';
      expect(service.resolveConvertUrl('exp://some/path/file.root', 'edm4eic', 'all'))
        .toBe(`http://localhost:5454/api/v1/convert/edm4eic/all?f=${encodeURIComponent(resolvedAliasUrl)}`);
    });

    it('adds the collection groups', () => {
      const service = createService();
      useBackend();
      expect(service.resolveConvertUrl('local://a.root', 'auto', '0', ['tracks', 'mc_particles']))
        .toBe('http://localhost:5454/api/v1/convert/auto/0?f=a.root&collections=tracks%2Cmc_particles');
    });

    it('throws when no backend is available', () => {
      const service = createService();
      expect(() => service.resolveConvertUrl('local://a.root', 'auto', '0')).toThrowError(/Backend is not available/);
    });
  });
});
