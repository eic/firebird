/**
 * The `with*()` feature functions: the composition API through which an
 * application (Firebird's own or an external experiment's) assembles its
 * event display. `provideFirebird()` (provide-firebird.ts) installs them.
 *
 * API shape: one contribution per `with*()` call. Plurality comes from
 * composition: `provideFirebird(...)` is variadic, and `firebirdFeatures(...)`
 * and `firebirdPack(id, ...)` bundle features (experiment packs).
 *
 * The composition mechanism (feature type and identity, multi-provider
 * plumbing, config layering, command bus, URL startup, server config
 * loading) comes from `@dexvis/app-features`; this file adds Firebird's own
 * extension points and its URL shorthand grammar. The registry precedence
 * rule is documented in tokens.ts.
 */

import { Type } from '@angular/core';
import {
  AppFeature,
  AppFeatureInput,
  appFeaturePack,
  appFeatures,
  contributeClass,
  contributeValue,
  withConfigDefaults,
  withUrlShorthand,
} from '@dexvis/app-features';
import type {
  PiecePainterConstructor,
  EventPieceFactory,
  GeometryDataLoader,
  EventDataLoader,
  DataCatalog,
} from '@dexvis/firebird-core';
import {
  APP_VERSION,
  CAMERA_LIMITS,
  CAMERA_PRESETS,
  COLLISION_INTRO,
  CameraLimits,
  CameraPreset,
  CollisionIntroLoader,
  DATA_CATALOGS,
  DATA_SELECTOR_TABS,
  DataSelectorTabRegistration,
  EVENT_LOADERS,
  EVENT_PIECE_FACTORIES,
  FIREBIRD_WORKERS,
  FirebirdWorkers,
  GEOMETRY_LOADERS,
  GEOMETRY_POST_PROCESSORS,
  GEOMETRY_THEMES,
  LAZY_THREE_EXTENSIONS,
  PAINTERS,
  ROOT_GEOMETRY_RULES,
  THREE_EXTENSIONS,
  TOOLBAR_ACTIONS,
  ToolbarActionRegistration,
} from './tokens';
import type { LazyThreeExtensionLoader, ThreeExtension } from './three-extension';
import type {
  GeometryPostProcessorRegistration,
  GeometryThemeRegistration,
  RootGeometryRulesSource,
} from './geometry-pipeline';

/**
 * A Firebird feature: the providers contributed by one `with*()` call, or a
 * composition of features. The same type as `AppFeature` from
 * `@dexvis/app-features`, so features from both compose freely.
 */
export type FirebirdFeature = AppFeature;

/**
 * Composes features into one feature. Falsy entries are skipped so packs can
 * include conditional features. The same function as `appFeatures()` from
 * `@dexvis/app-features`.
 */
export const firebirdFeatures: (...features: AppFeatureInput[]) => FirebirdFeature = appFeatures;

/**
 * Composes features into a pack with an id: the mechanism behind experiment
 * packs. The id makes the pack replaceable and removable
 * (`withoutFeatures(id)`), a pack installed twice is installed once, and
 * development builds name the pack in collision warnings.
 *
 * ```ts
 * export function withMyExperiment(): FirebirdFeature {
 *   return firebirdPack('my-experiment', withEventPiece(MyFactory), withDefaultGeometry(url));
 * }
 * ```
 *
 * The same function as `appFeaturePack()` from `@dexvis/app-features`.
 */
export const firebirdPack: (id: string, ...features: AppFeatureInput[]) => FirebirdFeature = appFeaturePack;

/** Registers an event piece factory (DEX type decoder). The later factory for a type wins. */
export function withEventPiece(factory: Type<EventPieceFactory>): FirebirdFeature {
  return contributeClass(EVENT_PIECE_FACTORIES, factory, { kind: 'event-piece' });
}

/**
 * Registers a painter for a piece type. The type comes from
 * `opts.forPieceType`, or from the painter's static `meta.forPieceTypes`.
 * The first painter registered for a type is its default.
 */
export function withPainter(
  painterClass: PiecePainterConstructor,
  opts?: { forPieceType?: string },
): FirebirdFeature {
  const meta = (painterClass as unknown as { meta?: { forPieceTypes?: string[] } }).meta;
  const types = opts?.forPieceType ? [opts.forPieceType] : (meta?.forPieceTypes ?? []);
  if (types.length === 0) {
    throw new Error(`withPainter(${painterClass.name}): pass { forPieceType } or declare static meta.forPieceTypes`);
  }
  return firebirdFeatures(...types.map(forPieceType =>
    contributeValue(PAINTERS, { forPieceType, painterClass }, { kind: 'painter' })));
}

/**
 * Registers a painter through a dynamic import, keeping heavy painter code
 * (three.js materials etc.) out of the initial bundle. The class resolves
 * before the first event is painted; its place among the painters of the
 * type is its registration position, whenever its chunk arrives.
 */
export function withLazyPainter(
  forPieceType: string,
  load: () => Promise<PiecePainterConstructor>,
): FirebirdFeature {
  return contributeValue(PAINTERS, { forPieceType, load }, { kind: 'painter' });
}

