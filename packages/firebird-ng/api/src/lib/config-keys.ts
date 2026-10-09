/**
 * The config keys Firebird itself reads, each with its one default and
 * validator. Every place that reads or writes one of these keys declares it
 * from the schema here (`config.declare(ROOT_EVENT_RANGE_CONFIG)`), so the
 * default cannot drift between readers. In development builds
 * `ConfigService` warns when a key is declared twice with different
 * defaults or validators.
 *
 * Plain constants on purpose: initial-bundle code (loaders, command
 * handlers) and lazy pages import this module, so it must not import the
 * display stack.
 */

import { type ConfigSchema, isPersistableUrl } from '@dexvis/app-features';

// ---------------------------------------------------------------------------
// What the display loads (the data selector writes these; deep links,
// config.jsonc and the config page use the same keys)
// ---------------------------------------------------------------------------

/** Detector geometry URL. The app-level default arrives through `withDefaultGeometry()`. */
export const GEOMETRY_URL_CONFIG: ConfigSchema<string> = {
  key: 'geometry.selectedGeometry', default: '', validator: isPersistableUrl,
};

/** DEX event file URL (`.firebird.json` or `.zip`). */
export const DEX_EVENTS_SOURCE_CONFIG: ConfigSchema<string> = {
  key: 'events.dexEventsSource', default: '', validator: isPersistableUrl,
};

/** ROOT event file URL, converted to DEX in the browser or by pyrobird. */
export const ROOT_EVENTS_SOURCE_CONFIG: ConfigSchema<string> = {
  key: 'events.rootEventSource', default: '', validator: isPersistableUrl,
};

/** Entries a ROOT event source converts: '0', '0-4', '1,3,5-7'. */
export const ROOT_EVENT_RANGE_CONFIG: ConfigSchema<string> = {
  key: 'events.rootEventRange', default: '0',
};

/**
 * Collection groups a ROOT event source converts, comma separated ('' = all):
 * 'tracker_hits,mc_particles', the names of `pyrobird convert --collections`.
 * Both ROOT event loaders (browser and server conversion) honor it.
 */
export const ROOT_COLLECTIONS_CONFIG: ConfigSchema<string> = {
  key: 'events.rootCollections', default: '',
};

/**
 * EDM4hep sim hit collections that the browser conversion keeps out of
 * MC-truth trajectories, comma separated ('' = none); they still show as hits.
 * Packs list their Cherenkov/PID collections here through
 * `withConfigDefaults()`. The server conversion applies pyrobird's own list.
 */
export const TRAJECTORY_EXCLUDED_COLLECTIONS_CONFIG: ConfigSchema<string> = {
  key: 'events.trajectoryExcludedCollections', default: '',
};

// ---------------------------------------------------------------------------
// Geometry pipeline (config page)
// ---------------------------------------------------------------------------

/**
 * Geometry theme: the id of a `withGeometryTheme()` registration ('grey' is
 * built in), or 'off' for the geometry's own colors. Packs set their theme
 * through `withConfigDefaults()`.
 */
export const GEOMETRY_THEME_CONFIG: ConfigSchema<string> = {
  key: 'geometry.themeName', default: 'off',
};

/** Subdetectors removed before the build: a cut list name from `withRootGeometryRules()`, or 'off'. */
export const GEOMETRY_CUT_LIST_CONFIG: ConfigSchema<string> = {
  key: 'geometry.cutListName', default: 'off',
};

/** ROOT geometry tree cleanup: an edit rule set name from `withRootGeometryRules()`, or 'off'. */
export const GEOMETRY_ROOT_FILTER_CONFIG: ConfigSchema<string> = {
  key: 'geometry.rootFilterName', default: 'off',
};

/** Fast opaque materials for weak GPUs. */
export const GEOMETRY_FAST_MATERIAL_CONFIG: ConfigSchema<boolean> = {
  key: 'geometry.FastDefaultMaterial', default: false,
};

// ---------------------------------------------------------------------------
// Backend and controls (config page)
// ---------------------------------------------------------------------------

/**
 * Use the backend at `server.url` for server-side files (`local://`, plain
 * paths) and server conversion. Ignored when pyrobird serves the page: the
 * serving backend is used then.
 */
export const BACKEND_USE_API_CONFIG: ConfigSchema<boolean> = {
  key: 'server.useApi', default: false,
};

/** Base URL of the backend that `server.useApi` selects. */
export const BACKEND_URL_CONFIG: ConfigSchema<string> = {
  key: 'server.url', default: 'http://localhost:5454', validator: isPersistableUrl,
};

/** Navigate the camera with a game controller. */
export const USE_CONTROLLER_CONFIG: ConfigSchema<boolean> = {
  key: 'controls.useController', default: false,
};

// ---------------------------------------------------------------------------
// Geometry clipping of the main view (the toolbar's clipping panel)
// ---------------------------------------------------------------------------

/** Wedge (angular) clipping on or off. */
export const CLIPPING_ENABLED_CONFIG: ConfigSchema<boolean> = {
  key: 'clippingEnabled', default: true,
};

/** Wedge start angle [degrees]. */
export const CLIPPING_START_ANGLE_CONFIG: ConfigSchema<number> = {
  key: 'clippingStartAngle', default: 0,
};

/** Wedge opening angle [degrees]. */
export const CLIPPING_OPENING_ANGLE_CONFIG: ConfigSchema<number> = {
  key: 'clippingOpeningAngle', default: 180,
};

/** Z-plane clipping on or off. */
export const Z_CLIPPING_ENABLED_CONFIG: ConfigSchema<boolean> = {
  key: 'zClippingEnabled', default: false,
};

/** Z position of the clipping plane [mm]. */
export const Z_CLIPPING_POSITION_CONFIG: ConfigSchema<number> = {
  key: 'zClippingPosition', default: 0,
};

/** True keeps z >= position, false keeps z <= position. */
export const Z_CLIPPING_FORWARD_CONFIG: ConfigSchema<boolean> = {
  key: 'zClippingForward', default: true,
};
