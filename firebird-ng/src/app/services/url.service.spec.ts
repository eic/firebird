// url.service.spec.ts

import { TestBed } from '@angular/core/testing';
import { UrlService } from './url.service';
import { ConfigService } from './config.service';
import { ServerConfigService } from './server-config.service';
import { BehaviorSubject } from 'rxjs';
import { HttpClientModule } from "@angular/common/http";

describe('UrlService', () => {
    let service: UrlService;
    let userConfigService: any;
    let serverConfigService: any;

    beforeEach(() => {
        // Create mock services with .value property
        userConfigService = {
            localServerUrl: {
                subject: new BehaviorSubject<string>('http://localhost:5454'),
                get value() {
                    return this.subject.value;
                }
            },
            localServerUseApi: {
                subject: new BehaviorSubject<boolean>(false),
                get value() {
                    return this.subject.value;
                }
            },
            getConfig: (key: string) => {
                if (key === 'localServerUrl')
                    return userConfigService.localServerUrl;
                if (key === 'localServerUseApi')
                    return userConfigService.localServerUseApi;
                return undefined;
            }
        };

        serverConfigService = {
            config: {
                servedByPyrobird: false,
                apiAvailable: true,
                apiBaseUrl: 'http://localhost:5454',
            }
        };

        TestBed.configureTestingModule({
            imports: [HttpClientModule],
            providers: [
                UrlService,
                { provide: ConfigService, useValue: userConfigService },
                { provide: ServerConfigService, useValue: serverConfigService }
            ]
        });

        service = TestBed.inject(UrlService);
    });

    describe('resolveDownloadUrl', () => {
        it('should handle relative URL without protocol when backend is available (Case 1.2)', async () => {
            userConfigService.localServerUseApi.subject.next(true);
            // Allow microtask queue to flush
            await Promise.resolve();

            const inputUrl = '/path/to/file.root';
            const expectedUrl = 'http://localhost:5454/api/v1/download?f=%2Fpath%2Fto%2Ffile.root';

            const resolvedUrl = service.resolveDownloadUrl(inputUrl);

            expect(resolvedUrl).toBe(expectedUrl);
        });

        it('should encode the input URL correctly in download endpoint', async () => {
            userConfigService.localServerUseApi.subject.next(true);
            await Promise.resolve();

            const inputUrl = '/path with spaces/file.root';
            const expectedUrl = 'http://localhost:5454/api/v1/download?f=%2Fpath%20with%20spaces%2Ffile.root';

            const resolvedUrl = service.resolveDownloadUrl(inputUrl);
            expect(resolvedUrl).toBe(expectedUrl);
        });
    });

    describe('resolveConvertUrl', () => {
        it('should construct convert URL when backend is available', async () => {
            userConfigService.localServerUseApi.subject.next(true);
            await Promise.resolve();

            const inputUrl = 'https://example.com/file.root';
            const fileType = 'edm4eic';
            const entries = 'all';
            const expectedUrl = `http://localhost:5454/api/v1/convert/${fileType}/${entries}?f=${encodeURIComponent(inputUrl)}`;

            const resolvedUrl = service.resolveConvertUrl(inputUrl, fileType, entries);
            expect(resolvedUrl).toBe(expectedUrl);
        });

        it('should handle URLs starting with asset:// in convert URL', async () => {
            userConfigService.localServerUseApi.subject.next(true);
            await Promise.resolve();

            const inputUrl = 'asset://data/sample.dat';
            const baseUri = document.baseURI.endsWith('/') ? document.baseURI : `${document.baseURI}/`;
            const resolvedAssetUrl = `${baseUri}assets/data/sample.dat`;

            const fileType = 'edm4eic';
            const entries = 'all';
            const expectedUrl = `http://localhost:5454/api/v1/convert/${fileType}/${entries}?f=${encodeURIComponent(resolvedAssetUrl)}`;

            const resolvedUrl = service.resolveConvertUrl(inputUrl, fileType, entries);
            expect(resolvedUrl).toBe(expectedUrl);
        });

        it('should handle URLs with custom protocol alias epic:// in convert URL', async () => {
            userConfigService.localServerUseApi.subject.next(true);
            await Promise.resolve();

            const inputUrl = 'epic://some/path/file.root';
            const resolvedAliasUrl = 'https://eic.github.io/epic/artifacts/some/path/file.root';

            const fileType = 'edm4eic';
            const entries = 'all';
            const expectedUrl = `http://localhost:5454/api/v1/convert/${fileType}/${entries}?f=${encodeURIComponent(resolvedAliasUrl)}`;

            const resolvedUrl = service.resolveConvertUrl(inputUrl, fileType, entries);
            expect(resolvedUrl).toBe(expectedUrl);
        });
    });

    describe('backend availability and server address', () => {
        it('should use user-configured server address if localServerUseApi is true', async () => {
            userConfigService.localServerUseApi.subject.next(true);
            userConfigService.localServerUrl.subject.next('http://customserver:1234');
            await Promise.resolve();

            const expectedServerAddress = 'http://customserver:1234';
            expect((service as any).serverAddress).toBe(expectedServerAddress);
        });

        it('should have backend unavailable when neither PyroBird nor user API is configured', async () => {
            userConfigService.localServerUseApi.subject.next(false);
            serverConfigService.config.servedByPyrobird = false;
            await Promise.resolve();

            expect((service as any).isBackendAvailable).toBe(false);
            expect((service as any).serverAddress).toBe('');
        });
    });
});