/** Registers a rendering-machinery extension (instantiated through DI). */
export function withThreeExtension(extension: Type<ThreeExtension>): FirebirdFeature {
  return contributeClass(THREE_EXTENSIONS, extension, { kind: 'three-extension' });
}

/**
 * Registers a lazily-loaded extension. The dynamic import keeps it out of the
 * initial bundle; it is loaded and initialized after the scene is up.
 */
export function withLazyThreeExtension(load: LazyThreeExtensionLoader): FirebirdFeature {
  return contributeValue(LAZY_THREE_EXTENSIONS, load, { kind: 'three-extension' });
}

/** Registers a geometry format/scheme loader. A later loader with the same `meta.id` replaces it in place. */
export function withGeometryLoader(loader: Type<GeometryDataLoader>): FirebirdFeature {
  return contributeClass(GEOMETRY_LOADERS, loader, { kind: 'geometry-loader' });
}

/** Registers an event data format loader. A later loader with the same `meta.id` replaces it in place. */
export function withEventLoader(loader: Type<EventDataLoader>): FirebirdFeature {
  return contributeClass(EVENT_LOADERS, loader, { kind: 'event-loader' });
}

/**
 * Contributes datasets to the data selector: named presets (geometry + events),
 * tagged for the physics picker, and URL lists for manual pick. Several
 * contributions merge in registration order; the server's config.jsonc
 * `dataCatalog` and a remote `catalog.url` file add to them at runtime.
 *
 * ```ts
 * withDataCatalog({
 *   facets: [{ key: 'process', label: 'Process', values: { 'dis-nc': { label: 'DIS NC' } } }],
 *   entries: [{ name: 'DIS NC 10x100', geometry: 'exp://detector.root',
 *               events: 'https://host/nc_10x100.firebird.zip', tags: { process: 'dis-nc', beam: '10x100' } }],
 * })
 * ```
 */
export function withDataCatalog(catalog: DataCatalog): FirebirdFeature {
  return contributeValue(DATA_CATALOGS, catalog, { kind: 'data-catalog' });
}

/**
 * Adds a tab to the data selector control. The component must be a dynamic
 * import (tab UI pulls Material/forms code that must stay out of the initial
 * bundle); it reads and writes the shared `DataSelectionService.draft`.
 * Feature id `data-selector-tab:<id>`: a later tab with the same id replaces
 * this one, and `withoutFeatures('data-selector-tab:<id>')` drops it.
 *
 * ```ts
 * withDataSelectorTab({ id: 'campaigns', label: 'Campaigns', order: 15,
 *   load: () => import('./campaigns-tab.component').then(m => m.CampaignsTabComponent) })
 * ```
 */
export function withDataSelectorTab(tab: DataSelectorTabRegistration): FirebirdFeature {
  return contributeValue(DATA_SELECTOR_TABS, tab, { kind: 'data-selector-tab', id: `data-selector-tab:${tab.id}` });
}

/**
 * Sets the detector geometry the display loads when nothing else selects one.
 * Sugar for `withConfigDefaults({'geometry.selectedGeometry': url})`: the
 * same precedence applies, so server config, a saved user choice, and
 * `?geometry=` deep links all override it.
 */
export function withDefaultGeometry(url: string): FirebirdFeature {
  return withConfigDefaults({ 'geometry.selectedGeometry': url });
}

/**
 * Contributes pre-build TGeo rules: named edit rule sets (selected by
 * `geometry.rootFilterName`) and named cut lists (selected by
 * `geometry.cutListName`). The rules are data, posted to the geometry
 * worker with each load; pass a dynamic import to keep large rule data out
 * of the initial bundle. Contributions merge; a later rule set or cut list
 * with the same name replaces the earlier one.
 *
 * ```ts
 * withRootGeometryRules(() => import('./my-geometry-rules').then(m => m.myGeometryRules))
 * ```
 */
export function withRootGeometryRules(rules: RootGeometryRulesSource): FirebirdFeature {
  return contributeValue(ROOT_GEOMETRY_RULES, rules, { kind: 'root-geometry-rules' });
}

/**
 * Registers a geometry theme: subdetector rule sets (colors, merging,
 * outlines) applied after each load when config `geometry.themeName` is
 * `id`. Feature id `geometry-theme:<id>`.
 *
 * ```ts
 * withGeometryTheme({ id: 'my-colors', label: 'My colors',
 *   load: () => import('./my-theme').then(m => m.myRuleSets) })
 * ```
 */
export function withGeometryTheme(theme: GeometryThemeRegistration): FirebirdFeature {
  return contributeValue(GEOMETRY_THEMES, theme, { kind: 'geometry-theme', id: `geometry-theme:${theme.id}` });
}

/**
 * Registers main-thread code that runs after each geometry load, once the
 * geometry sits in the scene and before the first frame shows it.
 * Processors run in registration order, each after the ids in its `after`.
 * Feature id `geometry-post-processor:<id>`.
 *
 * ```ts
 * withGeometryPostProcessor({ id: 'my-mirrors', after: ['my-arranger'],
 *   load: () => import('./my-mirrors').then(m => m.MirrorProcessor) })
 * ```
 */
