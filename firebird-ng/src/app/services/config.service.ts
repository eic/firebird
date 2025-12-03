import { Injectable } from '@angular/core';
import {ConfigProperty} from '../utils/config-property';

export interface ConfigSnapshot {
  configs: {
    [key: string]: {
      value: any;
      timestamp?: number;
    };
  };
  version?: string;
  exportedAt?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ConfigService {

  public configsByName: Map<string, ConfigProperty<any>> = new Map();

  // Generic getter with type safety

  public getConfig<T>(key: string): ConfigProperty<T> | undefined {
    return this.configsByName.get(key) as ConfigProperty<T> | undefined;
  }

  // Generic getter that throws if property doesn't exist
  public getConfigOrThrow<T>(key: string): ConfigProperty<T> {
    const property = this.configsByName.get(key);
    if (!property) {
      throw new Error(`Property '${key}' not found`);
    }
    return property as ConfigProperty<T>;
  }

  // Register a property
  public addConfig<T>(property: ConfigProperty<T>): ConfigProperty<T> {
    this.configsByName.set(property.key, property);
    return property;
  }

    // Register a property
  public createConfig<T>(key: string, value: T): ConfigProperty<T> {
    const config = new ConfigProperty(key, value);
    this.addConfig(config);
    return config;
  }

  /**
   * Loads default values for all registered configs
   */
  public loadDefaults(): void {
    this.configsByName.forEach((config) => {
      config.setDefault();
    });
  }

  /**
   * Loads default values for configs whose keys start with the specified prefix
   * @param prefix The prefix to filter config keys by (e.g., "ui" for all UI-related configs)
   */
  public loadDefaultsFor(prefix: string): void {
    this.configsByName.forEach((config, key) => {
      if (key.startsWith(prefix)) {
        config.setDefault();
      }
    });
  }

  /**
   * Exports all config values to a JSON object
   * @returns A snapshot of all current config values with metadata
   */
  public saveToJson(): ConfigSnapshot {
    const configs: ConfigSnapshot['configs'] = {};

    this.configsByName.forEach((config, key) => {
      configs[key] = {
        value: config.value,
        // We need to access the timestamp through reflection since it's private
        // In a real implementation, you might want to add a public getter for this
        timestamp: this.getConfigTimestamp(config)
      };
    });

    return {
      configs,
      version: '1.0',
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Loads config values from a JSON object
   * @param snapshot The config snapshot to load
   * @param overwriteNewer If true, overwrites even if existing values have newer timestamps
   */
  public loadFromJson(snapshot: ConfigSnapshot, overwriteNewer: boolean = false): void {
    if (!snapshot || !snapshot.configs) {
      throw new Error('Invalid config snapshot: missing configs object');
    }

    Object.entries(snapshot.configs).forEach(([key, configData]) => {
      const config = this.configsByName.get(key);
      if (config) {
        if (overwriteNewer) {
          // Force update, bypassing timestamp-based conflict resolution
          config.setValue(configData.value, undefined, true);
        } else {
          // Use the stored timestamp for time-based conflict resolution
          config.setValue(configData.value, configData.timestamp || Date.now());
        }
      } else {
        console.warn(`Config key '${key}' not found in registered configs, skipping...`);
      }
    });
  }

  /**
   * Helper method to get config timestamp
   */
  private getConfigTimestamp(config: ConfigProperty<any>): number | undefined {
    const timestamp = config.getTimestamp();
    return timestamp !== null ? timestamp : undefined;
  }

  constructor() {
  }
}
