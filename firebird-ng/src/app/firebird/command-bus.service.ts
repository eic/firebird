/**
 * The Firebird command bus, light edition.
 *
 * Every external state source — URL deep links, server startup config, batch
 * scripting — produces the same serializable commands. The dispatcher is a
 * plain Angular service; handlers are contributed through the COMMAND_HANDLERS
 * token (`withCommandHandler()`), so extensions add commands the same way
 * built-ins do.
 *
 * Deliberately NOT here: undo/rewind, command journaling, session replay.
 * The `source` field exists so journaling can be added later without
 * changing dispatch call sites.
 */

import { Injectable, inject, signal } from '@angular/core';
import { COMMAND_HANDLERS } from './tokens';

/** A serializable command. `type` selects the handler; other fields are its arguments. */
export interface FbCommand {
  type: string;
  /** Where the command came from; used for logging and future journaling. */
  source?: 'url' | 'server' | 'batch' | 'ui' | 'code';
  [key: string]: unknown;
}

/**
 * A command handler contributed via `withCommandHandler()`.
 * One handler per command type; later registrations override earlier ones
 * (an extension may replace a built-in command deliberately).
 */
export interface CommandHandler {
  readonly type: string;
  execute(command: FbCommand): Promise<void> | void;
  /**
   * Optional: turn the `?cmd=type:arg` URL-grammar argument into the full
   * command. Without it the argument lands as `{ type, value: arg }`.
   */
  fromUrlArg?(arg: string): FbCommand;
}

@Injectable({ providedIn: 'root' })
export class CommandBusService {
  private handlersByType = new Map<string, CommandHandler>();

  /** Commands queued before the display initialized; run by runStartupCommands(). */
  private startupQueue: FbCommand[] = [];

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
  async dispatch(command: FbCommand): Promise<void> {
    const handler = this.handlersByType.get(command.type);
    if (!handler) {
      throw new Error(`[CommandBus] No handler for command type '${command.type}'. Known: ${this.knownTypes.join(', ')}`);
    }
    console.log(`[CommandBus] dispatch`, command);
    await handler.execute(command);
  }

  /** Executes commands sequentially; each awaits the previous one. */
  async dispatchAll(commands: FbCommand[]): Promise<void> {
    for (const command of commands) {
      await this.dispatch(command);
    }
  }

  /**
   * Parses the `?cmd=` URL grammar: semicolon-separated `type` or `type:arg`
   * items, e.g. `cmd=show-event:2;camera-preset:farforward`.
   * The arg (everything after the first colon) may itself contain colons (URLs).
   */
  parseCommandString(text: string, source: FbCommand['source'] = 'url'): FbCommand[] {
    const commands: FbCommand[] = [];
    for (const item of text.split(';').map(s => s.trim()).filter(Boolean)) {
      const colon = item.indexOf(':');
      const type = colon < 0 ? item : item.substring(0, colon);
      const arg = colon < 0 ? '' : item.substring(colon + 1);
      const handler = this.handlersByType.get(type);
      const command = handler?.fromUrlArg && arg !== ''
        ? handler.fromUrlArg(arg)
        : (arg !== '' ? { type, value: arg } : { type });
      commands.push({ ...command, source });
    }
    return commands;
  }

  /** Adds commands to the startup queue (run once the display is ready). */
  queueStartupCommands(commands: FbCommand[]): void {
    this.startupQueue.push(...commands);
  }

  /** The queued startup commands (read-only; used by the display to skip double loads). */
  peekStartupCommands(): readonly FbCommand[] {
    return this.startupQueue;
  }

  /**
   * Runs the startup queue sequentially, then marks startup done.
   * Called by the display page after the scene initialized. Errors are logged
   * per command; one failing command does not stop the rest.
   */
  async runStartupCommands(): Promise<void> {
    const queue = this.startupQueue;
    this.startupQueue = [];
    for (const command of queue) {
      try {
        await this.dispatch(command);
      } catch (error) {
        console.error(`[CommandBus] Startup command failed:`, command, error);
      }
    }
    this.startupCommandsDone.set(true);
  }
}
