/**
 * URL GET source parsing: `config.*` session overrides, application
 * shorthands and the generic `?cmd=` list, which become queued startup
 * commands. Also covers server `startupCommands` ordering (server before URL).
 */
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { UrlStartupService } from './url-startup.service';
import { AppCommand, CommandBusService, CommandHandler } from './command-bus.service';
import { ConfigService } from './config.service';
import { ServerConfigService } from './server-config.service';
import { appFeatures, withCommandHandler, withUrlShorthand } from './features';

class OpenFileHandlerStub implements CommandHandler {
  readonly type = 'open-file';
  executed: AppCommand[] = [];
  fromUrlArg(arg: string): AppCommand { return { type: this.type, url: arg }; }
  execute(command: AppCommand): void { this.executed.push(command); }
}

class ShowEventHandlerStub implements CommandHandler {
  readonly type = 'show-event';
  fromUrlArg(arg: string): AppCommand { return { type: this.type, index: parseInt(arg, 10) }; }
  execute(): void { /* not dispatched here */ }
}

describe('UrlStartupService', () => {
  let service: UrlStartupService;
  let commandBus: CommandBusService;
  let configService: ConfigService;
  let serverConfig: ServerConfigService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        ...appFeatures(
          withCommandHandler(OpenFileHandlerStub),
          withCommandHandler(ShowEventHandlerStub),
          // A test grammar: the application decides which parameters are shorthands.
          withUrlShorthand('source', 'open-source'),
          withUrlShorthand('file', 'open-file'),
          withUrlShorthand('event', 'show-event'),
        ).providers,
      ],
    });
    service = TestBed.inject(UrlStartupService);
    commandBus = TestBed.inject(CommandBusService);
    configService = TestBed.inject(ConfigService);
    serverConfig = TestBed.inject(ServerConfigService);
    serverConfig.setUnitTestConfig({});
  });

  it('routes config.* params into the session layer', () => {
    const property = configService.declare({ key: 'spec.url.color', default: 'red' });
    service.parse(new URLSearchParams('?config.spec.url.color=blue'));
    expect(property.value).toBe('blue');
    expect(property.hasSessionOverride).toBe(true);
  });

  it('keeps config.* values for keys declared later (pending session layer)', () => {
    service.parse(new URLSearchParams('?config.spec.url.later=7'));
    const property = configService.declare({ key: 'spec.url.later', default: 1 });
    expect(property.value).toBe(7);
  });

  it('turns registered shorthands into queued commands in registration order', () => {
    service.parse(new URLSearchParams('?event=2&file=https://host/a.root&source=data://b.json'));
    const queued = commandBus.peekStartupCommands();
    expect(queued.map(c => c.type)).toEqual(['open-source', 'open-file', 'show-event']);
    // No handler for 'open-source': the value lands as { type, value }.
    expect(queued[0]['value']).toBe('data://b.json');
    // Handlers build the others through fromUrlArg.
    expect(queued[1]['url']).toBe('https://host/a.root');
    expect(queued[2]['index']).toBe(2);
    expect(queued.every(c => c.source === 'url')).toBe(true);
  });

  it('builds the same command for a shorthand as for its ?cmd= form', () => {
    service.parse(new URLSearchParams('?file=https://host/a.root'));
    service.parse(new URLSearchParams('?cmd=open-file:https://host/a.root'));
    const [fromShorthand, fromCmd] = commandBus.peekStartupCommands();
    expect(fromShorthand).toEqual(fromCmd);
  });

  it('keeps semicolons in a shorthand value (only ?cmd= splits on them)', () => {
    service.parse(new URLSearchParams('?file=https%3A%2F%2Fhost%2Fa%3Bb.root'));
    expect(commandBus.peekStartupCommands()[0]['url']).toBe('https://host/a;b.root');
  });

  it('skips empty shorthand values and ignores unregistered parameters', () => {
    service.parse(new URLSearchParams('?file=&event=&unknown=x'));
    expect(commandBus.peekStartupCommands().length).toBe(0);
  });

  it('parses the generic ?cmd= grammar through handler fromUrlArg (colons in URLs survive)', () => {
    service.parse(new URLSearchParams('?cmd=open-file:https://host/file.zip;unknown-cmd:x'));
    const queued = commandBus.peekStartupCommands();
    expect(queued[0]).toEqual(expect.objectContaining({ type: 'open-file', url: 'https://host/file.zip', source: 'url' }));
    // Unknown types still queue as generic {type, value}; dispatch reports them.
    expect(queued[1]).toEqual(expect.objectContaining({ type: 'unknown-cmd', value: 'x' }));
  });

  it('queues shorthands before the ?cmd= list', () => {
    service.parse(new URLSearchParams('?cmd=show-event:5&file=https://host/a.root'));
    expect(commandBus.peekStartupCommands().map(c => c.type)).toEqual(['open-file', 'show-event']);
  });

  it('queues server startupCommands before URL commands', () => {
    serverConfig.setUnitTestConfig({
      startupCommands: ['open-file:https://host/server-pick.zip', { type: 'show-event', index: 1 }],
    });
    service.parse(new URLSearchParams('?event=3'));
    const queued = commandBus.peekStartupCommands();
    expect(queued.map(c => [c.type, c.source])).toEqual([
      ['open-file', 'server'],
      ['show-event', 'server'],
      ['show-event', 'url'],
    ]);
  });

  it('ignores malformed server startup commands', () => {
    serverConfig.setUnitTestConfig({
      startupCommands: [{ notAType: 1 } as Record<string, unknown>, 'show-event:1'],
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    service.parse(new URLSearchParams(''));
    expect(commandBus.peekStartupCommands().map(c => c.type)).toEqual(['show-event']);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('runStartupCommands dispatches sequentially and flips startupCommandsDone', async () => {
    service.parse(new URLSearchParams('?file=https://host/a.zip'));
    expect(commandBus.startupCommandsDone()).toBe(false);
    await commandBus.runStartupCommands();
    expect(commandBus.startupCommandsDone()).toBe(true);
    expect(commandBus.peekStartupCommands().length).toBe(0);
  });
});
