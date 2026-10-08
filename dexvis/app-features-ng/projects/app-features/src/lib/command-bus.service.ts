/**
 * The command bus, light edition.
 *
 * Every external state source (URL deep links, server startup config, batch
 * scripting) produces the same serializable commands. The dispatcher is a
 * plain Angular service; handlers are contributed through the
 * COMMAND_HANDLERS token (`withCommandHandler()`), so extensions add commands
 * the same way built-in ones do.
 *
 * Deliberately not here: undo/rewind, command journaling, session replay.
 * The `source` field exists so journaling can be added later without
 * changing dispatch call sites.
 */

import { Injectable, inject, signal } from '@angular/core';
import { COMMAND_HANDLERS } from './tokens';

/** A serializable command. `type` selects the handler; other fields are its arguments. */
export interface AppCommand {
  type: string;
  /** Where the command came from; used for logging and future journaling. */
  source?: 'url' | 'server' | 'batch' | 'ui' | 'code';
  [key: string]: unknown;
}

/**
 * A command handler contributed through `withCommandHandler()`.
 * One handler per command type; later registrations override earlier ones
 * (an extension may replace a built-in command deliberately).
 */
export interface CommandHandler {
  readonly type: string;
  execute(command: AppCommand): Promise<void> | void;
  /**
   * Optional: turns the `?cmd=type:arg` URL-grammar argument into the full
   * command. Without it the argument lands as `{ type, value: arg }`.
   */
  fromUrlArg?(arg: string): AppCommand;
}

@Injectable({ providedIn: 'root' })
export class CommandBusService {
  private handlersByType = new Map<string, CommandHandler>();

  /** Commands queued before the application was ready; run by runStartupCommands(). */
  private startupQueue: AppCommand[] = [];

  /** True after the startup queue was dispatched (even if it was empty). */
  readonly startupCommandsDone = signal(false);

  constructor() {
    const handlers = inject(COMMAND_HANDLERS, { optional: true }) ?? [];
    for (const handler of handlers) {
      this.handlersByType.set(handler.type, handler);
    }
  }

  /** Command types with a registered handler (for diagnostics and menus). */
  get knownTypes(): string[] {
    return [...this.handlersByType.keys()];
  }

  /** Executes one command. Throws if no handler is registered for its type. */
  async dispatch(command: AppCommand): Promise<void> {
    const handler = this.handlersByType.get(command.type);
    if (!handler) {
      throw new Error(`[CommandBus] No handler for command type '${command.type}'. Known: ${this.knownTypes.join(', ')}`);
    }
    console.log(`[CommandBus] dispatch`, command);
    await handler.execute(command);
  }

  /** Executes commands sequentially; each awaits the previous one. */
  async dispatchAll(commands: AppCommand[]): Promise<void> {
    for (const command of commands) {
      await this.dispatch(command);
    }
  }

  /**
   * Parses the `?cmd=` URL grammar: semicolon-separated `type` or `type:arg`
   * items, for example `cmd=show-event:2;open-file:https://host/file.root`.
   * The arg (everything after the first colon) may itself contain colons (URLs).
   */
  parseCommandString(text: string, source: AppCommand['source'] = 'url'): AppCommand[] {
    const commands: AppCommand[] = [];
    for (const item of text.split(';').map(s => s.trim()).filter(Boolean)) {
      const colon = item.indexOf(':');
      commands.push(colon < 0
        ? this.commandFromUrlArg(item, '', source)
        : this.commandFromUrlArg(item.substring(0, colon), item.substring(colon + 1), source));
    }
    return commands;
  }

  /**
   * Builds one command of the URL grammar: `type` with its argument `arg`
   * (`''` for none). The handler's `fromUrlArg()` builds it when the type
   * has one; otherwise the argument lands as `{ type, value: arg }`.
   */
  commandFromUrlArg(type: string, arg: string, source: AppCommand['source'] = 'url'): AppCommand {
    const handler = this.handlersByType.get(type);
    const command = handler?.fromUrlArg && arg !== ''
      ? handler.fromUrlArg(arg)
      : (arg !== '' ? { type, value: arg } : { type });
    return { ...command, source };
  }

  /** Adds commands to the startup queue (run once the application is ready). */
  queueStartupCommands(commands: AppCommand[]): void {
    this.startupQueue.push(...commands);
  }

  /** The queued startup commands (read-only; lets a page skip loads a command will do). */
  peekStartupCommands(): readonly AppCommand[] {
    return this.startupQueue;
  }

  /**
   * Runs the startup queue sequentially, then marks startup done.
   * Call it from the page that hosts the commands' effects, once that page is
   * ready. One failing command does not stop the rest: each failure is
   * logged, passed to `options.onFailure` as it happens (before
   * `startupCommandsDone` turns true), and returned.
   *
   * @param options.onFailure Receives each failed command with its error,
   *   for example to show the reason to the user.
   * @returns The failures, in queue order; empty when every command succeeded.
   */
  async runStartupCommands(options: {
    onFailure?: (failure: StartupCommandFailure) => void;
  } = {}): Promise<StartupCommandFailure[]> {
    const queue = this.startupQueue;
    this.startupQueue = [];
    const failures: StartupCommandFailure[] = [];
    for (const command of queue) {
      try {
        await this.dispatch(command);
      } catch (error) {
        console.error(`[CommandBus] Startup command failed:`, command, error);
        const failure: StartupCommandFailure = {
          command,
          message: error instanceof Error ? error.message : String(error),
        };
        failures.push(failure);
        try {
          options.onFailure?.(failure);
        } catch (reportError) {
          console.error(`[CommandBus] onFailure threw:`, reportError);
        }
      }
    }
    this.startupCommandsDone.set(true);
    return failures;
  }
}

/** A startup command that threw, with the error's message. */
export interface StartupCommandFailure {
  command: AppCommand;
  message: string;
}
