import {BehaviorSubject, Observable} from 'rxjs';


/**
 * Storage general interface for storing ConfigProperty-ies.
 * ConfigProperty uses the storage to save and load values.
 * 
 * Time-based Configuration System:
 * - Each configuration value is stored with an associated timestamp
 * - Timestamps are stored in parallel variables with ".time" suffix (e.g., "myConfig" value has "myConfig.time" timestamp)
 * - When setting a value with a specific timestamp, it only updates if the stored timestamp is older
 * - If no timestamp is provided when setting a value, the current time ("now") is used
 * - This allows for conflict resolution when multiple sources might update the same configuration
 */
interface ConfigPropertyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Use local storage to save load ConfigProperty
 */
class ConfigPropertyLocalStorage implements ConfigPropertyStorage {
  getItem(key: string): string | null {
    return localStorage.getItem(key);
  }

  setItem(key: string, value: string): void {
    localStorage.setItem(key, value);
  }
}

/**
 * Manages an individual configuration property. Provides reactive updates to subscribers,
 * persistence to localStorage, and optional value validation.
 * 
 * Includes time-based update logic to handle concurrent modifications:
 * - Each value is stored with a timestamp
 * - Updates can specify a timestamp to enable conflict resolution
 * - Only updates with newer timestamps will overwrite existing values
 *
 * @template T The type of the configuration value.
 */
export class ConfigProperty<T> {
  public subject: BehaviorSubject<T>;

  /** Observable for subscribers to react to changes in the property value. */
  public changes$: Observable<T>;

  /**
   * Creates an instance of ConfigProperty.
   *
   * @param {string} key The localStorage key under which the property value is stored.
   * @param {T} defaultValue The default value of the property if not previously stored.
   * @param storage
   * @param {() => void} saveCallback The callback to execute after setting a new value.
   * @param {(value: T) => boolean} [validator] Optional validator function to validate the property value.
   */
  constructor(
    private key: string,
    private defaultValue: T,
    private saveCallback?: () => void,
    private validator?: (value: T) => boolean,
    private storage: ConfigPropertyStorage = new ConfigPropertyLocalStorage(),
    ) {
    const value = this.loadValue();
    this.subject = new BehaviorSubject<T>(value);
    this.changes$ = this.subject.asObservable();

  }


  /**
   * Loads the property value from localStorage or returns the default value if not found or invalid.
   *
   * @returns {T} The loaded or default value of the property.
   */
  private loadValue(): T {
    let storedValue: string|null = null;
    let parsedValue: any = undefined;
    try {
      storedValue = this.storage.getItem(this.key);

      if (storedValue !== null) {
        parsedValue = (typeof this.defaultValue) !== 'string' ? JSON.parse(storedValue) : storedValue;
      } else {
        parsedValue = this.defaultValue;
      }
      return this.validator && !this.validator(parsedValue) ? this.defaultValue : parsedValue;
    } catch (error) {
      console.error(`Error at ConfigProperty.loadValue, key='${this.key}'`);
      console.log('   storedValue', storedValue);
      console.log('   parsedValue', parsedValue);
      console.log('   Default value will be used: ', this.defaultValue);
      console.log(error);

      return this.defaultValue;
    }
  }

  /**
   * Gets the timestamp of when the current value was stored.
   * 
   * @returns {number | null} The timestamp in milliseconds, or null if not found.
   */
  private getStoredTime(): number | null {
    try {
      const timeKey = `${this.key}.time`;
      const storedTime = this.storage.getItem(timeKey);
      return storedTime ? parseInt(storedTime, 10) : null;
    } catch (error) {
      console.error(`Error loading timestamp for key='${this.key}'`, error);
      return null;
    }
  }

  /**
   * Saves the timestamp for when the value was stored.
   * 
   * @param {number} timestamp The timestamp in milliseconds.
   */
  private saveTime(timestamp: number): void {
    const timeKey = `${this.key}.time`;
    this.storage.setItem(timeKey, timestamp.toString());
  }

  /**
   * Sets the property value with optional timestamp-based conflict resolution.
   * If a timestamp is provided, the value is only updated if the stored timestamp is older.
   * If no timestamp is provided, the current time is used.
   *
   * @param {T} value The new value to set for the property.
   * @param {number} [time] Optional timestamp in milliseconds. If not provided, Date.now() is used.
   */
  setValue(value: T, time?: number): void {
    if (this.validator && !this.validator(value)) {
      console.error('Validation failed for:', value);
      return;
    }

    const updateTime = time ?? Date.now();
    const storedTime = this.getStoredTime();

    // Only update if no stored time exists or if the update time is newer
    if (storedTime === null || updateTime > storedTime) {
      this.storage.setItem(this.key, typeof value !== 'string' ? JSON.stringify(value) : value);
      this.saveTime(updateTime);

      if(this.saveCallback) {
        this.saveCallback();
      }

      this.subject.next(value);
    } else {
      console.log(`Skipping update for key='${this.key}': stored time (${storedTime}) is newer than update time (${updateTime})`);
    }
  }

  /**
   * Sets the property value after validation. If the value is valid, it updates the property and calls the save callback.
   * Uses the current timestamp for the update.
   *
   * @param {T} value The new value to set for the property.
   */
  set value(value: T) {
    this.setValue(value);
  }

  /**
   * Gets the current value of the property.
   *
   * @returns {T} The current value of the property.
   */
  get value(): T {
    return this.subject.value;
  }


  /**
   * Resets value to its default given at Config construction
   */
  public setDefault() {
    this.subject.next(this.defaultValue);
  }
}
