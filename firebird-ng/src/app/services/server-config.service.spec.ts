import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ServerConfigService } from './server-config.service';
import * as jsoncParser from 'jsonc-parser';

describe('FirebirdConfigService', () => {
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
  //
  it('should fetch and parse JSONC data correctly', () => {
    const dummyConfig = { apiBaseUrl: "http://localhost:5454" };
    const jsoncData = '{ "key": "value" // comment }';

    // Set up the HttpTestingController
    const req = httpMock.expectOne(service['configUrl']);
    expect(req.request.method).toBe('GET');
    req.flush('{ "apiBaseUrl": "http://localhost:5454", "logLevel": "info" }'); // Mock the HTTP response

    service.loadConfig().then(()=>{
      expect(service.config.apiBaseUrl).toBe("http://localhost:5454");
    });

  });
});


