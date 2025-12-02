import { TestBed } from '@angular/core/testing';
import { ConfigService, ConfigSnapshot } from './config.service';
import { ConfigProperty } from '../utils/config-property';

// Mock storage for testing
class MockStorage {
  private storage: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.storage.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.storage.set(key, value);
  }

  clear(): void {
    this.storage.clear();
  }
}

describe('ConfigService', () => {
  let service: ConfigService;
  let mockStorage: MockStorage;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConfigService);
    mockStorage = new MockStorage();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Config Management', () => {
    it('should add and retrieve config properties', () => {
      const config = new ConfigProperty('testKey', 'defaultValue', undefined, undefined, mockStorage);

      service.addConfig(config);

      const retrieved = service.getConfig<string>('testKey');
      expect(retrieved).toBe(config);
      expect(retrieved?.value).toBe('defaultValue');
    });

    it('should return undefined for non-existent config', () => {
      const retrieved = service.getConfig<string>('nonExistent');
      expect(retrieved).toBeUndefined();
    });

    it('should throw error when getting non-existent config with getConfigOrThrow', () => {
      expect(() => service.getConfigOrThrow<string>('nonExistent'))
        .toThrowError("Property 'nonExistent' not found");
    });

    it('should return config with getConfigOrThrow when it exists', () => {
      const config = new ConfigProperty('existingKey', 'value', undefined, undefined, mockStorage);
      service.addConfig(config);

      const retrieved = service.getConfigOrThrow<string>('existingKey');
      expect(retrieved).toBe(config);
    });
  });

  describe('loadDefaults', () => {
    it('should reset all configs to their default values', () => {
      const config1 = new ConfigProperty('key1', 'default1', undefined, undefined, mockStorage);
      const config2 = new ConfigProperty('key2', 100, undefined, undefined, mockStorage);

      service.addConfig(config1);
      service.addConfig(config2);

      // Change values
      config1.setValue('changed1');
      config2.setValue(200);

      expect(config1.value).toBe('changed1');
      expect(config2.value).toBe(200);

      // Load defaults
      service.loadDefaults();

      expect(config1.value).toBe('default1');
      expect(config2.value).toBe(100);
    });

    it('should handle empty config map', () => {
      expect(() => service.loadDefaults()).not.toThrow();
    });
  });

  describe('loadDefaultsFor', () => {
    it('should reset only configs with matching prefix', () => {
      const uiConfig1 = new ConfigProperty('ui.theme', 'light', undefined, undefined, mockStorage);
      const uiConfig2 = new ConfigProperty('ui.fontSize', 14, undefined, undefined, mockStorage);
      const apiConfig = new ConfigProperty('api.endpoint', 'http://localhost', undefined, undefined, mockStorage);

      service.addConfig(uiConfig1);
      service.addConfig(uiConfig2);
      service.addConfig(apiConfig);

      // Change values
      uiConfig1.setValue('dark');
      uiConfig2.setValue(16);
      apiConfig.setValue('http://production');

      // Load defaults only for ui configs
      service.loadDefaultsFor('ui');

      expect(uiConfig1.value).toBe('light');
      expect(uiConfig2.value).toBe(14);
      expect(apiConfig.value).toBe('http://production'); // Should not be reset
    });

    it('should handle prefix with no matching configs', () => {
      const config = new ConfigProperty('api.endpoint', 'http://localhost', undefined, undefined, mockStorage);
      service.addConfig(config);

      config.setValue('http://production');

      service.loadDefaultsFor('ui');

      expect(config.value).toBe('http://production'); // Should remain unchanged
    });

    it('should handle empty prefix', () => {
      const config = new ConfigProperty('key', 'default', undefined, undefined, mockStorage);
      service.addConfig(config);

      config.setValue('changed');

      // Empty prefix should match all
      service.loadDefaultsFor('');

      expect(config.value).toBe('default');
    });
  });

  describe('saveToJson', () => {
    it('should export all configs to JSON snapshot', () => {
      const config1 = new ConfigProperty('key1', 'value1', undefined, undefined, mockStorage);
      const config2 = new ConfigProperty('key2', 42, undefined, undefined, mockStorage);
      const config3 = new ConfigProperty('key3', { nested: 'object' }, undefined, undefined, mockStorage);

      service.addConfig(config1);
      service.addConfig(config2);
      service.addConfig(config3);

      const snapshot = service.saveToJson();

      expect(snapshot.configs).toBeDefined();
      expect(snapshot.configs['key1'].value).toBe('value1');
      expect(snapshot.configs['key2'].value).toBe(42);
      expect(snapshot.configs['key3'].value).toEqual({ nested: 'object' });
      expect(snapshot.version).toBe('1.0');
      expect(snapshot.exportedAt).toBeDefined();
    });

    it('should include metadata in snapshot', () => {
      const snapshot = service.saveToJson();

      expect(snapshot.version).toBe('1.0');
      expect(snapshot.exportedAt).toBeDefined();

      // Verify exportedAt is a valid ISO date string
      const date = new Date(snapshot.exportedAt!);
      expect(date.toISOString()).toBe(snapshot.exportedAt!);
    });

    it('should handle empty config map', () => {
      const snapshot = service.saveToJson();

      expect(snapshot.configs).toEqual({});
      expect(snapshot.version).toBe('1.0');
      expect(snapshot.exportedAt).toBeDefined();
    });
  });

  describe('loadFromJson', () => {
    it('should import configs from JSON snapshot', () => {
      const config1 = new ConfigProperty('key1', 'default1', undefined, undefined, mockStorage);
      const config2 = new ConfigProperty('key2', 0, undefined, undefined, mockStorage);

      service.addConfig(config1);
      service.addConfig(config2);

      const snapshot: ConfigSnapshot = {
        configs: {
          key1: { value: 'imported1' },
          key2: { value: 99 }
        },
        version: '1.0',
        exportedAt: new Date().toISOString()
      };

      service.loadFromJson(snapshot);

      expect(config1.value).toBe('imported1');
      expect(config2.value).toBe(99);
    });

    it('should warn about configs not found in service', () => {
      const consoleWarnSpy = spyOn(console, 'warn');
      const config = new ConfigProperty('existing', 'value', undefined, undefined, mockStorage);
      service.addConfig(config);

      const snapshot: ConfigSnapshot = {
        configs: {
          existing: { value: 'updated' },
          nonExisting: { value: 'ignored' }
        }
      };

      service.loadFromJson(snapshot);

      expect(config.value).toBe('updated');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Config key 'nonExisting' not found in registered configs, skipping..."
      );
    });

    it('should respect timestamp-based conflict resolution when overwriteNewer is false', () => {
      const config = new ConfigProperty('key', 'default', undefined, undefined, mockStorage);
      service.addConfig(config);

      // Set a value with a recent timestamp
      config.setValue('current', Date.now());

      // Try to load an older value
      const snapshot: ConfigSnapshot = {
        configs: {
          key: {
            value: 'older',
            timestamp: Date.now() - 10000 // 10 seconds ago
          }
        }
      };

      service.loadFromJson(snapshot, false);

      // Value should remain 'current' because its timestamp is newer
      expect(config.value).toBe('current');
    });

    it('should force overwrite when overwriteNewer is true', () => {
      const config = new ConfigProperty('key', 'default', undefined, undefined, mockStorage);
      service.addConfig(config);

      // Set a value with a recent timestamp
      config.setValue('current', Date.now());

      // Load value regardless of timestamp
      const snapshot: ConfigSnapshot = {
        configs: {
          key: {
            value: 'forced',
            timestamp: Date.now() - 10000 // 10 seconds ago
          }
        }
      };

      service.loadFromJson(snapshot, true);

      // Value should be 'forced' despite older timestamp
      expect(config.value).toBe('forced');
    });

    it('should throw error for invalid snapshot', () => {
      expect(() => service.loadFromJson(null as any))
        .toThrowError('Invalid config snapshot: missing configs object');

      expect(() => service.loadFromJson({} as any))
        .toThrowError('Invalid config snapshot: missing configs object');
    });

    it('should handle snapshot without timestamps', () => {
      const config = new ConfigProperty('key', 'default', undefined, undefined, mockStorage);
      service.addConfig(config);

      const snapshot: ConfigSnapshot = {
        configs: {
          key: { value: 'noTimestamp' }
        }
      };

      service.loadFromJson(snapshot);

      expect(config.value).toBe('noTimestamp');
    });
  });

  describe('Integration tests', () => {
    it('should roundtrip configs through JSON', () => {
      // Setup initial configs
      const stringConfig = new ConfigProperty('str', 'hello', undefined, undefined, mockStorage);
      const numberConfig = new ConfigProperty('num', 42, undefined, undefined, mockStorage);
      const boolConfig = new ConfigProperty('bool', true, undefined, undefined, mockStorage);
      const objectConfig = new ConfigProperty('obj', { a: 1, b: 'test' }, undefined, undefined, mockStorage);

      service.addConfig(stringConfig);
      service.addConfig(numberConfig);
      service.addConfig(boolConfig);
      service.addConfig(objectConfig);

      // Export to JSON
      const exported = service.saveToJson();

      // Change all values
      stringConfig.setValue('changed');
      numberConfig.setValue(100);
      boolConfig.setValue(false);
      objectConfig.setValue({ c: 3 } as any);

      // Import back from JSON
      service.loadFromJson(exported);

      // Verify original values restored
      expect(stringConfig.value).toBe('hello');
      expect(numberConfig.value).toBe(42);
      expect(boolConfig.value).toBe(true);
      expect(objectConfig.value).toEqual({ a: 1, b: 'test' });
    });

    it('should handle complex workflow with prefix-based defaults', () => {
      // Setup configs with different prefixes
      const uiTheme = new ConfigProperty('ui.theme', 'light', undefined, undefined, mockStorage);
      const uiFont = new ConfigProperty('ui.font', 'Arial', undefined, undefined, mockStorage);
      const apiUrl = new ConfigProperty('api.url', 'http://localhost', undefined, undefined, mockStorage);
      const apiTimeout = new ConfigProperty('api.timeout', 5000, undefined, undefined, mockStorage);

      service.addConfig(uiTheme);
      service.addConfig(uiFont);
      service.addConfig(apiUrl);
      service.addConfig(apiTimeout);

      // Modify values
      uiTheme.setValue('dark');
      uiFont.setValue('Roboto');
      apiUrl.setValue('http://production');
      apiTimeout.setValue(10000);

      // Export current state
      const snapshot = service.saveToJson();

      // Reset UI configs only
      service.loadDefaultsFor('ui');
      expect(uiTheme.value).toBe('light');
      expect(uiFont.value).toBe('Arial');
      expect(apiUrl.value).toBe('http://production');
      expect(apiTimeout.value).toBe(10000);

      // Restore from snapshot
      service.loadFromJson(snapshot);
      expect(uiTheme.value).toBe('dark');
      expect(uiFont.value).toBe('Roboto');
      expect(apiUrl.value).toBe('http://production');
      expect(apiTimeout.value).toBe(10000);

      // Reset all to defaults
      service.loadDefaults();
      expect(uiTheme.value).toBe('light');
      expect(uiFont.value).toBe('Arial');
      expect(apiUrl.value).toBe('http://localhost');
      expect(apiTimeout.value).toBe(5000);
    });
  });
});
