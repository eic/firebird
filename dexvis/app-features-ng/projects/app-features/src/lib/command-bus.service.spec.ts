/**
 * CommandBusService: handler registration, dispatch, the `?cmd=` string
 * grammar, and the startup queue.
 */
import { TestBed } from '@angular/core/testing';
import { Injectable, provideZonelessChangeDetection } from '@angular/core';
import { AppCommand, CommandBusService, CommandHandler } from './command-bus.service';
import { appFeatures, withCommandHandler } from './features';

/** Records executed commands in one shared log, in order. */
const executed: string[] = [];

@Injectable()
class OpenFileHandler implements CommandHandler {
  readonly type = 'open-file';
  fromUrlArg(arg: string): AppCommand { return { type: this.type, url: arg }; }
  execute(command: AppCommand): void { executed.push(`open-file:${command['url']}`); }
}

@Injectable()
class SlowHandler implements CommandHandler {
  readonly type = 'slow';
  async execute(command: AppCommand): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 5));
    executed.push(`slow:${command['value']}`);
  }
}

@Injectable()
class FailingHandler implements CommandHandler {
  readonly type = 'fail';
  execute(): void { throw new Error('boom'); }
}

/** Replaces OpenFileHandler: the last registration for a type wins. */
@Injectable()
class OpenFileOverride implements CommandHandler {
  readonly type = 'open-file';
  execute(command: AppCommand): void { executed.push(`override:${command['url']}`); }
}

function setup(...handlers: Array<new () => CommandHandler>): CommandBusService {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      ...appFeatures(...handlers.map(h => withCommandHandler(h))).providers,
    ],
  });
  return TestBed.inject(CommandBusService);
}

describe('CommandBusService', () => {
  beforeEach(() => {
    executed.length = 0;
  });

  describe('parseCommandString', () => {
    it('splits on semicolons and the FIRST colon, keeping colons in the argument', () => {
      const bus = setup();
      expect(bus.parseCommandString('show-event:2;open:https://host:8080/a.root')).toEqual([
        { type: 'show-event', value: '2', source: 'url' },
        { type: 'open', value: 'https://host:8080/a.root', source: 'url' },
      ]);
    });

    it('accepts bare types, trims items, and drops empty items', () => {
      const bus = setup();
      expect(bus.parseCommandString(' reset ; ;home:  ;; ')).toEqual([
        { type: 'reset', source: 'url' },
        { type: 'home', source: 'url' },
      ]);
    });

    it('builds the command through the handler fromUrlArg when the type has one', () => {
      const bus = setup(OpenFileHandler);
      expect(bus.parseCommandString('open-file:root://host//f.root')).toEqual([
        { type: 'open-file', url: 'root://host//f.root', source: 'url' },
      ]);
    });

    it('does not call fromUrlArg for a bare type', () => {
      const bus = setup(OpenFileHandler);
      expect(bus.parseCommandString('open-file')).toEqual([{ type: 'open-file', source: 'url' }]);
    });

    it('tags every command with the given source', () => {
      const bus = setup(OpenFileHandler);
      const commands = bus.parseCommandString('open-file:a;x:1', 'server');
      expect(commands.map(c => c.source)).toEqual(['server', 'server']);
    });

    it('returns nothing for an empty string', () => {
      expect(setup().parseCommandString('')).toEqual([]);
    });

    it('commandFromUrlArg builds one command the same way, without splitting the argument', () => {
      const bus = setup(OpenFileHandler);
      expect(bus.commandFromUrlArg('open-file', 'a;b.root')).toEqual({ type: 'open-file', url: 'a;b.root', source: 'url' });
      expect(bus.commandFromUrlArg('other', 'x', 'batch')).toEqual({ type: 'other', value: 'x', source: 'batch' });
      expect(bus.commandFromUrlArg('other', '')).toEqual({ type: 'other', source: 'url' });
    });
  });

  describe('dispatch', () => {
    it('runs the handler registered for the type', async () => {
      const bus = setup(OpenFileHandler);
      await bus.dispatch({ type: 'open-file', url: 'a.root' });
      expect(executed).toEqual(['open-file:a.root']);
      expect(bus.knownTypes).toEqual(['open-file']);
    });

    it('throws for a type without a handler and names the known types', async () => {
      const bus = setup(OpenFileHandler);
      await expect(bus.dispatch({ type: 'nope' })).rejects.toThrow(/No handler for command type 'nope'.*open-file/);
    });

    it('lets a later registration replace a handler for the same type', async () => {
      const bus = setup(OpenFileHandler, OpenFileOverride);
      await bus.dispatch({ type: 'open-file', url: 'a.root' });
      expect(executed).toEqual(['override:a.root']);
    });

    it('dispatchAll awaits each command before the next', async () => {
      const bus = setup(OpenFileHandler, SlowHandler);
      await bus.dispatchAll([
        { type: 'slow', value: 1 },
        { type: 'open-file', url: 'b' },
      ]);
      expect(executed).toEqual(['slow:1', 'open-file:b']);
    });
  });

  describe('startup queue', () => {
    it('runs queued commands in order, isolates failures, and flips startupCommandsDone', async () => {
      const bus = setup(OpenFileHandler, SlowHandler, FailingHandler);
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      bus.queueStartupCommands([{ type: 'slow', value: 1 }, { type: 'fail' }]);
      bus.queueStartupCommands([{ type: 'unknown' }, { type: 'open-file', url: 'c' }]);
      expect(bus.peekStartupCommands().length).toBe(4);
      expect(bus.startupCommandsDone()).toBe(false);

      await bus.runStartupCommands();

      expect(executed).toEqual(['slow:1', 'open-file:c']);
      expect(error).toHaveBeenCalledTimes(2);
      expect(bus.startupCommandsDone()).toBe(true);
      expect(bus.peekStartupCommands().length).toBe(0);
      error.mockRestore();
    });

    it('reports each failure to onFailure before startup is done, and returns them', async () => {
      const bus = setup(OpenFileHandler, FailingHandler);
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      bus.queueStartupCommands([{ type: 'fail' }, { type: 'open-file', url: 'c' }, { type: 'unknown' }]);
      const reported: Array<{ type: string; message: string; doneAtReport: boolean }> = [];

      const failures = await bus.runStartupCommands({
        onFailure: failure => reported.push({
          type: failure.command.type,
          message: failure.message,
          doneAtReport: bus.startupCommandsDone(),
        }),
      });

      expect(reported).toEqual([
        { type: 'fail', message: 'boom', doneAtReport: false },
        { type: 'unknown', message: expect.stringContaining("No handler for command type 'unknown'"), doneAtReport: false },
      ]);
      expect(failures.map(failure => failure.command.type)).toEqual(['fail', 'unknown']);
      expect(executed).toEqual(['open-file:c']);
      expect(bus.startupCommandsDone()).toBe(true);
      error.mockRestore();
    });

    it('keeps running when onFailure throws', async () => {
      const bus = setup(OpenFileHandler, FailingHandler);
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      bus.queueStartupCommands([{ type: 'fail' }, { type: 'open-file', url: 'd' }]);
      const failures = await bus.runStartupCommands({ onFailure: () => { throw new Error('reporter broke'); } });
      expect(failures.length).toBe(1);
      expect(executed).toEqual(['open-file:d']);
      expect(bus.startupCommandsDone()).toBe(true);
      error.mockRestore();
    });

    it('marks startup done even when the queue is empty', async () => {
      const bus = setup();
      await bus.runStartupCommands();
      expect(bus.startupCommandsDone()).toBe(true);
    });
  });
});
