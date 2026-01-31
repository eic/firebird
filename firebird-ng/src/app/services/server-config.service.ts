import { Injectable } from '@angular/core';
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
  configs: any[];
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
  private _config = deepCopy(defaultFirebirdConfig);
  private triedLoading = false;

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

  get config(): ServerConfig {
    if (!this.triedLoading) {
      this.triedLoading = true;
      console.error("[ServerConfigService] config() is called while config is not loaded")
    }
    return this._config;
  }

  async loadConfig(): Promise<void> {
    try {

      const jsoncData = await firstValueFrom(
        this.http.get(this.configUrl, { responseType: 'text' })
      );
      const loadedConfig = this.parseConfig(jsoncData);

      // Merge loadedConfig over default config
      this._config = { ...defaultFirebirdConfig, ...loadedConfig };

      this.registerConfigs();

      console.log("[ServerConfigService] Server config loaded file");
      console.log(`[ServerConfigService] Subsystems configs loaded: ${this._config?.configs?.length}`);
    } catch (error) {
      console.error(`Failed to load config: ${error}`);
      console.log(`[ServerConfigService] Default config will be used`);
    } finally {
      this.triedLoading = true;
    }
  }

  private registerConfigs(): void {
    if (this._config.configs && Array.isArray(this._config.configs)) {
      this._config.configs.forEach(configItem => {
        if (configItem.key && configItem.hasOwnProperty('value')) {
          this.configService.createConfig(configItem.key, configItem.value);
        }
      });
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
    this._config = {...defaultFirebirdConfig, ...value};
  }
}
