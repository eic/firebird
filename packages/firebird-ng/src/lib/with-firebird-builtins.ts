/**
 * The built-in feature pack: Firebird's own piece factories, painters,
 * loaders, commands and UI parts, registered through the public extension
 * API - exactly how an experiment pack registers its own. If a built-in
 * cannot live on this surface, a user's feature cannot either.
 *
 * `provideFirebird()` installs `withFirebirdBuiltins()` before the
 * application's features. Each part is a named sub-feature with a feature
 * id, so an application drops a part with `withoutFeatures('<id>')`:
 *
 * | Sub-feature                     | Feature id                          |
 * |---------------------------------|-------------------------------------|
 * | `withServerConfig()` (generic)  | `server-config`                     |
 * | `withFirebirdUrlShorthands()`   | `firebird.url-shorthands`           |
 * | `withBoxHits()`                 | `firebird.box-hits`                 |
 * | `withTrajectories()`            | `firebird.trajectories`             |
 * | `withDexEvents()`               | `firebird.dex-events`               |
 * | `withRootEventsInBrowser()`     | `firebird.root-events-in-browser`   |
 * | `withServerConversion()`        | `firebird.server-conversion`        |
 * | `withRootGeometry()`            | `firebird.root-geometry`            |
 * | `withFirebirdCommands()`        | `firebird.commands`                 |
 * | `withStandardCameraPresets()`   | `firebird.camera-presets`           |
 * | `withNavigationCube()`          | `firebird.navigation-cube`          |
 * | `withDataSelectorTabs()`        | `firebird.data-selector-tabs`       |
 *
 * The whole pack is `firebird.builtins`, a pack of defaults
 * (`appFeatureDefaults()`): replacing one of its parts by id is the intended
 * customization and draws no collision warning.
 */

// The /model subpath on purpose: this file is in the INITIAL bundle, and the
// @dexvis/firebird-core root re-exports painters whose modules pull three.js.
// The model imports no three.js.
import {
  BoxHitPiece,
  BoxHitPieceFactory,
  PointTrajectoryPiece,
  PointTrajectoryPieceFactory,
} from '@dexvis/firebird-core/model';
import { appFeatureDefaults, withCommandHandler, withConfigDefaults, withServerConfig } from '@dexvis/app-features';
import {
  defaultFirebirdConfig,
  FirebirdFeature,
  firebirdPack,
  withCameraPreset,
  withDataSelectorTab,
  withEventLoader,
  withEventPiece,
  withFirebirdUrlShorthands,
  withGeometryLoader,
  withGeometryTheme,
  withLazyPainter,
  withLazyThreeExtension,
} from '@dexvis/firebird-ng/api';
import {
  DexEventLoader,
  Edm4eicEventLoader,
  Root2DexEventLoader,
  RootGeometryLoader,
} from './builtin-loaders';
import {
  AnimateCollisionCommandHandler,
  CameraPresetCommandHandler,
  OpenDexCommandHandler,
  OpenGeometryCommandHandler,
  SetConfigCommandHandler,
  ShowEventCommandHandler,
} from './builtin-command-handlers';

/** BoxHit pieces (tracker hits as boxes): DEX decoder and painter. */
export function withBoxHits(): FirebirdFeature {
  return firebirdPack('firebird.box-hits',
    withEventPiece(BoxHitPieceFactory),
    // Lazy: painter classes pull three.js material code, which must stay out
    // of the initial bundle (the display route chunk shares the same
    // modules, so nothing loads twice).
    withLazyPainter(BoxHitPiece.type, () => import('@dexvis/firebird-core').then(m => m.BoxHitSimplePainter)),
  );
}

/** PointTrajectory pieces (tracks, MC particles): DEX decoder and two painters. */
export function withTrajectories(): FirebirdFeature {
  return firebirdPack('firebird.trajectories',
    withEventPiece(PointTrajectoryPieceFactory),
    // The first painter is the default: the per-track painter. The batched
    // one (2 draw calls for the whole piece, for huge pieces like MCParticles
    // background frames) is the selectable alternative:
    // painters.byPiece.<name> = trajectory-lines-batched
    withLazyPainter(PointTrajectoryPiece.type, () => import('@dexvis/firebird-core').then(m => m.TrajectoryPainter)),
    withLazyPainter(PointTrajectoryPiece.type, () => import('@dexvis/firebird-core').then(m => m.BatchedTrajectoryPainter)),
  );
}

/** Firebird DEX event files (.firebird.json / .firebird.zip), by URL or picked file. */
export function withDexEvents(): FirebirdFeature {
  return firebirdPack('firebird.dex-events', withEventLoader(DexEventLoader));
}

/**
 * EDM4eic/EDM4hep ROOT event files converted in the browser (@dexvis/root2dex),
 * for what the browser can byte-range itself: http/asset URLs and picked files.
 */
export function withRootEventsInBrowser(): FirebirdFeature {
  return firebirdPack('firebird.root-events-in-browser', withEventLoader(Root2DexEventLoader));
}

/**
 * EDM4eic/EDM4hep ROOT event files converted by the pyrobird server: XRootD
 * `root://` URLs and paths the server serves.
 */
