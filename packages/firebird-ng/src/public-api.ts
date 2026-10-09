/**
 * Public API of `@dexvis/firebird-ng`: `provideFirebird()`, Firebird's
 * built-ins as named sub-features, and every extension contract (re-exported
 * from `@dexvis/firebird-ng/api`). Extension packs import from here, from
 * `@dexvis/firebird-core`, and from two subpaths:
 *
 * - `@dexvis/firebird-ng/display`: the display pages, `<firebird-display>`
 *   and the display services. Load it lazily (routes, `import()`): it pulls
 *   three.js and Angular Material.
 * - `@dexvis/firebird-ng/geometry-palette`: named colors for geometry themes.
 *
 * This entry is part of the initial bundle: everything it exports stays
 * light, and it reaches the display entry through dynamic imports only.
 */

export * from '@dexvis/firebird-ng/api';
export * from './lib/provide-firebird';
export { firebirdRoutes } from './lib/firebird-routes';
// The built-ins as named sub-features (feature ids in with-firebird-builtins.ts)
export {
  withFirebirdBuiltins,
  withBoxHits,
  withTrajectories,
  withDexEvents,
  withRootEventsInBrowser,
  withServerConversion,
  withRootGeometry,
  withFirebirdCommands,
  withStandardCameraPresets,
  withNavigationCube,
  withDataSelectorTabs,
} from './lib/with-firebird-builtins';
export { DexEventLoader, Edm4eicEventLoader, Root2DexEventLoader, RootGeometryLoader } from './lib/builtin-loaders';
export {
  OpenDexCommandHandler,
  OpenGeometryCommandHandler,
  ShowEventCommandHandler,
  SetConfigCommandHandler,
  CameraPresetCommandHandler,
  AnimateCollisionCommandHandler,
} from './lib/builtin-command-handlers';
