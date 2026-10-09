/**
 * The extension contracts of `@dexvis/firebird-ng`: DI tokens and their
 * `with*()` features, the ThreeExtension and render view interfaces, the
 * geometry pipeline seams, Firebird's config keys, and the light services
 * the composition layer needs (data catalog, data selection, batch status,
 * URL resolution).
 *
 * The package root `@dexvis/firebird-ng` re-exports all of it; import from
 * there. This entry exists so that the display entry
 * (`@dexvis/firebird-ng/display`) and the package root can both build on
 * the same token instances: the root loads the display entry lazily, and an
 * entry may not import the entry that imports it.
 *
 * Everything here stays light (no three.js values, no Material): the
 * package root is part of every application's initial bundle.
 */

import type { AppCommand } from '@dexvis/app-features';

export * from './lib/firebird-features';
export * from './lib/tokens';
export * from './lib/three-extension';
// Render views, overlays and the camera-layer routing
export * from './lib/views';
// What the worker run functions take (workers/geometry, workers/root-file)
export type { WorkerScope } from './lib/worker-scope';
// Geometry pipeline seams: pre-build TGeo rules, themes, post-processors
export * from './lib/geometry-pipeline';
// The config keys Firebird reads, with their defaults and validators
export * from './lib/config-keys';
export { BatchStatusService } from './lib/batch-status.service';
export { DataCatalogService } from './lib/services/data-catalog.service';
export { DataSelectionService, isRootSource } from './lib/services/data-selection.service';
export type { DataSelection } from './lib/services/data-selection.service';
export type { ServerConfig } from './lib/services/server-config';
// Exported because the display entry and the package root import them by
// package name (an entry cannot reach another entry's files otherwise)
export { SELECTION_CONFIG_KEYS } from './lib/services/data-selection.service';
export { UrlService } from './lib/services/url.service';
export { defaultFirebirdConfig } from './lib/services/server-config';

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
  appFeatureDefaults,
  appFeaturePack,
  contributeClass,
  contributeValue,
  resolveRegistry,
  withCommandHandler,
  withConfigDefaults,
  withoutFeatures,
  withUrlAlias,
  withUrlShorthand,
  APP_FEATURE_OWNERS,
  COMMAND_HANDLERS,
  CONFIG_DEFAULTS,
  URL_ALIASES,
  URL_SHORTHANDS,
} from '@dexvis/app-features';
export type { AppFeature, AppFeatureInput, FeatureIdentity, UrlAlias, UrlShorthand } from '@dexvis/app-features';
