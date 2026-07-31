/**
 * The URL GET source: parses `window.location.search` at startup.
 *
 * Two kinds of parameters:
 * - `config.<key>=<value>` — session-scoped config overrides. They win over
 *   server and localStorage for THIS session and are never persisted.
 * - Ergonomic shorthands, which are COMMANDS, not configs:
 *   `?dex=<url>` `?geometry=<url>` `?event=<N>` and the generic
 *   `?cmd=type:arg;type:arg` grammar. Commands are queued and run by the
 *   display page once the scene is initialized.
 *
 * Server `startupCommands` (from config.jsonc) queue BEFORE URL commands, so a
 * URL deep link can follow up on / override what the server started.
 */

import { Injectable, inject } from '@angular/core';
import { ConfigService } from '../services/config.service';
import { ServerConfigService } from '../services/server-config.service';
import { CommandBusService, FbCommand } from './command-bus.service';

const CONFIG_PARAM_PREFIX = 'config.';

@Injectable({ providedIn: 'root' })
export class UrlStartupService {
  private configService = inject(ConfigService);
  private serverConfig = inject(ServerConfigService);
  private commandBus = inject(CommandBusService);

  /** Called once from the provideFirebird app initializer (after server config load). */
  parseCurrentUrl(): void {
    this.parse(new URLSearchParams(window.location.search));
  }

  /** Separated from parseCurrentUrl for testability. */
  parse(params: URLSearchParams): void {
    // 1. Session config overrides
    for (const [key, value] of params.entries()) {
      if (key.startsWith(CONFIG_PARAM_PREFIX)) {
        this.configService.applySessionValue(key.substring(CONFIG_PARAM_PREFIX.length), value);
      }
    }

    // 2. Server startup commands (lower precedence: queued first)
    const serverCommands = this.parseServerStartupCommands();

    // 3. URL shorthand commands + generic ?cmd= grammar
    const urlCommands: FbCommand[] = [];
    const geometry = params.get('geometry');
    if (geometry) urlCommands.push({ type: 'open-geometry', url: geometry, source: 'url' });
    const dex = params.get('dex');
    if (dex) urlCommands.push({ type: 'open-dex', url: dex, source: 'url' });
    const event = params.get('event');
    if (event !== null && event !== '') {
      urlCommands.push({ type: 'show-event', index: parseInt(event, 10), source: 'url' });
    }
    const cmd = params.get('cmd');
    if (cmd) urlCommands.push(...this.commandBus.parseCommandString(cmd, 'url'));

    const all = [...serverCommands, ...urlCommands];
    if (all.length > 0) {
      console.log(`[UrlStartup] Queued ${all.length} startup command(s)`, all);
      this.commandBus.queueStartupCommands(all);
    }
  }

  private parseServerStartupCommands(): FbCommand[] {
    const entries = this.serverConfig.config.startupCommands ?? [];
    const commands: FbCommand[] = [];
    for (const entry of entries) {
      if (typeof entry === 'string') {
        commands.push(...this.commandBus.parseCommandString(entry, 'server'));
      } else if (entry && typeof entry['type'] === 'string') {
        commands.push({ ...(entry as FbCommand), source: 'server' });
      } else {
        console.warn('[UrlStartup] Ignoring malformed server startup command:', entry);
      }
    }
    return commands;
  }
}
