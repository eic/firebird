/**
 * URL GET source parsing: `config.*` session overrides and the command
 * shorthands (`dex`, `geometry`, `event`, `cmd`) that become queued startup
 * commands. Also covers server `startupCommands` ordering (server before URL).
 */
import { TestBed } from '@angular/core/testing';
import { UrlStartupService } from './url-startup.service';
import { CommandBusService, CommandHandler, FbCommand } from './command-bus.service';
import { COMMAND_HANDLERS } from './tokens';
import { ConfigService } from '../services/config.service';
import { ServerConfigService } from '../services/server-config.service';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';

class OpenDexHandlerStub implements CommandHandler {
  readonly type = 'open-dex';
  executed: FbCommand[] = [];
  fromUrlArg(arg: string): FbCommand { return { type: this.type, url: arg }; }
  execute(command: FbCommand): void { this.executed.push(command); }
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
        { provide: COMMAND_HANDLERS, useClass: OpenDexHandlerStub, multi: true },
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

  it('turns dex/geometry/event shorthands into queued commands', () => {
    service.parse(new URLSearchParams('?dex=asset://data/sample.firebird.zip&geometry=epic://epic.root&event=2'));
    const queued = commandBus.peekStartupCommands();
    expect(queued.map(c => c.type)).toEqual(['open-geometry', 'open-dex', 'show-event']);
    expect(queued[1]['url']).toBe('asset://data/sample.firebird.zip');
    expect(queued[2]['index']).toBe(2);
  });

  it('parses the generic ?cmd= grammar through handler fromUrlArg (colons in URLs survive)', () => {
    service.parse(new URLSearchParams('?cmd=open-dex:https://host/file.zip;unknown-cmd:x'));
    const queued = commandBus.peekStartupCommands();
    expect(queued[0]).toEqual(expect.objectContaining({ type: 'open-dex', url: 'https://host/file.zip', source: 'url' }));
    // Unknown types still queue as generic {type, value}; dispatch reports them.
    expect(queued[1]).toEqual(expect.objectContaining({ type: 'unknown-cmd', value: 'x' }));
  });

  it('queues server startupCommands before URL commands', () => {
    serverConfig.setUnitTestConfig({
      startupCommands: ['open-dex:asset://server-pick.zip', { type: 'show-event', index: 1 }],
    });
    service.parse(new URLSearchParams('?event=3'));
    const queued = commandBus.peekStartupCommands();
    expect(queued.map(c => [c.type, c.source])).toEqual([
      ['open-dex', 'server'],
      ['show-event', 'server'],
      ['show-event', 'url'],
    ]);
  });

  it('runStartupCommands dispatches sequentially and flips startupCommandsDone', async () => {
    service.parse(new URLSearchParams('?dex=asset://a.zip'));
    expect(commandBus.startupCommandsDone()).toBe(false);
    await commandBus.runStartupCommands();
    expect(commandBus.startupCommandsDone()).toBe(true);
    expect(commandBus.peekStartupCommands().length).toBe(0);
  });
});
