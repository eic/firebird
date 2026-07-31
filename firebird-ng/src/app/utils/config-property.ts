import {BehaviorSubject, Observable} from 'rxjs';
import {Signal, signal} from '@angular/core';

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
interface PersistentPropertyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Use local storage to save load ConfigProperty
 */
class PersistentPropertyLocalStorage implements PersistentPropertyStorage {
  getItem(key: string): string | null {
    return localStorage.getItem(key);
  }

  setItem(key: string, value: string): void {
    localStorage.setItem(key, value);
  }
}

/**
 * Declarative metadata for a config entry. Drives auto-rendered UI panels
 * (labels, option lists, numeric ranges) — the same schema shape is used by
 * painters, loaders and extensions.
 */
export interface ConfigPropertyMeta {
  label?: string;
  group?: string;
  options?: readonly unknown[];
  min?: number;
  max?: number;
  description?: string;
}

/** Coerces a string (URL/CLI source) to the type of `sample`. Non-strings pass through. */
export function coerceConfigValue(value: unknown, sample: unknown): unknown {
  if (typeof value !== 'string' || typeof sample === 'string') {
    return value;
  }
  if (typeof sample === 'number') {
    const num = Number(value);
    return isNaN(num) ? value : num;
  }
  if (typeof sample === 'boolean') {
    return value === 'true' || value === '1';
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Manages an individual configuration property with LAYERED sources.
 * Precedence, low to high:
 *
 *   code default  <  server value  <  localStorage  <  URL session value
 *
 * plus runtime writes (`setValue` / `.value =`), which persist to localStorage
 * AND clear the session layer — so a user action during a URL-parameterized
 * session takes effect immediately, while URL values never poison the saved
 * user preferences (they live only for the session).
 *
 * Reactivity: `changes$` (RxJS) and `valueSignal` (Angular signal) both emit
 * the effective value. Timestamp-based conflict resolution applies to the
 * localStorage layer only.
 *
 * @template T The type of the configuration value.
 */
export class ConfigProperty<T> {

  public subject: BehaviorSubject<T>;

  /** Observable for subscribers to react to changes in the property value. */
  public changes$: Observable<T>;

  /** Signal view of the effective value. Prefer this in templates/effects. */
  public readonly valueSignal: Signal<T>;
  private writableSignal;

  /** Declarative metadata (labels, options, ranges) for auto-rendered UI. */
  public meta?: ConfigPropertyMeta;

  /** Server-provided value (config.jsonc / pyrobird). Overrides the default only. */
  private serverValue: T | undefined = undefined;

  /** Session-scoped override (URL `?config.key=` source). Never persisted. */
  private sessionValue: T | undefined = undefined;

  /**
   * Creates an instance of ConfigProperty.
   *
   * @param {string} _key The localStorage key under which the property value is stored.
   * @param {T} defaultValue The default value of the property if not previously stored.
   * @param {() => void} saveCallback The callback to execute after setting a new value.
   * @param {(value: T) => boolean} [validator] Optional validator function to validate the property value.
   * @param storage
   */
  constructor(
      private _key: string,
      private defaultValue: T,
      private saveCallback?: () => void,
      private validator?: (value: T) => boolean,
      private storage: PersistentPropertyStorage = new PersistentPropertyLocalStorage(),
    ) {
    const value = this.effectiveValue();
    this.subject = new BehaviorSubject<T>(value);
    this.changes$ = this.subject.asObservable();
    this.writableSignal = signal<T>(value);
    this.valueSignal = this.writableSignal.asReadonly();
  }

  /**
   * Reads the localStorage layer.
   * @returns The parsed stored value, or `undefined` when absent or invalid.
   */
  private loadStoredValue(): T | undefined {
    let storedValue: string|null = null;
    let parsedValue: any = undefined;
    try {
      storedValue = this.storage.getItem(this._key);
      if (storedValue === null) {
        return undefined;
      }
      parsedValue = (typeof this.defaultValue) !== 'string' ? JSON.parse(storedValue) : storedValue;
      return this.validator && !this.validator(parsedValue) ? undefined : parsedValue;
    } catch (error) {
      console.error(`Error at ConfigProperty.loadStoredValue, key='${this._key}'`);
      console.log('   storedValue', storedValue);
      console.log('   parsedValue', parsedValue);
      console.log(error);
      return undefined;
    }
  }

  /** True if localStorage holds a (valid) value for this key. */
  public hasStoredValue(): boolean {
    return this.loadStoredValue() !== undefined;
  }

  /** True while a session (URL) override is active. */
  public get hasSessionOverride(): boolean {
    return this.sessionValue !== undefined;
  }

  /** Resolves the layered value: session > stored > server > default. */
  private effectiveValue(): T {
    if (this.sessionValue !== undefined) return this.sessionValue;
    const stored = this.loadStoredValue();
    if (stored !== undefined) return stored;
    if (this.serverValue !== undefined) return this.serverValue;
    return this.defaultValue;
  }

  /** Re-resolves layers and emits when the effective value changed. */
  private recompute(): void {
    const value = this.effectiveValue();
    if (value !== this.subject.value) {
      this.subject.next(value);
      this.writableSignal.set(value);
    } else {
      // Signals may lag the subject after construction; keep them converged.
      this.writableSignal.set(value);
    }
  }

  /**
   * Gets the timestamp of when the current value was stored.
   *
   * @returns {number | null} The timestamp in milliseconds, or null if not found or invalid.
   */
  private getStoredTime(): number | null {
    try {
      const timeKey = `${this._key}.time`;
      const storedTime = this.storage.getItem(timeKey);
      if (!storedTime) {
        return null;
      }
      const parsedTime = parseInt(storedTime, 10);
      // Return null if the timestamp is invalid (NaN)
      return isNaN(parsedTime) ? null : parsedTime;
    } catch (error) {
      console.error(`Error loading timestamp for key='${this._key}'`, error);
      return null;
    }
  }

  /**
   * Saves the timestamp for when the value was stored.
   *
   * @param {number} timestamp The timestamp in milliseconds.
   */
  private saveTime(timestamp: number): void {
    const timeKey = `${this._key}.time`;
    this.storage.setItem(timeKey, timestamp.toString());
  }

  /**
   * Sets the property value with optional timestamp-based conflict resolution
   * (the RUNTIME layer: persists to localStorage and clears any session override).
   * If a timestamp is provided, the value is only updated if the stored timestamp is older.
   * If no timestamp is provided, the current time is used.
   *
   * @param {T} value The new value to set for the property.
   * @param {number} [time] Optional timestamp in milliseconds. If not provided, Date.now() is used.
   * @param {boolean} [ignoreTime=false] If true, bypasses timestamp-based conflict resolution.
   */
  setValue(value: T, time?: number, ignoreTime: boolean = false): void {
    if (this.validator && !this.validator(value)) {
      console.error('Validation failed for:', value);
      return;
    }

    // If no explicit time provided, use Date.now() but ensure it's unique
    let updateTime: number;
    if (time !== undefined) {
      updateTime = time;
    } else {
      updateTime = Date.now();
    }

    const storedTime = this.getStoredTime();

    // Only update if no stored time exists, if the update time is newer, or if ignoreTime is true
    // (!) There was a lot of thought on >=, it is considered the less of all complexities:
    //     What we want with these configs, is to not overwrite current configs with stale configs.
    //     >= is good for this. If one overwrites config several times (e.g. in tests) we don't care
    if (ignoreTime || storedTime === null || updateTime >= storedTime) {
      this.storage.setItem(this._key, typeof value !== 'string' ? JSON.stringify(value) : value);
      this.saveTime(updateTime);

      // Runtime beats URL: a user/runtime write ends the session override.
      this.sessionValue = undefined;

      if(this.saveCallback) {
        this.saveCallback();
      }

      this.recompute();
    } else {
      console.log(`Skipping update for key='${this._key}': stored time (${storedTime}) is newer than update time (${updateTime})`);
    }
  }

  /**
   * Sets the SESSION layer (URL `?config.key=` source). Wins over every other
   * source for this browser session, but is never written to localStorage —
   * a shared link cannot poison the user's saved preferences.
   * String values are coerced to the property's type.
   */
  setSessionValue(value: unknown): void {
    const coerced = coerceConfigValue(value, this.defaultValue) as T;
    if (this.validator && !this.validator(coerced)) {
      console.error(`Session value validation failed for key='${this._key}':`, value);
      return;
    }
    this.sessionValue = coerced;
    this.recompute();
  }

  /**
   * Sets the SERVER layer (config.jsonc / pyrobird). Overrides the code
   * default but yields to localStorage, URL and runtime writes.
   */
  setServerValue(value: unknown): void {
    const coerced = coerceConfigValue(value, this.defaultValue) as T;
    if (this.validator && !this.validator(coerced)) {
      console.error(`Server value validation failed for key='${this._key}':`, value);
      return;
    }
    this.serverValue = coerced;
    this.recompute();
  }

  /**
   * Replaces the code default (used by `withConfigDefaults` feature packs —
   * still the lowest tier; every other source overrides it).
   */
  overrideDefault(value: unknown): void {
    this.defaultValue = coerceConfigValue(value, this.defaultValue) as T;
    this.recompute();
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
   * Gets the current effective value of the property.
   *
   * @returns {T} The current value of the property.
   */
  get value(): T {
    return this.subject.value;
  }

  get key(): string {
    return this._key;
  }


  /**
   * Resets value to its default given at Config construction.
   * This also updates the storage and timestamp.
   */
  public setDefault() {
    this.setValue(this.defaultValue);
  }

  /**
   * Gets the timestamp of the current stored value.
   * @returns The timestamp in milliseconds, or null if not found.
   */
  public getTimestamp(): number | null {
    return this.getStoredTime();
  }
}
