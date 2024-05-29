import {ConfigProperty} from "./config-property"

describe('ConfigProperty', () => {
  let configProperty: ConfigProperty<string>;
  let mockSaveCallback: jasmine.Spy;
  let defaultValue: string;
  let key: string;

  beforeEach(() => {
    key = 'testKey';
    defaultValue = 'default';
    mockSaveCallback = jasmine.createSpy('saveCallback');

    configProperty = new ConfigProperty<string>(key, defaultValue, mockSaveCallback);
  });

  it('should initialize with default value if no value in localStorage', () => {
    localStorage.removeItem(key);
    configProperty = new ConfigProperty<string>(key, defaultValue);
    expect(configProperty.value).toBe(defaultValue);
  });

  it('should use stored value if available', () => {
    const storedValue = "stored";
    localStorage.setItem(key, storedValue);
    configProperty = new ConfigProperty<string>(key, defaultValue);
    expect(configProperty.value).toBe(storedValue);
  });

  it('should call saveCallback when setting value', () => {
    const newValue = 'new value';
    configProperty.value = newValue;
    expect(configProperty.value).toBe(newValue);
    expect(mockSaveCallback).toHaveBeenCalled();
  });

  it('should not change value if validator fails', () => {
    const badValue = 'bad';
    configProperty = new ConfigProperty<string>(key, defaultValue, mockSaveCallback, (value) => false);
    configProperty.value = badValue;

    expect(configProperty.value).toBe(defaultValue); // Still the default, not the bad value
    expect(mockSaveCallback).not.toHaveBeenCalled();
  });

  // Additional tests to cover other scenarios...
});
