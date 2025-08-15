import { PersistentProperty } from './persistent-property';

describe('ConfigProperty', () => {
  let mockStorage: { [key: string]: string };
  let mockStorageInterface: any;

  beforeEach(() => {
    // Create a mock storage that simulates localStorage
    mockStorage = {};
    mockStorageInterface = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => { mockStorage[key] = value; }
    };
  });

  afterEach(() => {
    mockStorage = {};
  });

  describe('Basic functionality', () => {
    it('should create with default value', () => {
      const config = new PersistentProperty('test', 'defaultValue', undefined, undefined, mockStorageInterface);
      expect(config.value).toBe('defaultValue');
    });

    it('should save and load string values', () => {
      const config = new PersistentProperty('test', 'default', undefined, undefined, mockStorageInterface);
      config.value = 'newValue';

      // Create a new instance to verify persistence
      const config2 = new PersistentProperty('test', 'default', undefined, undefined, mockStorageInterface);
      expect(config2.value).toBe('newValue');
    });

    it('should save and load object values', () => {
      const defaultObj = { name: 'default', count: 0 };
      const config = new PersistentProperty('test', defaultObj, undefined, undefined, mockStorageInterface);

      const newObj = { name: 'updated', count: 42 };
      config.value = newObj;

      // Create a new instance to verify persistence
      const config2 = new PersistentProperty('test', defaultObj, undefined, undefined, mockStorageInterface);
      expect(config2.value).toEqual(newObj);
    });

    it('should validate values when validator is provided', () => {
      const validator = (value: number) => value > 0 && value < 100;
      const config = new PersistentProperty<number>('test', 50, undefined, validator, mockStorageInterface);

      // Valid value should be accepted
      config.value = 75;
      expect(config.value).toBe(75);

      // Invalid value should be rejected
      const consoleSpy = spyOn(console, 'error');
      config.value = 150;
      expect(config.value).toBe(75); // Should still be the previous valid value
      expect(consoleSpy).toHaveBeenCalledWith('Validation failed for:', 150);
    });

    it('should call saveCallback when value is set', () => {
      const saveCallback = jasmine.createSpy('saveCallback');
      const config = new PersistentProperty('test', 'default', saveCallback, undefined, mockStorageInterface);

      config.value = 'newValue';
      expect(saveCallback).toHaveBeenCalled();
    });

    it('should emit changes through Observable', (done) => {
      const config = new PersistentProperty('test', 'initial', undefined, undefined, mockStorageInterface);

      let emissionCount = 0;
      const expectedValues = ['initial', 'second', 'third'];

      config.changes$.subscribe(value => {
        expect(value).toBe(expectedValues[emissionCount]);
        emissionCount++;

        if (emissionCount === 3) {
          done();
        }
      });

      config.value = 'second';
      config.value = 'third';
    });
  });

  describe('Time-based configuration', () => {
    it('should store timestamp when saving value without explicit time', () => {
      const config = new PersistentProperty('test', 'default', undefined, undefined, mockStorageInterface);
      const beforeTime = Date.now();

      config.value = 'newValue';

      const afterTime = Date.now();
      const storedTime = parseInt(mockStorage['test.time'], 10);

      expect(storedTime).toBeGreaterThanOrEqual(beforeTime);
      expect(storedTime).toBeLessThanOrEqual(afterTime);
    });

    it('should store timestamp with setValue when time is provided', () => {
      const config = new PersistentProperty('test', 'default', undefined, undefined, mockStorageInterface);
      const specificTime = 1234567890;

      config.setValue('newValue', specificTime);

      expect(mockStorage['test.time']).toBe('1234567890');
      expect(config.value).toBe('newValue');
    });

    it('should only update if provided timestamp is newer than stored', () => {
      const config = new PersistentProperty('test', 'default', undefined, undefined, mockStorageInterface);

      // Set initial value with timestamp
      config.setValue('value1', 1000);
      expect(config.value).toBe('value1');

      // Try to set with older timestamp - should be rejected
      const consoleSpy = spyOn(console, 'log');
      config.setValue('value2', 500);
      expect(config.value).toBe('value1'); // Should remain unchanged
      expect(consoleSpy).toHaveBeenCalled();

      // Set with newer timestamp - should be accepted
      config.setValue('value3', 1500);
      expect(config.value).toBe('value3');
    });

    it('should accept update when no timestamp exists in storage', () => {
      const config = new PersistentProperty('test', 'default', undefined, undefined, mockStorageInterface);

      // Manually set a value without timestamp (simulating old data)
      mockStorage['test'] = '"oldValue"';

      // Create new instance and update with timestamp
      const config2 = new PersistentProperty('test', 'default', undefined, undefined, mockStorageInterface);
      config2.setValue('newValue', 1000);

      expect(config2.value).toBe('newValue');
      expect(mockStorage['test.time']).toBe('1000');
    });

    it('should handle concurrent updates correctly', () => {
      // Simulate two different sources trying to update the same config
      const config1 = new PersistentProperty('shared', 'initial', undefined, undefined, mockStorageInterface);
      const config2 = new PersistentProperty('shared', 'initial', undefined, undefined, mockStorageInterface);

      // Source 1 updates at time 1000
      config1.setValue('update1', 1000);
      expect(config1.value).toBe('update1');

      // Source 2 tries to update with older timestamp - should fail
      const consoleSpy = spyOn(console, 'log');
      config2.setValue('update2', 900);

      // Reload config2 to get the latest value
      const config2Reloaded = new PersistentProperty('shared', 'initial', undefined, undefined, mockStorageInterface);
      expect(config2Reloaded.value).toBe('update1'); // Should still be update1

      // Source 2 updates with newer timestamp - should succeed
      config2.setValue('update3', 1100);
      const config1Reloaded = new PersistentProperty('shared', 'initial', undefined, undefined, mockStorageInterface);
      expect(config1Reloaded.value).toBe('update3');
    });

    it('should use current time when no timestamp is provided to setValue', () => {
      const config = new PersistentProperty('test', 'default', undefined, undefined, mockStorageInterface);
      const beforeTime = Date.now();

      config.setValue('newValue'); // No timestamp provided

      const afterTime = Date.now();
      const storedTime = parseInt(mockStorage['test.time'], 10);

      expect(storedTime).toBeGreaterThanOrEqual(beforeTime);
      expect(storedTime).toBeLessThanOrEqual(afterTime);
    });

    it('should not call saveCallback when update is rejected due to older timestamp', () => {
      const saveCallback = jasmine.createSpy('saveCallback');
      const config = new PersistentProperty('test', 'default', saveCallback, undefined, mockStorageInterface);

      // Set initial value with timestamp
      config.setValue('value1', 1000);
      expect(saveCallback).toHaveBeenCalledTimes(1);

      // Try to set with older timestamp
      saveCallback.calls.reset();
      config.setValue('value2', 500);
      expect(saveCallback).not.toHaveBeenCalled();
    });

    it('should not emit changes when update is rejected due to older timestamp', (done) => {
      const config = new PersistentProperty('test', 'initial', undefined, undefined, mockStorageInterface);

      // Set initial value with timestamp
      config.setValue('value1', 1000);

      let emissionCount = 0;
      config.changes$.subscribe(value => {
        emissionCount++;
        if (emissionCount === 1) {
          expect(value).toBe('value1'); // First emission from subscription
        } else if (emissionCount === 2) {
          expect(value).toBe('value3'); // Should skip value2
          done();
        } else {
          fail('Unexpected emission');
        }
      });

      // This should be rejected
      setTimeout(() => {
        config.setValue('value2', 500);

        // This should be accepted
        setTimeout(() => {
          config.setValue('value3', 1500);
        }, 10);
      }, 10);
    });

    it('should handle array values with timestamps correctly', () => {
      const config = new PersistentProperty<number[]>('test', [], undefined, undefined, mockStorageInterface);

      config.setValue([1, 2, 3], 1000);
      expect(config.value).toEqual([1, 2, 3]);
      expect(mockStorage['test.time']).toBe('1000');

      // Try to update with older timestamp
      config.setValue([4, 5, 6], 900);
      expect(config.value).toEqual([1, 2, 3]); // Should remain unchanged

      // Update with newer timestamp
      config.setValue([7, 8, 9], 1100);
      expect(config.value).toEqual([7, 8, 9]);
      expect(mockStorage['test.time']).toBe('1100');
    });
  });

  describe('Error handling', () => {
    it('should handle corrupted stored values gracefully', () => {
      // Store invalid JSON
      mockStorage['test'] = 'invalid json {]';

      const consoleSpy = spyOn(console, 'error');
      const config = new PersistentProperty('test', { default: true }, undefined, undefined, mockStorageInterface);

      expect(config.value).toEqual({ default: true }); // Should fall back to default
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle corrupted timestamp gracefully', () => {
      mockStorage['test'] = '"validValue"';
      mockStorage['test.time'] = 'not a number';

      const consoleSpy = spyOn(console, 'error');
      const config = new PersistentProperty('test', 'default', undefined, undefined, mockStorageInterface);

      // Should still allow updates when timestamp is corrupted
      config.setValue('newValue', 1000);
      expect(config.value).toBe('newValue');
    });

    it('should handle missing storage gracefully', () => {
      const brokenStorage = {
        getItem: () => { throw new Error('Storage error'); },
        setItem: () => { throw new Error('Storage error'); }
      };

      const consoleSpy = spyOn(console, 'error');
      const config = new PersistentProperty('test', 'default', undefined, undefined, brokenStorage);

      expect(config.value).toBe('default'); // Should use default value
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('setDefault method', () => {
    it('should reset value to default', () => {
      const config = new PersistentProperty('test', 'defaultValue', undefined, undefined, mockStorageInterface);

      config.value = 'newValue';
      expect(config.value).toBe('newValue');

      config.setDefault();
      expect(config.value).toBe('defaultValue');
    });
  });
});
