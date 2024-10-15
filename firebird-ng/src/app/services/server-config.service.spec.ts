import { TestBed, waitForAsync } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ServerConfigService } from './server-config.service';

describe('ServerConfigService', () => {
  let service: ServerConfigService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ServerConfigService]
    });
    service = TestBed.inject(ServerConfigService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify(); // Ensure that no requests are outstanding.
  });

  it('should fetch and parse JSONC data correctly', async () => {
    const jsoncData = '{ "apiBaseUrl": "http://localhost:5454", "logLevel": "info" }';

    // Call loadConfig()
    const loadPromise = service.loadConfig();

    // Set up the HttpTestingController
    const req = httpMock.expectOne(service['configUrl']);
    expect(req.request.method).toBe('GET');

    // Mock the HTTP response
    req.flush(jsoncData);

    // Wait for loadConfig() to complete
    await loadPromise;

    // Verify the config
    expect(service.config.apiBaseUrl).toBe("http://localhost:5454");
    expect(service.config.logLevel).toBe("info");
  });
});
