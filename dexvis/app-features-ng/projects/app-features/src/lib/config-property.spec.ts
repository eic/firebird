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

    removeItem(key: string): void {
        this.storage.delete(key);
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

        it('should remove the stored value and timestamp instead of writing the default', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            prop.setValue('changed', 1000);
            expect(mockStorage.getItem('testKey')).toBe('changed');

            prop.setDefault();
            expect(mockStorage.getItem('testKey')).toBeNull();
            expect(mockStorage.getItem('testKey.time')).toBeNull();
            expect(prop.getTimestamp()).toBeNull();
            expect(prop.hasStoredValue()).toBe(false);
        });

        it('should fall back to the server value, which a written default would have hidden', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            prop.setServerValue('server');
            prop.setValue('changed');

            prop.setDefault();
            expect(prop.value).toBe('server');
        });

        it('should let a feature default set after the reset apply', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            prop.setValue('changed');
            prop.setDefault();

            prop.overrideDefault('pack-default');
            expect(prop.value).toBe('pack-default');
        });

        it('should end a URL session override', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            prop.setSessionValue('from-url');
            prop.setDefault();
            expect(prop.hasSessionOverride).toBe(false);
            expect(prop.value).toBe('default');
        });

        it('should accept any later write, the stored timestamp being gone', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            prop.setValue('old', 5000);
            prop.setDefault();

            prop.setValue('older', 500);
            expect(prop.value).toBe('older');
        });

        it('should write the fallback value when the storage cannot remove items', () => {
            const store = new Map<string, string>();
            const legacyStorage = {
                getItem: (key: string) => store.get(key) ?? null,
                setItem: (key: string, value: string) => { store.set(key, value); },
            };
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, legacyStorage);
            prop.setServerValue('server');
            prop.setValue('changed');

            prop.setDefault();
            expect(prop.value).toBe('server');
            expect(store.get('testKey')).toBe('server');
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

    describe('clearStored', () => {
        it('should drop only the stored layer and keep a URL override', () => {
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, mockStorage);
            prop.setValue('stored');
            prop.setSessionValue('from-url');

            prop.clearStored();
            expect(mockStorage.getItem('testKey')).toBeNull();
            expect(prop.value).toBe('from-url');
        });

        it('should warn and keep the value when the storage cannot remove items', () => {
            const store = new Map<string, string>();
            const legacyStorage = {
                getItem: (key: string) => store.get(key) ?? null,
                setItem: (key: string, value: string) => { store.set(key, value); },
            };
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const prop = new ConfigProperty('testKey', 'default', undefined, undefined, legacyStorage);
            prop.setValue('stored');

            prop.clearStored();
            expect(prop.value).toBe('stored');
            expect(warn).toHaveBeenCalled();
            warn.mockRestore();
        });
    });

    describe('redeclare', () => {
        it('should re-read stored, server and URL values with the new type and validator', () => {
            mockStorage.setItem('testKey', '42');
            const prop = new ConfigProperty<unknown>('testKey', 'sample', undefined, undefined, mockStorage);
            prop.setServerValue('7');
            expect(prop.value).toBe('42'); // read as text while the sample is a string

            prop.redeclare(0, (value: unknown) => typeof value === 'number' && value < 100);
            expect(prop.value).toBe(42);
            prop.clearStored();
            expect(prop.value).toBe(7);
        });

        it('should drop layer values the new validator rejects', () => {
            const prop = new ConfigProperty<string>('testKey', '', undefined, undefined, mockStorage);
            prop.setSessionValue('blob:https://host/123');
            prop.redeclare('', (value: string) => !value.startsWith('blob:'));
            expect(prop.hasSessionOverride).toBe(false);
            expect(prop.value).toBe('');
        });

        it('should keep a feature default over the new code default', () => {
            const prop = new ConfigProperty<unknown>('testKey', 'sample', undefined, undefined, mockStorage);
            prop.overrideDefault('5');
            prop.redeclare(1);
            expect(prop.value).toBe(5);
            expect(prop.codeDefault).toBe(1);
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
