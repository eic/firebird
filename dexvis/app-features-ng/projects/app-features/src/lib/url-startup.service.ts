/**
 * The URL GET source: parses `window.location.search` at startup.
 *
 * Three kinds of parameters:
 * - `config.<key>=<value>`: session-scoped config overrides. They win over
 *   server and localStorage for THIS session and are never persisted.
 * - Shorthands, which are COMMANDS, not configs: the application registers
 *   them with `withUrlShorthand()`; `?file=<url>` can stand for
 *   `?cmd=open-file:<url>`. They apply in registration order.
 * - The generic `?cmd=type:arg;type:arg` list, parsed by
 *   `CommandBusService.parseCommandString()`.
 *
 * Commands are queued, not run: the page that hosts their effects calls
 * `CommandBusService.runStartupCommands()` once it is ready.
 *
 * Server `startupCommands` (from the server config) queue BEFORE URL
 * commands, so a URL deep link can follow up on, or override, what the
 * server started.
 */

import { Injectable, inject } from '@angular/core';
import { ConfigService } from './config.service';
import { ServerConfigService } from './server-config.service';
import { AppCommand, CommandBusService } from './command-bus.service';
import { URL_SHORTHANDS } from './tokens';

/** Query parameters with this prefix set session config values: `?config.<key>=<value>`. */
export const CONFIG_PARAM_PREFIX = 'config.';

@Injectable({ providedIn: 'root' })
export class UrlStartupService {
  private configService = inject(ConfigService);
  private serverConfig = inject(ServerConfigService);
  private commandBus = inject(CommandBusService);
  private shorthands = inject(URL_SHORTHANDS, { optional: true }) ?? [];

  /** Parses the current page URL. `provideAppFeatures()` calls it once, after the server config loaded. */
  parseCurrentUrl(): void {
    this.parse(new URLSearchParams(window.location.search));
  }

  /** Applies session config values and queues startup commands from `params`. */
  parse(params: URLSearchParams): void {
    // 1. Session config overrides
    for (const [key, value] of params.entries()) {
      if (key.startsWith(CONFIG_PARAM_PREFIX)) {
        this.configService.applySessionValue(key.substring(CONFIG_PARAM_PREFIX.length), value);
      }
    }

    // 2. Server startup commands (lower precedence: queued first)
    const serverCommands = this.parseServerStartupCommands();

    // 3. Application shorthands, then the generic ?cmd= grammar
    const urlCommands: AppCommand[] = [];
    for (const shorthand of this.shorthands) {
      const value = params.get(shorthand.param);
      if (value) urlCommands.push(this.commandBus.commandFromUrlArg(shorthand.commandType, value, 'url'));
    }
    const cmd = params.get('cmd');
    if (cmd) urlCommands.push(...this.commandBus.parseCommandString(cmd, 'url'));

    const all = [...serverCommands, ...urlCommands];
    if (all.length > 0) {
      console.log(`[UrlStartup] Queued ${all.length} startup command(s)`, all);
      this.commandBus.queueStartupCommands(all);
    }
  }

  private parseServerStartupCommands(): AppCommand[] {
    const entries = this.serverConfig.config.startupCommands ?? [];
    const commands: AppCommand[] = [];
    for (const entry of entries) {
      if (typeof entry === 'string') {
        commands.push(...this.commandBus.parseCommandString(entry, 'server'));
      } else if (entry && typeof entry['type'] === 'string') {
        commands.push({ ...(entry as AppCommand), source: 'server' });
      } else {
        console.warn('[UrlStartup] Ignoring malformed server startup command:', entry);
      }
    }
    return commands;
  }
}
