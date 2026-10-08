/**
 * Firebird's server config shape and defaults.
 *
 * Loading, JSONC parsing and the SERVER config layer feed live in
 * `ServerConfigService` from `@dexvis/app-features`; `provideFirebird()`
 * installs `defaultFirebirdConfig` as its defaults. Read the typed config
 * through `ServerConfigService<ServerConfig>`.
 *
 * pyrobird rewrites `assets/config.jsonc` on the fly when it serves the app
 * (`servedByPyrobird`, `apiAvailable`, `apiBaseUrl`); a static deployment
 * serves the built file as is.
 */

import type { ServerConfigBase } from '@dexvis/app-features';
import type { DataCatalog } from '@dexvis/firebird-core';

export interface ServerConfig extends ServerConfigBase {
  servedByPyrobird: boolean;
  apiAvailable: boolean;
  apiBaseUrl: string;
  logLevel: string;
  /** Server-provided config values: [{key, value}] entries. */
  configs: any[];
  /** Server-provided config values as a {key: value} map (pyrobird `userConfigs`). */
  userConfigs?: Record<string, unknown>;
  /** Datasets offered by the data selector (a `DataCatalog` object; pyrobird passes it through). */
  dataCatalog?: DataCatalog;
  /** Commands to run once the display is ready: command objects or 'type:arg' strings. */
  startupCommands?: Array<Record<string, unknown> | string>;
}

export const defaultFirebirdConfig: ServerConfig = {
  apiAvailable: false,
  apiBaseUrl: "",
  servedByPyrobird: false,
  logLevel: 'info',
  configs: []
};
