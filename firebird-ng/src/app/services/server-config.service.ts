import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as jsoncParser from 'jsonc-parser';
import {deepCopy} from "../utils/deep-copy";
import {firstValueFrom} from "rxjs";
import { ConfigService } from './config.service';


export interface ServerConfig {
  servedByPyrobird: boolean;
  apiAvailable: boolean;
  apiBaseUrl: string;
  logLevel: string;
  /** Server-provided config values: [{key, value}] entries. */
  configs: any[];
  /** Server-provided config values as a {key: value} map (pyrobird `userConfigs`). */
  userConfigs?: Record<string, unknown>;
  /** Commands to run once the display is ready: FbCommand objects or 'type:arg' strings. */
  startupCommands?: Array<Record<string, unknown> | string>;
}

export const defaultFirebirdConfig: ServerConfig = {
  apiAvailable: false,
  apiBaseUrl: "",
  servedByPyrobird: false,
  logLevel: 'info',
  configs: []
};


@Injectable({
  providedIn: 'root'
})
export class ServerConfigService {
  private configUrl = 'assets/config.jsonc'; // URL to the JSONC config file
  private triedLoading = false;

  /**
   * The loaded server config as a signal. The object is REPLACED when the
   * async load completes — bind through this signal, never snapshot
   * `config` by reference at construction time.
   */
  public readonly configSignal = signal<ServerConfig>(deepCopy(defaultFirebirdConfig));

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

  get config(): ServerConfig {
    if (!this.triedLoading) {
      this.triedLoading = true;
      console.error("[ServerConfigService] config() is called while config is not loaded")
    }
    return this.configSignal();
  }

  async loadConfig(): Promise<void> {
    try {

      const jsoncData = await firstValueFrom(
        this.http.get(this.configUrl, { responseType: 'text' })
      );
      const loadedConfig = this.parseConfig(jsoncData);

      // Merge loadedConfig over default config
      const config = { ...defaultFirebirdConfig, ...loadedConfig };
      this.configSignal.set(config);

      this.registerConfigs(config);

      console.log("[ServerConfigService] Server config loaded file");
      console.log(`[ServerConfigService] Subsystems configs loaded: ${config?.configs?.length}`);
    } catch (error) {
      console.error(`Failed to load config: ${error}`);
      console.log(`[ServerConfigService] Default config will be used`);
    } finally {
      this.triedLoading = true;
    }
  }

  /**
   * Feeds server-provided config values into the config registry's SERVER
   * layer (overrides code defaults; yields to localStorage/URL/runtime).
   * Accepts both shapes: `configs: [{key, value}]` and `userConfigs: {key: value}`.
   */
  private registerConfigs(config: ServerConfig): void {
    if (config.configs && Array.isArray(config.configs)) {
      config.configs.forEach(configItem => {
        if (configItem.key && configItem.hasOwnProperty('value')) {
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

  private parseConfig(jsoncData: string): Partial<ServerConfig> {
    try {
      return jsoncParser.parse(jsoncData);
    } catch (parseError) {
      console.error('Error parsing JSONC data', parseError);
      return {};
    }
  }

  /**
   * Sets the configuration - intended for use in unit tests only.
   * This method is safeguarded to be operational only in non-production environments.
   */
  public setUnitTestConfig(value: Partial<ServerConfig>) {
    this.triedLoading = true;
    this.configSignal.set({...defaultFirebirdConfig, ...value});
  }
}
