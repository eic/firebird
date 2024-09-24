import { TestBed } from '@angular/core/testing';
import { UrlService } from './url.service';
import { ServerConfigService } from './server-config.service';
import { BehaviorSubject } from 'rxjs';
import { UserConfigService } from './user-config.service';
import { resolveProtocolAlias } from './url.service'

describe('resolveProtocolAlias', () => {
  it('should return the same URL if no aliases are provided', () => {
    const url = 'http://example.com';
    const result = resolveProtocolAlias(url);
    expect(result).toBe(url);
  });

  it('should correctly replace a simple alias with a string value', () => {
    const url = 'local://service';
    const aliases = {
      'local://': 'http://localhost:8080/'
    };
    const result = resolveProtocolAlias(url, aliases);
    expect(result).toBe('http://localhost:8080/service');
  });

  it('should correctly replace a simple alias with a function value', () => {
    const url = 'local://service';
    const aliases = {
      'local://': (url: string) => `http://localhost:8080/${url.substring(8)}`
    };
    const result = resolveProtocolAlias(url, aliases);
    expect(result).toBe('http://localhost:8080/service');
  });

  it('should only replace when the URL starts with the alias', () => {
    const url = 'http://example.com/local://service';
    const aliases = {
      'local://': 'http://localhost:8080/'
    };
    const result = resolveProtocolAlias(url, aliases);
    expect(result).toBe(url); // Should not replace anything
  });

  it('should work with multiple aliases', () => {
    const url = 'api://users';
    const aliases = {
      'api://': 'http://api.example.com/',
      'local://': 'http://localhost:8080/'
    };
    const result = resolveProtocolAlias(url, aliases);
    expect(result).toBe('http://api.example.com/users');
  });

  it('should replace using the correct alias when aliases overlap', () => {
    const url = 'local://service';
    const aliases = {
      'local://': 'http://localhost:8080/',
      'local://service': 'http://different-service/'
    };
    const result = resolveProtocolAlias(url, aliases);
    expect(result).toBe('http://localhost:8080/service'); // Matches 'local://' first
  });

  it('should handle an empty URL', () => {
    const url = '';
    const aliases = {
      'local://': 'http://localhost:8080/'
    };
    const result = resolveProtocolAlias(url, aliases);
    expect(result).toBe(''); // Should return an empty string
  });

  it('should handle empty aliases', () => {
    const url = 'local://service';
    const aliases = {};
    const result = resolveProtocolAlias(url, aliases);
    expect(result).toBe('local://service');
  });

  it('should be case-sensitive', () => {
    const url = 'Local://service';
    const aliases = {
      'local://': 'http://localhost:8080/'
    };
    const result = resolveProtocolAlias(url, aliases);
    expect(result).toBe('Local://service'); // Should not replace anything
  });
});


// Mock UserConfigService with BehaviorSubjects for immediate values
class MockUserConfigService {
  localServerHost = { subject: new BehaviorSubject<string>('localhost') };
  localServerPort = { subject: new BehaviorSubject<number>(5454) };
  localServerUseApi = { subject: new BehaviorSubject<boolean>(false) };
}

// Mock ServerConfigService with default configuration
class MockServerConfigService {
  config = {
    serverPort: 5454,
    serverHost: 'localhost',
    servedByPyrobird: false,
    apiAvailable: false,
    useAuthentication: true,
    logLevel: 'info'
  };
}