export function withGeometryPostProcessor(processor: GeometryPostProcessorRegistration): FirebirdFeature {
  return contributeValue(GEOMETRY_POST_PROCESSORS, processor,
    { kind: 'geometry-post-processor', id: `geometry-post-processor:${processor.id}` });
}

/**
 * Registers a named camera view for the `camera-preset` command
 * (`?cmd=camera-preset:<name>`), the navigation cube and the camera debug
 * panel. Feature id `camera-preset:<name>`: a later preset with the same name
 * replaces this one, so a pack pins `home` by registering it.
 *
 * ```ts
 * withCameraPreset({ name: 'endcap', position: [0, 2000, 9000], target: [0, 0, 3000] })
 * ```
 */
export function withCameraPreset(preset: CameraPreset): FirebirdFeature {
  return contributeValue(CAMERA_PRESETS, preset, { kind: 'camera-preset', id: `camera-preset:${preset.name}` });
}

/**
 * Pins the orbit distance limits [mm] of every view. Without this feature,
 * each geometry load derives them from the geometry's bounding sphere.
 * One setting per application (feature id `camera-limits`).
 */
export function withCameraLimits(limits: CameraLimits): FirebirdFeature {
  return { kind: 'camera-limits', id: 'camera-limits', providers: [{ provide: CAMERA_LIMITS, useValue: limits }] };
}

/**
 * Sets the collision intro: the animation played before an event's time
 * animation (the `animate-collision` command, offline recordings). A dynamic
 * import: intros pull three.js. Without it, events animate with no intro.
 * One per application (feature id `collision-intro`).
 *
 * ```ts
 * withCollisionIntro(() => import('./beams-intro').then(m => m.BeamsIntro))
 * ```
 */
export function withCollisionIntro(load: CollisionIntroLoader): FirebirdFeature {
  return { kind: 'collision-intro', id: 'collision-intro', providers: [{ provide: COLLISION_INTRO, useValue: load }] };
}

/**
 * Adds a button to the display's time toolbar that dispatches a command.
 * Feature id `toolbar-action:<id>`.
 *
 * ```ts
 * withToolbarAction({ id: 'collision', icon: 'close_fullscreen', label: 'Collision',
 *   tooltip: 'Animate with beam particles collision', command: { type: 'animate-collision' } })
 * ```
 */
export function withToolbarAction(action: ToolbarActionRegistration): FirebirdFeature {
  return contributeValue(TOOLBAR_ACTIONS, action, { kind: 'toolbar-action', id: `toolbar-action:${action.id}` });
}

/**
 * Starts Firebird's web workers from entry modules of the application, which
 * its bundler builds (feature id `workers`). Required for ROOT geometry and
 * for converting ROOT event files in the browser.
 *
 * ```ts
 * withWorkers({
 *   geometry: () => new Worker(new URL('./workers/geometry.worker', import.meta.url), { type: 'module' }),
 *   rootFile: () => new Worker(new URL('./workers/root-file.worker', import.meta.url), { type: 'module' }),
 * })
 * ```
 *
 * with `geometry.worker.ts` holding `runGeometryWorker(self)` (from
 * `@dexvis/firebird-ng/workers/geometry`) and `root-file.worker.ts` holding
 * `runRootFileWorker(self)` (from `@dexvis/firebird-ng/workers/root-file`).
 * The `new Worker(new URL(...))` expressions
 * must stay literal in application code: that is the pattern the Angular
 * build recognizes and bundles.
 */
export function withWorkers(workers: FirebirdWorkers): FirebirdFeature {
  return { kind: 'workers', id: 'workers', providers: [{ provide: FIREBIRD_WORKERS, useValue: workers }] };
}

/**
 * Sets the version the display chrome shows in its logo menu: the
 * application's own release, which the library cannot know. One per
 * application (feature id `app-version`).
 *
 * ```ts
 * import { version } from '../../package.json';
 * provideFirebird(withAppVersion(version))
 * ```
 */
export function withAppVersion(version: string): FirebirdFeature {
  return { kind: 'app-version', id: 'app-version', providers: [{ provide: APP_VERSION, useValue: version }] };
}

/**
 * Firebird's URL shorthand grammar: `?geometry=<url>`, `?dex=<url>` and
 * `?event=<N>` stand for `?cmd=open-geometry:<url>`, `?cmd=open-dex:<url>`
 * and `?cmd=show-event:<N>`, queued in this order before the generic `?cmd=`
 * list. The built-in command handlers build the commands. Part of the
 * built-ins (`withFirebirdBuiltins()`).
 */
export function withFirebirdUrlShorthands(): FirebirdFeature {
  return firebirdPack('firebird.url-shorthands',
    withUrlShorthand('geometry', 'open-geometry'),
    withUrlShorthand('dex', 'open-dex'),
    withUrlShorthand('event', 'show-event'),
  );
}
