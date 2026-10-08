import { Injectable, inject } from '@angular/core';
import {
  ConfigProperty,
  ConfigPropertyMeta,
  LocalStoragePropertyStorage,
  PersistentPropertyStorage,
} from './config-property';
import { CONFIG_STORAGE_OPTIONS, type ConfigStorageOptions } from './tokens';

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
 *
 * Declare each key once, from one shared schema. The first declaration
 * decides the default and the validator; in development builds a later
 * declaration that disagrees logs a warning. A placeholder (see
 * `getConfigOrPlaceholder()`) is the exception: the first real declaration
 * replaces its provisional default.
 */
@Injectable({
  providedIn: 'root',
  useFactory: () => new ConfigService(inject(CONFIG_STORAGE_OPTIONS, { optional: true }) ?? {}),
})
export class ConfigService {

  public configsByName: Map<string, ConfigProperty<any>> = new Map();

  /** Where the properties this service creates persist their values. */
  readonly storage: PersistentPropertyStorage;

  /** Values that arrived before their key was declared, per layer. */
  private pendingServerValues = new Map<string, unknown>();
  private pendingSessionValues = new Map<string, unknown>();
  private pendingFeatureDefaults = new Map<string, unknown>();

  /** Keys registered by getConfigOrPlaceholder() and not declared since. */
  private placeholders = new Set<string>();

  constructor(options: ConfigStorageOptions = {}) {
    this.storage = new LocalStoragePropertyStorage(options.prefix ?? '');
  }

  // Generic getter with type safety

  public getConfig<T>(key: string): ConfigProperty<T> | undefined {
    return this.configsByName.get(key) as ConfigProperty<T> | undefined;
  }

  /**
   * Returns the property for `key`, declaring it with the default `value`
   * when the key is new. Same rules as `declare()`.
   */
  public getConfigOrCreate<T>(key: string, value: T): ConfigProperty<T> {
    const existing = this.configsByName.get(key) as ConfigProperty<T> | undefined;
    if (existing) {
      return this.reconcile(existing, value, undefined);
    }
    return this.register(new ConfigProperty<T>(key, value, undefined, undefined, this.storage));
  }

  /**
   * Returns the property for `key`; when no code declared the key yet,
   * registers a PLACEHOLDER whose provisional default is `sample`. Use it
   * where a value arrives for a key that the code that owns it may not have
   * declared yet, such as a `set-config` command. The first real declaration
   * (`declare()`, `addConfig()`, `getConfigOrCreate()`, `createConfig()`)
   * replaces the placeholder's default and validator and re-reads the other
   * layers with the declared type.
   */
  public getConfigOrPlaceholder<T>(key: string, sample: T): ConfigProperty<T> {
    const existing = this.configsByName.get(key) as ConfigProperty<T> | undefined;
    if (existing) {
      return existing;
    }
    this.placeholders.add(key);
    return this.register(new ConfigProperty<T>(key, sample, undefined, undefined, this.storage));
  }

  /** True when code declared `key`; false for unknown keys and placeholders. */
  public isDeclared(key: string): boolean {
    return this.configsByName.has(key) && !this.placeholders.has(key);
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
    const existing = this.configsByName.get(property.key) as ConfigProperty<T> | undefined;
    if (existing) {
      return this.reconcile(existing, property.codeDefault, property.validator);
    }
    return this.register(property);
  }

  // Register a property
  public createConfig<T>(key: string, value: T): ConfigProperty<T> {
    return this.getConfigOrCreate(key, value);
  }

  /**
   * Declares a config entry with schema metadata (label, options, ranges…).
   * Creates the property or attaches metadata to the existing one.
   * This is the entry point extensions use for their own configs.
   */
  public declare<T>(schema: ConfigSchema<T>): ConfigProperty<T> {
    const existing = this.getConfig<T>(schema.key);
    const property = existing
      ? this.reconcile(existing, schema.default, schema.validator)
      : this.register(new ConfigProperty<T>(schema.key, schema.default, undefined, schema.validator, this.storage));
    const { key, default: _default, validator, ...meta } = schema;
    property.meta = { ...property.meta, ...meta };
    return property;
  }

  /** Adds a new property and applies the layers that waited for its key. */
  private register<T>(property: ConfigProperty<T>): ConfigProperty<T> {
    this.configsByName.set(property.key, property);
    this.applyPendingLayers(property);
    return property;
  }

  /**
   * A declaration for a key that already has a property: upgrades a
   * placeholder; otherwise keeps the first declaration and, in development
   * builds, warns when this one disagrees with it.
   */
  private reconcile<T>(
    existing: ConfigProperty<T>,
    defaultValue: T,
    validator: ((value: T) => boolean) | undefined,
  ): ConfigProperty<T> {
    if (this.placeholders.delete(existing.key)) {
      existing.redeclare(defaultValue, validator);
      return existing;
    }
    if (typeof ngDevMode !== 'undefined' && ngDevMode) {
      const problems: string[] = [];
      if (!sameValue(existing.codeDefault, defaultValue)) {
        problems.push(`default ${describe(defaultValue)} (in effect: ${describe(existing.codeDefault)})`);
      }
      if (validator && !sameFunction(existing.validator, validator)) {
        problems.push(existing.validator ? 'a different validator' : 'a validator (in effect: none)');
      }
      if (problems.length > 0) {
        console.warn(`[ConfigService] Key '${existing.key}' is declared again with ${problems.join(' and ')}. ` +
          'The first declaration stays in effect; declare the key once and share its schema.');
      }
    }
    return existing;
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

  /** SERVER layer entry point (config.jsonc served by the backend). */
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
   * Resets every registered key: removes stored values and URL overrides, so
   * each value falls back to its server value or default (see
   * `ConfigProperty.setDefault()`).
   */
  public loadDefaults(): void {
    this.configsByName.forEach((config) => {
      config.setDefault();
    });
  }

  /**
   * Resets the keys that start with `prefix`, like `loadDefaults()`.
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
}

/** True for equal primitives and for objects with equal JSON. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** True for the same function, or two functions with the same source (inline arrows). */
function sameFunction(a: Function | undefined, b: Function | undefined): boolean {
  return a === b || (!!a && !!b && a.toString() === b.toString());
}

function describe(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