describe('UrlService', () => {
  let service: UrlService;
  let userConfigService: MockUserConfigService;
  let serverConfigService: MockServerConfigService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        UrlService,
        { provide: UserConfigService, useClass: MockUserConfigService },
        { provide: ServerConfigService, useClass: MockServerConfigService },
      ],
    });

    service = TestBed.inject(UrlService);
    userConfigService = TestBed.inject(UserConfigService) as unknown as MockUserConfigService;
    serverConfigService = TestBed.inject(ServerConfigService) as unknown as MockServerConfigService;
  });

  it('should return the original URL if it does not start with local://', () => {
    const url = 'http://example.com/resource';
    const resolvedUrl = service.resolveLocalhostUrl(url);
    expect(resolvedUrl).toBe(url);
  });

  it('should replace local:// with server host and port when servedByPyrobird is true', () => {
    serverConfigService.config.servedByPyrobird = true;
    serverConfigService.config.serverHost = 'server-host';
    serverConfigService.config.serverPort = 1234;

    const url = 'local://api/resource';
    const resolvedUrl = service.resolveLocalhostUrl(url);
    expect(resolvedUrl).toBe('http://server-host:1234/api/resource');
  });

  it('should replace local:// with user-configured host and port when userConfigUseApi is true', () => {
    // Update user configuration
    userConfigService.localServerHost.subject.next('user-host');
    userConfigService.localServerPort.subject.next(5678);
    userConfigService.localServerUseApi.subject.next(true);

    const url = 'local://api/resource';
    const resolvedUrl = service.resolveLocalhostUrl(url);
    expect(resolvedUrl).toBe('http://user-host:5678/api/resource');
  });

  it('should replace local:// with empty string when neither servedByPyrobird nor userConfigUseApi is true', () => {
    serverConfigService.config.servedByPyrobird = false;
    userConfigService.localServerUseApi.subject.next(false);

    const url = 'local://api/resource';
    const resolvedUrl = service.resolveLocalhostUrl(url);
    expect(resolvedUrl).toBe('api/resource');
  });

  it('should prioritize servedByPyrobird over userConfigUseApi', () => {
    serverConfigService.config.servedByPyrobird = true;
    serverConfigService.config.serverHost = 'server-host';
    serverConfigService.config.serverPort = 1234;

    userConfigService.localServerHost.subject.next('user-host');
    userConfigService.localServerPort.subject.next(5678);
    userConfigService.localServerUseApi.subject.next(true);

    const url = 'local://api/resource';
    const resolvedUrl = service.resolveLocalhostUrl(url);
    expect(resolvedUrl).toBe('http://server-host:1234/api/resource');
  });

  it('should use default user config values if none are set', () => {
    userConfigService.localServerUseApi.subject.next(true);

    const url = 'local://api/resource';
    const resolvedUrl = service.resolveLocalhostUrl(url);
    expect(resolvedUrl).toBe('http://localhost:5454/api/resource');
  });


  it('should use default user config host and port if not set when userConfigUseApi is true', () => {
    userConfigService.localServerUseApi.subject.next(true);

    const url = 'local://api/resource';
    const resolvedUrl = service.resolveLocalhostUrl(url);
    expect(resolvedUrl).toBe('http://localhost:5454/api/resource');
  });

  it('should handle URL that is exactly local://', () => {
    serverConfigService.config.servedByPyrobird = true;
    serverConfigService.config.serverHost = 'server-host';
    serverConfigService.config.serverPort = 1234;

    const url = 'local://';
    const resolvedUrl = service.resolveLocalhostUrl(url);
    expect(resolvedUrl).toBe('http://server-host:1234/');
  });

  it('should return empty string when URL is local:// and neither condition is met', () => {
    serverConfigService.config.servedByPyrobird = false;
    userConfigService.localServerUseApi.subject.next(false);

    const url = 'local://';
    const resolvedUrl = service.resolveLocalhostUrl(url);
    expect(resolvedUrl).toBe('');
  });

  it('should be case-sensitive and not replace Local://', () => {
    serverConfigService.config.servedByPyrobird = true;
    serverConfigService.config.serverHost = 'server-host';
    serverConfigService.config.serverPort = 1234;

    const url = 'Local://api/resource';
    const resolvedUrl = service.resolveLocalhostUrl(url);
    expect(resolvedUrl).toBe('Local://api/resource');
  });
});
