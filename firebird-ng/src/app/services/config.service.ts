import { Injectable } from '@angular/core';
import {ConfigProperty, ConfigPropertyMeta} from '../utils/config-property';

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

/** Declarative config entry schema — usable by core, painters, and extensions alike. */
export interface ConfigSchema<T> extends ConfigPropertyMeta {
  key: string;
  default: T;
  validator?: (value: T) => boolean;
}

/**
 * The config registry. One canonical ConfigProperty per key, with layered
 * source precedence: defaults < server < localStorage < URL < runtime.
 *
 * Sources may arrive before the code that declares a key runs (server config
 * loads at app init; components declare their configs in constructors), so
 * server/URL/feature-default values for not-yet-declared keys are kept pending
 * and applied at declaration time.
 */
@Injectable({
  providedIn: 'root',
})
export class ConfigService {

  public configsByName: Map<string, ConfigProperty<any>> = new Map();

  /** Values that arrived before their key was declared, per layer. */
  private pendingServerValues = new Map<string, unknown>();
  private pendingSessionValues = new Map<string, unknown>();
  private pendingFeatureDefaults = new Map<string, unknown>();

  // Generic getter with type safety

  public getConfig<T>(key: string): ConfigProperty<T> | undefined {
    return this.configsByName.get(key) as ConfigProperty<T> | undefined;
  }

  public getConfigOrCreate<T>(key: string, value: T): ConfigProperty<T> {
    let property = this.configsByName.get(key);
    if (!property) {
      property = this.createConfig(key, value);
    }
    return property as ConfigProperty<T>;
  }

  // Generic getter that throws if property doesn't exist
  public getConfigOrThrow<T>(key: string): ConfigProperty<T> {
    const property = this.configsByName.get(key);
    if (!property) {
      throw new Error(`Property '${key}' not found`);
    }
    return property as ConfigProperty<T>;
  }

  /**
   * Registers a property, or returns the EXISTING one when the key is already
   * registered. There is exactly one canonical instance per key — callers must
   * use the returned instance, not the one they constructed:
   * `this.myConfig = configService.addConfig(new ConfigProperty(...))`.
   */
  public addConfig<T>(property: ConfigProperty<T>): ConfigProperty<T> {
    const existing = this.configsByName.get(property.key);
    if (existing) {
      return existing as ConfigProperty<T>;
    }
    this.configsByName.set(property.key, property);
    this.applyPendingLayers(property);
    return property;
  }

    // Register a property
  public createConfig<T>(key: string, value: T): ConfigProperty<T> {
    const config = new ConfigProperty(key, value);
    return this.addConfig(config);
  }

  /**
   * Declares a config entry with schema metadata (label, options, ranges…).
   * Creates the property or attaches metadata to the existing one.
   * This is the entry point extensions use for their own configs.
   */
  public declare<T>(schema: ConfigSchema<T>): ConfigProperty<T> {
    let property = this.getConfig<T>(schema.key);
    if (!property) {
      property = this.addConfig(new ConfigProperty<T>(schema.key, schema.default, undefined, schema.validator));
    }
    const { key, default: _default, validator, ...meta } = schema;
    property.meta = { ...property.meta, ...meta };
    return property;
  }

  /** Applies layered values that arrived before this key was declared. */
  private applyPendingLayers(property: ConfigProperty<any>): void {
    const key = property.key;
    if (this.pendingFeatureDefaults.has(key)) {
      property.overrideDefault(this.pendingFeatureDefaults.get(key));
      this.pendingFeatureDefaults.delete(key);
    }
    if (this.pendingServerValues.has(key)) {
      property.setServerValue(this.pendingServerValues.get(key));
      this.pendingServerValues.delete(key);
    }
    if (this.pendingSessionValues.has(key)) {
      property.setSessionValue(this.pendingSessionValues.get(key));
      this.pendingSessionValues.delete(key);
    }
  }

  /** SERVER layer entry point (config.jsonc / pyrobird values). */
  public applyServerValue(key: string, value: unknown): void {
    const property = this.configsByName.get(key);
    if (property) {
      property.setServerValue(value);
    } else {
      this.pendingServerValues.set(key, value);
    }
  }

  /** URL/session layer entry point (`?config.key=value`). Never persisted. */
  public applySessionValue(key: string, value: unknown): void {
    const property = this.configsByName.get(key);
    if (property) {
      property.setSessionValue(value);
    } else {
      this.pendingSessionValues.set(key, value);
    }
  }

  /** Feature-pack defaults (`withConfigDefaults`) — the lowest precedence tier. */
  public applyFeatureDefaults(defaults: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(defaults)) {
      const property = this.configsByName.get(key);
      if (property) {
        property.overrideDefault(value);
      } else {
        this.pendingFeatureDefaults.set(key, value);
      }
    }
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
