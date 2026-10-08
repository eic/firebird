import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as jsoncParser from 'jsonc-parser';
import { firstValueFrom } from 'rxjs';
import { deepCopy } from './deep-copy';
import { ConfigService } from './config.service';
import { SERVER_CONFIG_OPTIONS } from './tokens';

/** Where the server config file is fetched from unless `withServerConfig({ url })` says otherwise. */
export const DEFAULT_SERVER_CONFIG_URL = 'assets/config.jsonc';

/**
 * The fields of the server config file that this package reads. An
 * application extends this interface with its own fields (backend flags, API
 * base URL, catalogs) and reads them through `ServerConfigService<T>`.
 */
export interface ServerConfigBase {
  /** Config values for the SERVER layer as `[{ key, value }]` entries. */
  configs?: Array<{ key: string; value: unknown }>;
  /** Config values for the SERVER layer as a `{ key: value }` map. */
  userConfigs?: Record<string, unknown>;
  /** Commands to run once the application is ready: command objects or `'type:arg'` strings. */
  startupCommands?: Array<Record<string, unknown> | string>;
}

/**
 * Loads the server config file (JSONC) and feeds its config values into the
 * SERVER layer of `ConfigService`.
 *
 * A backend that serves the application may rewrite the file on the fly; a
 * static deployment serves the built file as is. `provideAppFeatures()` calls
 * `loadConfig()` once, from the app initializer.
 *
 * Type the instance with the application's config shape:
 *
 * ```ts
 * interface MyServerConfig extends ServerConfigBase { apiBaseUrl: string }
 * private serverConfig = inject<ServerConfigService<MyServerConfig>>(ServerConfigService);
 * ```
 *
 * Requires `HttpClient` (`provideHttpClient()`).
 */
@Injectable({
  providedIn: 'root'
})
export class ServerConfigService<T extends ServerConfigBase = ServerConfigBase> {
  private readonly http = inject(HttpClient);
  private readonly configService = inject(ConfigService);
  private readonly configUrl: string;
  private readonly defaults: T;
  private triedLoading = false;

  /**
   * The loaded server config as a signal. The object is REPLACED when the
   * async load completes: bind through this signal, never snapshot
   * `config` by reference at construction time.
   */
  public readonly configSignal: WritableSignal<T>;

  constructor() {
    const options = inject(SERVER_CONFIG_OPTIONS, { optional: true });
    this.configUrl = options?.url ?? DEFAULT_SERVER_CONFIG_URL;
    this.defaults = (options?.defaults ?? {}) as T;
    this.configSignal = signal<T>(deepCopy(this.defaults));
  }

  /** The current server config. Logs an error when read before `loadConfig()` ran. */
  get config(): T {
    if (!this.triedLoading) {
      this.triedLoading = true;
      console.error('[ServerConfigService] config() is called while config is not loaded');
    }
    return this.configSignal();
  }

  /**
   * Fetches and parses the config file, merges it over the defaults, and
   * feeds its config values into the SERVER layer. On any failure the
   * defaults stay in effect.
   */
  async loadConfig(): Promise<void> {
    try {
      const jsoncData = await firstValueFrom(
        this.http.get(this.configUrl, { responseType: 'text' })
      );
      const loadedConfig = this.parseConfig(jsoncData);

      // Merge the loaded config over the defaults
      const config = { ...this.defaults, ...loadedConfig } as T;
      this.configSignal.set(config);

      this.registerConfigs(config);

      console.log('[ServerConfigService] Server config loaded');
      console.log(`[ServerConfigService] Subsystems configs loaded: ${config?.configs?.length}`);
    } catch (error) {
      console.error(`Failed to load config: ${error}`);
      console.log('[ServerConfigService] Default config will be used');
    } finally {
      this.triedLoading = true;
    }
  }

  /**
   * Feeds server-provided config values into the config registry's SERVER
   * layer (overrides code defaults; yields to localStorage, URL and runtime).
   * Accepts both shapes: `configs: [{key, value}]` and `userConfigs: {key: value}`.
   */
  private registerConfigs(config: T): void {
    if (config.configs && Array.isArray(config.configs)) {
      config.configs.forEach(configItem => {
        if (configItem.key && 'value' in configItem) {
          this.configService.applyServerValue(configItem.key, configItem.value);
        }
      });
    }
    if (config.userConfigs && typeof config.userConfigs === 'object') {
      for (const [key, value] of Object.entries(config.userConfigs)) {
        this.configService.applyServerValue(key, value);
      }
    }
  }

  private parseConfig(jsoncData: string): Partial<T> {
    try {
      return jsoncParser.parse(jsoncData);
    } catch (parseError) {
      console.error('Error parsing JSONC data', parseError);
      return {};
    }
  }

  /** Replaces the config without loading the file. Use in unit tests only. */
  public setUnitTestConfig(value: Partial<T>) {
    this.triedLoading = true;
    this.configSignal.set({ ...this.defaults, ...value });
  }
}
