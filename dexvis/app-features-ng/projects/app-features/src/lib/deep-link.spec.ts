/**
 * buildDeepLink: every value percent-encoded, and every link parses back
 * through UrlStartupService into exactly the values that went in.
 */
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { buildDeepLink } from './deep-link';
import { UrlStartupService } from './url-startup.service';
import { AppCommand, CommandBusService, CommandHandler } from './command-bus.service';
import { ConfigService } from './config.service';
import { ServerConfigService } from './server-config.service';
import { appFeatures, withCommandHandler, withUrlShorthand } from './features';

class OpenFileHandlerStub implements CommandHandler {
  readonly type = 'open-file';
  fromUrlArg(arg: string): AppCommand { return { type: this.type, url: arg }; }
  execute(): void { /* not dispatched here */ }
}

const PRESIGNED = 'https://bucket.s3.amazonaws.com/run1.firebird.zip' +
  '?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA%2F20261005%2Fus-east-1' +
  '&X-Amz-Security-Token=Fwo+dGV4dA==&X-Amz-Signature=3f2a';

describe('buildDeepLink', () => {
  let startup: UrlStartupService;
  let commandBus: CommandBusService;
  let config: ConfigService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        ...appFeatures(
          withCommandHandler(OpenFileHandlerStub),
          withUrlShorthand('file', 'open-file'),
        ).providers,
      ],
    });
    startup = TestBed.inject(UrlStartupService);
    commandBus = TestBed.inject(CommandBusService);
    config = TestBed.inject(ConfigService);
    TestBed.inject(ServerConfigService).setUnitTestConfig({});
  });

  /** Parses `link` the way the application does at startup. */
  function parse(link: string): readonly AppCommand[] {
    startup.parse(new URL(link, 'https://host/').searchParams);
    return commandBus.peekStartupCommands();
  }

  it('carries a presigned URL with &, +, = and %2F through a shorthand unchanged', () => {
    const link = buildDeepLink('https://host/viewer', { params: { file: PRESIGNED } });
    expect(link).not.toContain('&X-Amz');
    expect(link).not.toContain('+');
    expect(parse(link)).toEqual([{ type: 'open-file', url: PRESIGNED, source: 'url' }]);
  });

  it('shows why encoding matters: the raw link loses everything after the first &', () => {
    const commands = parse(`https://host/viewer?file=${PRESIGNED}`);
    expect(commands[0]['url']).toBe('https://bucket.s3.amazonaws.com/run1.firebird.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256');
  });

  it('keeps : and / literal so embedded URLs stay readable', () => {
    const link = buildDeepLink('/viewer', { params: { file: 'https://host/data/run 1.root' } });
    expect(link).toBe('/viewer?file=https://host/data/run%201.root');
  });

  it('writes config values into the session layer, #, + and spaces included', () => {
    const color = config.declare({ key: 'spec.link.color', default: '' });
    const label = config.declare({ key: 'spec.link.label', default: '' });
    const count = config.declare({ key: 'spec.link.count', default: 0 });
    const link = buildDeepLink('https://host/viewer', {
      config: { 'spec.link.color': '#ff4d00', 'spec.link.label': 'a+b c', 'spec.link.count': 7 },
    });
    parse(link);
    expect(color.value).toBe('#ff4d00');
    expect(label.value).toBe('a+b c');
    expect(count.value).toBe(7);
    expect(localStorage.getItem('spec.link.color')).toBeNull();
  });

  it('joins commands in order, with URL arguments that contain colons', () => {
    const link = buildDeepLink('https://host/viewer', {
      commands: ['camera-preset:top', { type: 'open-file', arg: 'https://host/a.root?x=1&y=2' }, { type: 'reset' }],
    });
    expect(link).toBe('https://host/viewer?cmd=camera-preset:top;open-file:https://host/a.root%3Fx%3D1%26y%3D2;reset');
    expect(parse(link)).toEqual([
      { type: 'camera-preset', value: 'top', source: 'url' },
      { type: 'open-file', url: 'https://host/a.root?x=1&y=2', source: 'url' },
      { type: 'reset', source: 'url' },
    ]);
  });

  it('refuses a ; inside a command argument and points at shorthands', () => {
    expect(() => buildDeepLink('/viewer', { commands: [{ type: 'open-file', arg: 'https://host/a;b.root' }] }))
      .toThrowError(/shorthand/);
    expect(() => buildDeepLink('/viewer', { commands: ['open-file:a;b'] })).toThrowError(/';'/);
  });

  it('refuses an empty command type or one containing : or ;', () => {
    expect(() => buildDeepLink('/viewer', { commands: [':x'] })).toThrowError(/invalid command type/);
    expect(() => buildDeepLink('/viewer', { commands: [{ type: 'a;b' }] })).toThrowError(/invalid command type/);
  });

  it('appends to an existing query and keeps the fragment', () => {
    expect(buildDeepLink('https://host/viewer?lang=en#top', { params: { file: 'a.root' } }))
      .toBe('https://host/viewer?lang=en&file=a.root#top');
    expect(buildDeepLink('https://host/viewer?', { params: { file: 'a.root' } }))
      .toBe('https://host/viewer?file=a.root');
  });

  it('returns the base unchanged when there is nothing to add', () => {
    expect(buildDeepLink('https://host/viewer', {})).toBe('https://host/viewer');
  });
});
