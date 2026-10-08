/**
 * Public API of the Firebird Angular extension system (imported as
 * `@dexvis/firebird-ng` — see tsconfig paths). Extension packages import ONLY
 * from here and from `@dexvis/firebird-core`; app-internal paths are not a
 * contract.
 */

import type { AppCommand } from '@dexvis/app-features';

export * from './firebird-features';
export * from './tokens';
export * from './three-extension';
// The config keys Firebird reads, with their defaults and validators
export * from './config-keys';
// The shared app machinery from @dexvis/app-features, re-exported so that
// extensions keep one import path. Config registry: the entry point
// extensions use to declare config keys.
export { ConfigService, ConfigProperty, coerceConfigValue, isPersistableUrl } from '@dexvis/app-features';
export type { ConfigSchema, ConfigPropertyMeta } from '@dexvis/app-features';
// Deep links in the URL grammar the display parses at startup
export { buildDeepLink } from '@dexvis/app-features';
export type { DeepLinkOptions, DeepLinkCommand, DeepLinkValue } from '@dexvis/app-features';
// Command bus
export { CommandBusService } from '@dexvis/app-features';
export type { AppCommand, CommandHandler } from '@dexvis/app-features';
/** A serializable command; the same type as `AppCommand` from `@dexvis/app-features`. */
export type FbCommand = AppCommand;
// Generic feature functions and tokens
export {
  appFeatures,
  contributeClass,
  contributeValue,
  withCommandHandler,
  withConfigDefaults,
  withUrlAlias,
  withUrlShorthand,
  COMMAND_HANDLERS,
  CONFIG_DEFAULTS,
  URL_ALIASES,
  URL_SHORTHANDS,
} from '@dexvis/app-features';
export type { AppFeature, AppFeatureInput, UrlAlias, UrlShorthand } from '@dexvis/app-features';
export { BatchStatusService } from './batch-status.service';
export { DataCatalogService } from '../services/data-catalog.service';
export { DataSelectionService } from '../services/data-selection.service';
export type { DataSelection } from '../services/data-selection.service';
export { withFirebirdBuiltins } from './with-firebird-builtins';
export { DexEventLoader, Edm4eicEventLoader, RootGeometryLoader } from './builtin-loaders';
export {
  OpenDexCommandHandler,
  OpenGeometryCommandHandler,
  ShowEventCommandHandler,
  SetConfigCommandHandler,
  CameraPresetCommandHandler,
} from './builtin-command-handlers';
