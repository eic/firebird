import { ConfigProperty } from './config-property';

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

    // Helper to inspect storage contents for testing
    getAll(): Map<string, string> {
        return new Map(this.storage);
    }
}

describe('ConfigProperty', () => {
    let mockStorage: MockStorage;

    beforeEach(() => {
        mockStorage = new MockStorage();
    });

    describe('constructor', () => {
        it('should initialize with default value when storage is empty', () => {
            const prop = new ConfigProperty('testKey', 'defaultValue', undefined, undefined, mockStorage);
            expect(prop.value).toBe('defaultValue');
        });

        it('should load value from storage if present', () => {
            // For string values, storage holds the raw string (not JSON-encoded)
            mockStorage.setItem('testKey', 'storedValue');
            const prop = new ConfigProperty('testKey', 'defaultValue', undefined, undefined, mockStorage);
            expect(prop.value).toBe('storedValue');
        });

        it('should use default if stored value fails validation', () => {
            // For string values, storage holds the raw string (not JSON-encoded)
            mockStorage.setItem('testKey', 'invalid');
            const validator = (v: string) => v.startsWith('valid');
            const prop = new ConfigProperty('testKey', 'validDefault', undefined, validator, mockStorage);
            expect(prop.value).toBe('validDefault');
        });
    });

    describe('setValue', () => {
        it('should update value and storage', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            prop.setValue('newValue');
            expect(prop.value).toBe('newValue');
            expect(mockStorage.getItem('testKey')).toBe('newValue');
        });

        it('should update timestamp when setting value', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            const beforeTime = Date.now();
            prop.setValue('newValue');
            const afterTime = Date.now();

            const timestamp = prop.getTimestamp();
            expect(timestamp).not.toBeNull();
            expect(timestamp!).toBeGreaterThanOrEqual(beforeTime);
            expect(timestamp!).toBeLessThanOrEqual(afterTime);
        });

        it('should use explicit timestamp when provided', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            const explicitTime = 1000000;
            prop.setValue('newValue', explicitTime);
            expect(prop.getTimestamp()).toBe(explicitTime);
        });

        it('should not update if explicit timestamp is older than stored', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            prop.setValue('first', 2000);
            prop.setValue('second', 1000); // older timestamp
            expect(prop.value).toBe('first');
        });

        it('should reject invalid values', () => {
            const validator = (v: number) => v > 0;
            const prop = new ConfigProperty<number>('testKey', 10, undefined, validator, mockStorage);
            prop.setValue(-5 as number);
            expect(prop.value).toBe(10); // unchanged
        });

        it('should call saveCallback after setting value', () => {
            const callback = vi.fn();
            const prop = new ConfigProperty('testKey', 'default', callback, undefined, mockStorage);
            prop.setValue('newValue');
            expect(callback).toHaveBeenCalled();
        });
    });

    describe('setDefault', () => {
        it('should reset value to default', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            prop.setValue('changed');
            expect(prop.value).toBe('changed');

            prop.setDefault();
            expect(prop.value).toBe('default');
        });

        it('should persist default value to storage', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            prop.setValue('changed');
            expect(mockStorage.getItem('testKey')).toBe('changed');

            prop.setDefault();
            expect(mockStorage.getItem('testKey')).toBe('default');
        });

        it('should update timestamp when setting default', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);

            // Set a value with an old timestamp
            const oldTime = 1000;
            prop.setValue('changed', oldTime);
            expect(prop.getTimestamp()).toBe(oldTime);

            // setDefault should update the timestamp to current time
            const beforeReset = Date.now();
            prop.setDefault();
            const afterReset = Date.now();

            const newTimestamp = prop.getTimestamp();
            expect(newTimestamp).not.toBeNull();
            expect(newTimestamp!).toBeGreaterThanOrEqual(beforeReset);
            expect(newTimestamp!).toBeLessThanOrEqual(afterReset);
        });

        it('should allow subsequent setValue after setDefault respects timestamp logic', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);

            // Set value with old timestamp
            prop.setValue('old', 1000);

            // Reset to default (gets current timestamp)
            prop.setDefault();
            const resetTimestamp = prop.getTimestamp();

            // Try to set with older timestamp - should be rejected
            prop.setValue('older', 500);
            expect(prop.value).toBe('default');

            // Set with newer timestamp - should succeed
            prop.setValue('newer', resetTimestamp! + 1000);
            expect(prop.value).toBe('newer');
        });

        it('should call saveCallback when setting default', () => {
            const callback = vi.fn();
            const prop = new ConfigProperty('testKey', 'default', callback, undefined, mockStorage);

            callback.mockClear();
            prop.setDefault();
            expect(callback).toHaveBeenCalled();
        });

        it('should notify subscribers when setting default', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            prop.setValue('changed');

            const values: string[] = [];
            prop.changes$.subscribe(v => values.push(v));

            prop.setDefault();

            expect(values).toContain('default');
        });
    });

    describe('value getter/setter', () => {
        it('should get current value', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            expect(prop.value).toBe('default');
        });

        it('should set value using property setter', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            prop.value = 'newValue';
            expect(prop.value).toBe('newValue');
        });
    });

    describe('key getter', () => {
        it('should return the key', () => {
            const prop = new ConfigProperty('myKey', 'default', undefined, undefined, mockStorage);
            expect(prop.key).toBe('myKey');
        });
    });

    describe('getTimestamp', () => {
        it('should return null when no timestamp is stored', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            // Before any setValue, there's no timestamp
            expect(prop.getTimestamp()).toBeNull();
        });

        it('should return timestamp after setValue', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            prop.setValue('value');
            expect(prop.getTimestamp()).not.toBeNull();
        });
    });

    describe('changes$ observable', () => {
        it('should emit initial value', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            let emittedValue: string | undefined;
            prop.changes$.subscribe(v => emittedValue = v);
            expect(emittedValue).toBe('default');
        });

        it('should emit on value changes', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            const values: string[] = [];
            prop.changes$.subscribe(v => values.push(v));

            prop.setValue('first');
            prop.setValue('second');

            expect(values).toEqual(['default', 'first', 'second']);
        });
    });

    describe('type handling', () => {
        it('should handle string values', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            prop.setValue('hello');
            expect(mockStorage.getItem('testKey')).toBe('hello');
        });

        it('should handle number values', () => {
            const prop = new ConfigProperty('testKey', 42, undefined, undefined, mockStorage);
            prop.setValue(100);
            expect(mockStorage.getItem('testKey')).toBe('100');
            expect(prop.value).toBe(100);
        });

        it('should handle boolean values', () => {
            const prop = new ConfigProperty('testKey', true, undefined, undefined, mockStorage);
            prop.setValue(false);
            expect(mockStorage.getItem('testKey')).toBe('false');
            expect(prop.value).toBe(false);
        });

        it('should handle object values', () => {
            const prop = new ConfigProperty<Record<string, number>>('testKey', { a: 1 }, undefined, undefined, mockStorage);
            prop.setValue({ b: 2 });
            expect(mockStorage.getItem('testKey')).toBe('{"b":2}');
            expect(prop.value).toEqual({ b: 2 });
        });

        it('should handle array values', () => {
            const prop = new ConfigProperty('testKey', [1, 2], undefined, undefined, mockStorage);
            prop.setValue([3, 4, 5]);
            expect(mockStorage.getItem('testKey')).toBe('[3,4,5]');
            expect(prop.value).toEqual([3, 4, 5]);
        });
    });
});
