import {BehaviorSubject, Observable} from 'rxjs';
import {Signal, signal} from '@angular/core';

/**
 * Where a ConfigProperty keeps its value between sessions (the localStorage
 * layer of the config precedence).
 *
 * Each value is stored with a timestamp under the sibling key `<key>.time`.
 * A write that carries an explicit timestamp applies only when the stored
 * timestamp is not newer; a write without one uses the current time. This
 * resolves conflicts when several sources update the same key.
 */
export interface PersistentPropertyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  /**
   * Removes a stored item. Optional for custom storages, but without it
   * `ConfigProperty.clearStored()` cannot drop a value, and `setDefault()`
   * falls back to writing the default.
   */
  removeItem?(key: string): void;
}

/**
 * The browser's localStorage as a property storage. `prefix` is prepended to
 * every storage key, so several applications on one origin keep separate
 * settings (`withConfigStorage({ prefix })`).
 */
export class LocalStoragePropertyStorage implements PersistentPropertyStorage {
  constructor(readonly prefix: string = '') {}

  getItem(key: string): string | null {
    return localStorage.getItem(this.prefix + key);
  }

  setItem(key: string, value: string): void {
    localStorage.setItem(this.prefix + key, value);
  }

  removeItem(key: string): void {
    localStorage.removeItem(this.prefix + key);
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
 *   code default  <  feature default  <  server value  <  localStorage  <  URL session value
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

  /** The default the declaring code gave (the lowest tier). */
  private _codeDefault: T;

  /** Feature-pack default (`withConfigDefaults`); replaces the code default when set. */
  private featureDefault: T | undefined = undefined;

  /** Server-provided value (config.jsonc served by the backend). Overrides the defaults only. */
  private serverValue: T | undefined = undefined;

  /** Session-scoped override (URL `?config.key=` source). Never persisted. */
  private sessionValue: T | undefined = undefined;

  private _validator: ((value: T) => boolean) | undefined;

  /**
   * Creates an instance of ConfigProperty.
   *
   * @param _key The storage key under which the property value is stored.
   * @param defaultValue The code default: the value when no other source has one.
   * @param saveCallback Called after a runtime write or a reset.
   * @param validator Rejects invalid values from every source, stored values included.
   * @param storage Where the value persists. Default: localStorage without a prefix.
   */
  constructor(
      private _key: string,
      defaultValue: T,
      private saveCallback?: () => void,
      validator?: (value: T) => boolean,
      private storage: PersistentPropertyStorage = new LocalStoragePropertyStorage(),
    ) {
    this._codeDefault = defaultValue;
    this._validator = validator;
    const value = this.effectiveValue();
    this.subject = new BehaviorSubject<T>(value);
    this.changes$ = this.subject.asObservable();
    this.writableSignal = signal<T>(value);
    this.valueSignal = this.writableSignal.asReadonly();
  }

  /** The default the declaring code gave, before any feature default. */
  get codeDefault(): T {
    return this._codeDefault;
  }

  /** The validator every source passes through, if the declaration gave one. */
  get validator(): ((value: T) => boolean) | undefined {
    return this._validator;
  }

  /** The value when no server, stored or URL value exists: the feature default, else the code default. */
  get defaultValue(): T {
    return this.featureDefault !== undefined ? this.featureDefault : this._codeDefault;
  }

  private isValid(value: T): boolean {
    return !this._validator || this._validator(value);
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
      parsedValue = (typeof this._codeDefault) !== 'string' ? JSON.parse(storedValue) : storedValue;
      return this.isValid(parsedValue) ? parsedValue : undefined;
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

  /** Resolves the layered value: session > stored > server > feature default > code default. */
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
    if (!this.isValid(value)) {
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

    // Only update if no stored time exists, if the update time is newer, or if ignoreTime is true.
    // `>=` (not `>`) is deliberate and the least complex choice: the goal is to never overwrite a
    // current value with a stale one, and several writes within one millisecond (as in tests)
    // must all apply.
    if (ignoreTime || storedTime === null || updateTime >= storedTime) {
      this.writeStored(value, updateTime);

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

  private writeStored(value: T, time: number): void {
    this.storage.setItem(this._key, typeof value !== 'string' ? JSON.stringify(value) : value);
    this.saveTime(time);
  }

  /**
   * Sets the SESSION layer (URL `?config.key=` source). Wins over every other
   * source for this browser session, but is never written to localStorage —
   * a shared link cannot poison the user's saved preferences.
   * String values are coerced to the property's type.
   */
  setSessionValue(value: unknown): void {
    const coerced = coerceConfigValue(value, this._codeDefault) as T;
    if (!this.isValid(coerced)) {
      console.error(`Session value validation failed for key='${this._key}':`, value);
      return;
    }
    this.sessionValue = coerced;
    this.recompute();
  }

  /**
   * Sets the SERVER layer (config.jsonc served by the backend). Overrides the code
   * default but yields to localStorage, URL and runtime writes.
   */
  setServerValue(value: unknown): void {
    const coerced = coerceConfigValue(value, this._codeDefault) as T;
    if (!this.isValid(coerced)) {
      console.error(`Server value validation failed for key='${this._key}':`, value);
      return;
    }
    this.serverValue = coerced;
    this.recompute();
  }

  /**
   * Sets the feature default (used by `withConfigDefaults` feature packs).
   * It replaces the code default and stays the lowest tier: every other
   * source overrides it.
   */
  overrideDefault(value: unknown): void {
    this.featureDefault = coerceConfigValue(value, this._codeDefault) as T;
    this.recompute();
  }

  /**
   * Replaces the code default and the validator. `ConfigService` calls this
   * when the first real declaration arrives for a placeholder (a key that a
   * command wrote before any code declared it). Values from the other
   * layers are coerced to the new default's type and checked against the new
   * validator; a value that fails is dropped.
   */
  redeclare(defaultValue: T, validator?: (value: T) => boolean): void {
    this._codeDefault = defaultValue;
    this._validator = validator;
    const adopt = (value: T | undefined): T | undefined => {
      if (value === undefined) return undefined;
      const coerced = coerceConfigValue(value, defaultValue) as T;
      return this.isValid(coerced) ? coerced : undefined;
    };
    this.featureDefault = adopt(this.featureDefault);
    this.serverValue = adopt(this.serverValue);
    this.sessionValue = adopt(this.sessionValue);
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
   * Removes the stored (localStorage) value and its timestamp. The value
   * falls back to the URL session value, the server value or the default,
   * in that order. Does nothing when the storage has no `removeItem`.
   */
  public clearStored(): void {
    if (!this.removeStored()) {
      console.warn(`ConfigProperty.clearStored: the storage of key='${this._key}' cannot remove items`);
      return;
    }
    this.recompute();
  }

  /**
   * Resets the property: removes the stored value and ends the URL session
   * override, so the value falls back to the server value or the default.
   * The default is not written to storage, so a later server or feature
   * default still applies. A storage without `removeItem` gets the fallback
   * value written instead.
   */
  public setDefault(): void {
    this.sessionValue = undefined;
    if (!this.removeStored()) {
      const fallback = this.serverValue !== undefined ? this.serverValue : this.defaultValue;
      this.writeStored(fallback, Date.now());
    }
    if (this.saveCallback) {
      this.saveCallback();
    }
    this.recompute();
  }

  /** Removes the value and its timestamp; false when the storage cannot remove items. */
  private removeStored(): boolean {
    if (!this.storage.removeItem) {
      return false;
    }
    try {
      this.storage.removeItem(this._key);
      this.storage.removeItem(`${this._key}.time`);
    } catch (error) {
      console.error(`Error removing the stored value of key='${this._key}'`, error);
    }
    return true;
  }

  /**
   * Gets the timestamp of the current stored value.
   * @returns The timestamp in milliseconds, or null if not found.
   */
  public getTimestamp(): number | null {
    return this.getStoredTime();
  }
}
