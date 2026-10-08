/**
 * The DI tokens of the app composition machinery.
 *
 * Every extensible surface follows one pattern: contributions are declared in
 * DI as multi-providers (through the `with*()` features in features.ts),
 * collected by services, and called through narrow interfaces. Nothing
 * registers itself through import side effects.
 *
 * An application declares its own tokens the same way and contributes to
 * them with `contributeValue()` / `contributeClass()`.
 *
 * Token descriptions exist in development builds only (the Angular idiom):
 * production builds define `ngDevMode` as false and drop the strings.
 */

import { InjectionToken } from '@angular/core';
import type { CommandHandler } from './command-bus.service';
import type { ServerConfigBase } from './server-config.service';

/** A protocol alias: `data://file.root` resolves to `https://host/data/file.root`. */
export interface UrlAlias {
  /** The prefix to replace, including the scheme separator, for example `'data://'`. */
  prefix: string;
  /** The base URL that replaces the prefix. */
  base: string;
}

/**
 * One URL query shorthand: a query parameter that stands for one command
 * type. `?<param>=<value>` queues the same command as
 * `?cmd=<commandType>:<value>`: the handler's `fromUrlArg()` builds it.
 * The application defines its shorthand grammar; `UrlStartupService` applies it.
 */
export interface UrlShorthand {
  /** The query parameter name, for example `'file'`. */
  param: string;
  /** The command type the parameter stands for, for example `'open-file'`. */
  commandType: string;
}

/** Options for loading the server config file. */
export interface ServerConfigOptions {
  /**
   * URL of the JSONC server config, resolved against the document base URL.
   * Default: `assets/config.jsonc`.
   */
  url?: string;
  /** Values the loaded file is merged over (top-level keys); also the value before the load. */
  defaults?: ServerConfigBase;
}

/** Options for the storage behind the localStorage config layer. */
export interface ConfigStorageOptions {
  /**
   * Prepended to every storage key, for example `'eiceye.'`, so applications
   * that share an origin keep separate settings. Default: no prefix.
   */
  prefix?: string;
}

/** Command handlers for the command bus. One handler per command type; the last registration wins. */
export const COMMAND_HANDLERS = new InjectionToken<CommandHandler[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'app-features.command-handlers' : '');

/** Config defaults contributed by features (the lowest precedence tier). Applied in order. */
export const CONFIG_DEFAULTS = new InjectionToken<Record<string, unknown>[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'app-features.config-defaults' : '');

/** URL protocol aliases. The application's URL resolution consumes them. */
export const URL_ALIASES = new InjectionToken<UrlAlias[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'app-features.url-aliases' : '');

/** URL query shorthands, applied in registration order before the generic `?cmd=` list. */
export const URL_SHORTHANDS = new InjectionToken<UrlShorthand[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'app-features.url-shorthands' : '');

/** Where the server config comes from and what it defaults to. The last provider wins. */
export const SERVER_CONFIG_OPTIONS = new InjectionToken<ServerConfigOptions>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'app-features.server-config-options' : '');

/** Storage options of the config registry (`withConfigStorage()`). The last provider wins. */
export const CONFIG_STORAGE_OPTIONS = new InjectionToken<ConfigStorageOptions>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'app-features.config-storage-options' : '');