export function withServerConversion(): FirebirdFeature {
  return firebirdPack('firebird.server-conversion', withEventLoader(Edm4eicEventLoader));
}

/** ROOT TGeo detector geometry, and the experiment-neutral 'grey' theme. */
export function withRootGeometry(): FirebirdFeature {
  return firebirdPack('firebird.root-geometry',
    withGeometryLoader(RootGeometryLoader),
    withGeometryTheme({
      id: 'grey', label: 'Grey - mono colors',
      load: () => import('@dexvis/firebird-ng/display').then(m => m.monoColorRules),
    }),
  );
}

/** Firebird's command vocabulary (URL deep links, server startup, batch, toolbar actions). */
export function withFirebirdCommands(): FirebirdFeature {
  return firebirdPack('firebird.commands',
    withCommandHandler(OpenGeometryCommandHandler),
    withCommandHandler(OpenDexCommandHandler),
    withCommandHandler(ShowEventCommandHandler),
    withCommandHandler(SetConfigCommandHandler),
    withCommandHandler(CameraPresetCommandHandler),
    withCommandHandler(AnimateCollisionCommandHandler),
  );
}

/**
 * The face views and the home view of the HENP axis convention: beam along Z
 * (screen-right in the front view), Y up, X toward the accelerator center
 * (into the screen in the front view). Face views keep the current orbit
 * target and distance; `up` sets the screen roll, so the top and bottom
 * views keep Z pointing right. Home is the top view framing the loaded
 * geometry; a pack pins another home by registering a 'home' preset.
 */
export function withStandardCameraPresets(): FirebirdFeature {
  return firebirdPack('firebird.camera-presets',
    withCameraPreset({ name: 'front', direction: [-1, 0, 0], up: [0, 1, 0] }),
    withCameraPreset({ name: 'back', direction: [1, 0, 0], up: [0, 1, 0] }),
    withCameraPreset({ name: 'right', direction: [0, 0, 1], up: [0, 1, 0] }),
    withCameraPreset({ name: 'left', direction: [0, 0, -1], up: [0, 1, 0] }),
    withCameraPreset({ name: 'top', direction: [0, 1, 0], up: [1, 0, 0] }),
    withCameraPreset({ name: 'bottom', direction: [0, -1, 0], up: [-1, 0, 0] }),
    withCameraPreset({ name: 'home', direction: [0, 1, 0], up: [1, 0, 0], fitGeometry: true }),
  );
}

/**
 * The camera navigation cube. Lazy: it pulls three.js code through
 * @dexvis/viewport-gizmo, which must stay out of the initial bundle.
 */
export function withNavigationCube(): FirebirdFeature {
  return firebirdPack('firebird.navigation-cube',
    withLazyThreeExtension(() => import('@dexvis/firebird-ng/display').then(m => m.ViewportGizmoExtension)),
  );
}

/**
 * The data selector's tabs. Presets and Physics list catalog content and hide
 * themselves when no catalog is contributed; Manual (URL/file pick) always
 * shows. Lazy: tab UI must stay out of the initial bundle. Each tab has its
 * own feature id (`data-selector-tab:presets`, `:physics`, `:manual`).
 */
export function withDataSelectorTabs(): FirebirdFeature {
  return firebirdPack('firebird.data-selector-tabs',
    withDataSelectorTab({
      id: 'presets', label: 'Presets', order: 10,
      load: () => import('@dexvis/firebird-ng/display').then(m => m.PresetsTabComponent),
    }),
    withDataSelectorTab({
      id: 'physics', label: 'Physics', order: 20,
      load: () => import('@dexvis/firebird-ng/display').then(m => m.PhysicsTabComponent),
    }),
    withDataSelectorTab({
      id: 'manual', label: 'Manual', order: 30, needsCatalog: false,
      load: () => import('@dexvis/firebird-ng/display').then(m => m.ManualTabComponent),
    }),
  );
}

/**
 * Every built-in part; `provideFirebird()` installs it. A pack of defaults:
 * a pack that replaces a built-in part by id draws no collision warning.
 */
export function withFirebirdBuiltins(): FirebirdFeature {
  return appFeatureDefaults('firebird.builtins',
    // Firebird's server config shape, and the deep-link shorthands ?geometry=, ?dex=, ?event=
    withServerConfig({ defaults: defaultFirebirdConfig }),
    withFirebirdUrlShorthands(),

    // Event model and painters
    withBoxHits(),
    withTrajectories(),

    // IO. Event loader order matters: the in-browser ROOT converter is asked
    // before the server-conversion loader and claims only what the browser
    // can byte-range itself, so XRootD `root://` sources and pyrobird-served
    // paths fall through to the server.
    withDexEvents(),
    withRootEventsInBrowser(),
    withServerConversion(),
    withRootGeometry(),

    withFirebirdCommands(),
    withStandardCameraPresets(),
    withNavigationCube(),
    withDataSelectorTabs(),

    // MCParticles straight lines convert by default but start hidden: every
    // particle of the event is a lot of lines, so the user opts in per piece
    // through the model tree eye (normal config precedence: a deep link or a
    // saved user toggle overrides this default).
    withConfigDefaults({
      'painters.byPiece.MCParticles.visible': false,
    }),
  );
}
