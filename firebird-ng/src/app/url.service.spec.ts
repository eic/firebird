import { TestBed } from '@angular/core/testing';

import {resolveProtocolAlias, UrlService} from './url.service';
import { UserConfigService } from './user-config.service';
import { FirebirdConfigService } from './firebird-config.service';

describe('UrlService', () => {
  let service: UrlService;
  let userConfigService: jasmine.SpyObj<UserConfigService>;
  let firebirdConfigService: jasmine.SpyObj<FirebirdConfigService>;

  beforeEach(() => {
    const userConfigSpy = jasmine.createSpyObj('UserConfigService', ['localServerHost', 'localServerPort', 'localServerUseApi']);
    const firebirdConfigSpy = jasmine.createSpyObj('FirebirdConfigService', ['config']);

    TestBed.configureTestingModule({
      providers: [
        UrlService,
        { provide: UserConfigService, useValue: userConfigSpy },
        { provide: FirebirdConfigService, useValue: firebirdConfigSpy }
      ]
    });

    userConfigService = TestBed.inject(UserConfigService) as any;
    firebirdConfigService = TestBed.inject(FirebirdConfigService) as any;
    service = TestBed.inject(UrlService);
  });

  it('should return original URL if it does not start with "local://"', () => {
    const url = 'http://example.com';
    expect(service.resolveLocalhostUrl(url)).toEqual(url);
  });

  it('should return an empty string for "local://" if no host info is provided', () => {
    const url = 'local://path/to/resource';
    expect(service.resolveLocalhostUrl(url)).toBe('http://localhost/');
  });

  it('should use Pyrobird server configuration if served by Pyrobird', () => {
    const url = 'local://path/to/resource';
    firebirdConfigService.setUnitTestConfig({ servedByPyrobird: true, serverHost: 'pyrohost', serverPort: 4000 });
    expect(service.resolveLocalhostUrl(url)).toBe('http://pyrohost:4000/path/to/resource');
  });

  it('should use user config server details if userConfigUseApi is true', () => {
    const url = 'local://path/to/resource';
    userConfigService.localServerUseApi.subject.next(true);
    userConfigService.localServerHost.subject.next('apihost');
    userConfigService.localServerPort.subject.next(3000);
    expect(service.resolveLocalhostUrl(url)).toBe('http://apihost:3000/path/to/resource');
  });

});

describe('resolveProtocolAlias', () => {
  it('should replace custom protocol with common protocol from default aliases', () => {
    const result = resolveProtocolAlias('local://8080/service', {
      "local://": "http://localhost/"
    });
    expect(result).toBe('http://localhost/8080/service');
  });

  it('should handle function-based alias to transform URL', () => {
    const aliases = {
      "local://": (url: string) => `http://localhost${url.substring(8)}`
    };
    const result = resolveProtocolAlias('local://8080/service', aliases);
    expect(result).toBe('http://localhost8080/service');
  });

  it('should replace custom protocol with common protocol from provided aliases', () => {
    const aliases = { "custom://": "https://example.com/" };
    const result = resolveProtocolAlias('custom://path', aliases);
    expect(result).toBe('https://example.com/path');
  });

  it('should handle URLs without alias replacements', () => {
    const result = resolveProtocolAlias('https://already-common.com');
    expect(result).toBe('https://already-common.com');
  });

  it('should give precedence to provided aliases over default ones', () => {
    const aliases = { "local://": "https://modified-localhost/" };
    const result = resolveProtocolAlias('local://service', aliases);
    expect(result).toBe('https://modified-localhost/service');
  });

  it('should correctly handle function-based alias that appends paths', () => {
    const aliases = {
      "api://": (url: string) => `https://api.example.com/${url.substring(6)}`
    };
    const result = resolveProtocolAlias('api://users/123', aliases);
    expect(result).toBe('https://api.example.com/users/123');
  });
});
