import { Injectable } from '@angular/core';
import {ServerConfig, ServerConfigService} from './server-config.service';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Base interface for all configuration types
 */
export interface BaseConfig {
  ConfigType: string;
  ConfigName: string;
}

/**
 * Schema definition for a configuration type
 */
export interface ConfigSchema<T extends BaseConfig> {
  type: string;
  validate: (config: any) => boolean;
  createDefault: (name?: string) => T;
  normalize: (partialConfig: Partial<T>) => T;
}

/**
 * Global registry of configuration schemas
 * This is used by the decorator to register schemas
 */
export const GLOBAL_CONFIG_SCHEMAS: Map<string, ConfigSchema<any>> = new Map();

/**
 * Decorator for registering a configuration schema
 * @param schema The configuration schema to register
 */
export function RegisterConfigSchema<T extends BaseConfig>(schema: ConfigSchema<T>) {
  return function(target: any) {
    // Register the schema globally
    GLOBAL_CONFIG_SCHEMAS.set(schema.type, schema);
    console.log(`Registered config schema: ${schema.type}`);
    return target;
  };
}

/**
 * Central registry for subsystem configurations
 */
@Injectable({
  providedIn: 'root'
})
export class ConfigRegistry {
  private serverConfig: ServerConfig;

  constructor(private serverConfigService: ServerConfigService) {
    // Subscribe to config changes from the server config service
    this.serverConfig = serverConfigService.config;
  }

  /**
   * Get all registered configuration schemas
   */
  getRegisteredSchemas(): Map<string, ConfigSchema<any>> {
    return GLOBAL_CONFIG_SCHEMAS;
  }

  /**
   * Get a specific schema by type
   */
  getSchema<T extends BaseConfig>(configType: string): ConfigSchema<T> | undefined {
    return GLOBAL_CONFIG_SCHEMAS.get(configType) as ConfigSchema<T> | undefined;
  }


  /**
   * Gets all available configurations of a specific type
   */
  getConfigs<T extends BaseConfig>(configType: string): T[] {
    const schema = this.getSchema<T>(configType);
    if (!schema) {
      console.warn(`No schema registered for config type: ${configType}`);
      return [];
    }

    const allConfigs = this.serverConfigService.config.configs || [];
    const filteredConfigs = allConfigs.filter(config =>
      typeof config === 'object' &&
      config !== null &&
      config.ConfigType === configType
    );

    // Normalize and validate each config using the registered schema
    return filteredConfigs
      .filter(config => schema.validate(config))
      .map(config => schema.normalize(config as Partial<T>));
  }

  /**
   * Gets a specific configuration by type and name
   */
  getConfigByName<T extends BaseConfig>(configType: string, configName: string): T | undefined {
    const configs = this.getConfigs<T>(configType);
    return configs.find(config => config.ConfigName === configName);
  }

  /**
   * Gets all registered configuration types
   */
  getConfigTypes(): string[] {
    return Array.from(GLOBAL_CONFIG_SCHEMAS.keys());
  }

  /**
   * Gets configuration names for a specific type
   */
  getConfigNames(configType: string): string[] {
    const configs = this.getConfigs(configType);
    return configs.map(config => config.ConfigName);
  }

  /**
   * Creates a new configuration instance with default values
   */
  createConfig<T extends BaseConfig>(configType: string, configName: string): T | undefined {
    const schema = this.getSchema<T>(configType);
    if (!schema) {
      console.warn(`No schema registered for config type: ${configType}`);
      return undefined;
    }

    return schema.createDefault(configName);
  }
}
