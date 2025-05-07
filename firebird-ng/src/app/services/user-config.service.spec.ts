// url.service.spec.ts

import { TestBed } from '@angular/core/testing';
import { UrlService } from './url.service';
import { UserConfigService } from './user-config.service';
import { ServerConfigService } from './server-config.service';
import { BehaviorSubject } from 'rxjs';

describe('UrlService', () => {
  let service: UrlService;
  let userConfigService: UserConfigService;
  let serverConfigService: ServerConfigService;

  beforeEach(() => {
    // Create mock services
    const mockUserConfigService = {
      localServerUrl: {
        subject: new BehaviorSubject<string>('http://localhost:5454'),
        value: 'http://localhost:5454'
      },
      localServerUseApi: {
        subject: new BehaviorSubject<boolean>(false),
        value: false
      }
    };

    const mockServerConfigService = {
      config: {
        servedByPyrobird: true,
        apiBaseUrl: 'http://localhost:5454'
      }
    };

    TestBed.configureTestingModule({
      providers: [
        UrlService,
        { provide: UserConfigService, useValue: mockUserConfigService },
        { provide: ServerConfigService, useValue: mockServerConfigService }
      ]
    });

    service = TestBed.inject(UrlService);
    userConfigService = TestBed.inject(UserConfigService);
    serverConfigService = TestBed.inject(ServerConfigService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('resolveDownloadUrl', () => {
    it('should return absolute URL as is (Case 1.1)', () => {
      const inputUrl = 'https://example.com/file.root';
      const resolvedUrl = service.resolveDownloadUrl(inputUrl);
      expect(resolvedUrl).toBe(inputUrl);
    });

    it('should handle relative URL without protocol when backend is available (Case 1.2)', () => {
      // Simulate backend availability
      userConfigService.localServerUseApi.subject.next(true);

      const inputUrl = '/path/to/file.root';
      const expectedUrl = 'http://localhost:5454/api/v1/download?f=%2Fpath%2Fto%2Ffile.root';

      const resolvedUrl = service.resolveDownloadUrl(inputUrl);
      expect(resolvedUrl).toBe(expectedUrl);
    });

    it('should handle relative URL without protocol when backend is not available (Case 1.2)', () => {
      // Ensure backend is not available
      serverConfigService.config.servedByPyrobird = false;
      userConfigService.localServerUseApi.subject.next(false);

      // Manually trigger the service to update its config
      (service as any).updateServerConfig();


      const inputUrl = '/path/to/file.root';
      const resolvedUrl = service.resolveDownloadUrl(inputUrl);
      expect(resolvedUrl).toBe(inputUrl);
    });

    it('should handle URLs starting with asset://', () => {
      const inputUrl = 'asset://images/logo.png';
      const baseUri = document.baseURI.endsWith('/') ? document.baseURI : `${document.baseURI}/`;
      const expectedUrl = `${baseUri}assets/images/logo.png`;

      const resolvedUrl = service.resolveDownloadUrl(inputUrl);
      expect(resolvedUrl).toBe(expectedUrl);
    });

    it('should handle URLs with custom protocol alias epic://', () => {
      const inputUrl = 'epic://some/path/file.root';
      const expectedUrl = 'https://eic.github.io/epic/artifacts/some/path/file.root';

      const resolvedUrl = service.resolveDownloadUrl(inputUrl);
      expect(resolvedUrl).toBe(expectedUrl);
    });

    it('should encode the input URL correctly in download endpoint', () => {
      // Simulate backend availability
      userConfigService.localServerUseApi.subject.next(true);

      const inputUrl = '/path with spaces/file.root';
      const expectedUrl = 'http://localhost:5454/api/v1/download?f=%2Fpath%20with%20spaces%2Ffile.root';

      const resolvedUrl = service.resolveDownloadUrl(inputUrl);
      expect(resolvedUrl).toBe(expectedUrl);
    });
  });

  describe('resolveConvertUrl', () => {
    it('should construct convert URL when backend is available', () => {
      // Simulate backend availability
      userConfigService.localServerUseApi.subject.next(true);

      const inputUrl = 'https://example.com/file.root';
      const fileType = 'edm4eic';
      const entries = 'all';
      const expectedUrl = `http://localhost:5454/api/v1/convert/${fileType}/${entries}?f=${encodeURIComponent(inputUrl)}`;

      const resolvedUrl = service.resolveConvertUrl(inputUrl, fileType, entries);
      expect(resolvedUrl).toBe(expectedUrl);
    });

    it('Convert should throw when backend is not available', () => {
      // Ensure backend is not available
      serverConfigService.config.servedByPyrobird = false;
      userConfigService.localServerUseApi.subject.next(false);

      // Manually trigger the service to update its config
      (service as any).updateServerConfig();

      const inputUrl = 'https://example.com/file.root';
      const fileType = 'edm4eic';
      const entries = 'all';

      expect(() => service.resolveConvertUrl(inputUrl, fileType, entries)).toThrowError(Error);
    });

    it('should handle URLs starting with asset:// in convert URL', () => {
      // Simulate backend availability
      userConfigService.localServerUseApi.subject.next(true);

      const inputUrl = 'asset://data/sample.dat';
      const baseUri = document.baseURI.endsWith('/') ? document.baseURI : `${document.baseURI}/`;
      const resolvedAssetUrl = `${baseUri}assets/data/sample.dat`;

      const fileType = 'edm4eic';
      const entries = 'all';
      const expectedUrl = `http://localhost:5454/api/v1/convert/${fileType}/${entries}?f=${encodeURIComponent(resolvedAssetUrl)}`;

      const resolvedUrl = service.resolveConvertUrl(inputUrl, fileType, entries);
      expect(resolvedUrl).toBe(expectedUrl);
    });

    it('should handle URLs with custom protocol alias epic:// in convert URL', () => {
      // Simulate backend availability
      userConfigService.localServerUseApi.subject.next(true);

      const inputUrl = 'epic://some/path/file.root';
      const resolvedAliasUrl = 'https://eic.github.io/epic/artifacts/some/path/file.root';

      const fileType = 'edm4eic';
      const entries = 'all';
      const expectedUrl = `http://localhost:5454/api/v1/convert/${fileType}/${entries}?f=${encodeURIComponent(resolvedAliasUrl)}`;

      const resolvedUrl = service.resolveConvertUrl(inputUrl, fileType, entries);
      expect(resolvedUrl).toBe(expectedUrl);
    });
  });
});
