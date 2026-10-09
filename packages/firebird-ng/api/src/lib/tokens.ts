/**
 * The DI tokens of the Firebird extension system.
 *
 * Every extensible surface follows one pattern: contributions are declared in
 * DI as multi-providers (via the `with*()` features in firebird-features.ts),
 * collected by core services, and called through narrow lifecycle interfaces.
 * Nothing registers itself via import side effects.
 *
 * Built-ins are first consumers: Firebird's own factories, painters, loaders
 * and command handlers ride these same tokens (see with-firebird-builtins.ts).
 *
 * Precedence, the same for every registry: contributions keep registration
 * order (the order of the `provideFirebird()` arguments, depth first, after
 * Firebird's built-ins). A later contribution with the id of an earlier one
 * replaces it at the earlier one's position. Where one entry is picked among
 * several, the earliest wins: the first loader that claims a source loads
 * it, the first painter registered for a piece type is its default. The ids:
 * feature ids, `DataLoaderMeta.id`, `CommandHandler.type`,
 * `EventPieceFactory.type`, `PainterMeta.id`, and the `id` or `name` of tabs,
 * themes, post-processors, camera presets and toolbar actions. To take over
 * a built-in, register under its id or remove it with `withoutFeatures()`.
 *
 * The generic tokens (COMMAND_HANDLERS, CONFIG_DEFAULTS, URL_ALIASES,
 * URL_SHORTHANDS) come from `@dexvis/app-features`; `@dexvis/firebird-ng`
 * re-exports them.
 *
 * Token descriptions exist in development builds only (the Angular idiom):
 * this file is in the initial bundle, and production builds define
 * `ngDevMode` as false and drop the strings.
 */

import { InjectionToken, Type, inject } from '@angular/core';
import { type AppCommand, resolveRegistry } from '@dexvis/app-features';
import type {
  EventPieceFactory,
  PiecePainterConstructor,
  GeometryDataLoader,
  EventDataLoader,
  DataCatalog,
} from '@dexvis/firebird-core';
import type { Object3D } from 'three';
import type { ThreeExtension, LazyThreeExtensionLoader } from './three-extension';
import type {
  GeometryPostProcessorRegistration,
  GeometryThemeRegistration,
  RootGeometryRulesSource,
} from './geometry-pipeline';

/**
 * One painter registration: which piece type it paints and with what class.
 * Either `painterClass` (eager) or `load` (lazy — keeps heavy painter code
 * out of the initial bundle; resolved before the first event is painted).
 */
export interface PainterRegistration {
  forPieceType: string;
  painterClass?: PiecePainterConstructor;
  load?: () => Promise<PiecePainterConstructor>;
}

/**
 * One tab of the data selector (the "open data" control shown in the display
 * toolbar panel and on the config page). The component loads lazily so tab UI
 * code (Material, forms) stays out of the initial bundle. Tabs sort by
 * `order`, then registration order.
 */
export interface DataSelectorTabRegistration {
  /** Stable id, e.g. 'presets', 'physics', 'manual'. A later tab with the same id replaces this one. */
  id: string;
  /** Tab caption. */
  label: string;
  /** Sort key; built-ins use 10, 20, 30. */
  order?: number;
  /** Resolves the tab component. It reads and writes `DataSelectionService.draft`. */
  load: () => Promise<Type<unknown>>;
  /**
   * When false, the tab is offered even with an empty catalog. Default true:
   * a tab that only lists catalog content hides itself when there is none.
   */
  needsCatalog?: boolean;
}

/** Event piece factories (DEX type string -> model object decoder). */
export const EVENT_PIECE_FACTORIES = new InjectionToken<EventPieceFactory[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.event-piece-factories' : '');

/** Painter registrations consumed by EventDisplayService's DataModelPainter. */
export const PAINTERS = new InjectionToken<PainterRegistration[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.painters' : '');

/** Rendering-machinery extensions, instantiated eagerly through DI. */
export const THREE_EXTENSIONS = new InjectionToken<ThreeExtension[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.three-extensions' : '');

/** Lazily-loaded extensions: resolved after init, off the critical path. */
export const LAZY_THREE_EXTENSIONS = new InjectionToken<LazyThreeExtensionLoader[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.lazy-three-extensions' : '');

/** Geometry format/scheme loaders. Read them through `injectGeometryLoaders()`. */
export const GEOMETRY_LOADERS = new InjectionToken<GeometryDataLoader[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.geometry-loaders' : '');

/** Event data format loaders. Read them through `injectEventLoaders()`. */
export const EVENT_LOADERS = new InjectionToken<EventDataLoader[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.event-loaders' : '');

/** Data catalogs: datasets an installation offers (presets, tags, URL lists). Merged in order. */
export const DATA_CATALOGS = new InjectionToken<DataCatalog[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.data-catalogs' : '');

/** Tabs of the data selector control. */
export const DATA_SELECTOR_TABS = new InjectionToken<DataSelectorTabRegistration[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.data-selector-tabs' : '');

/** Pre-build TGeo rules, posted to the geometry worker with each load (see geometry-pipeline.ts). */
export const ROOT_GEOMETRY_RULES = new InjectionToken<RootGeometryRulesSource[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.root-geometry-rules' : '');

/** Geometry themes, selected by config `geometry.themeName`. */
export const GEOMETRY_THEMES = new InjectionToken<GeometryThemeRegistration[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.geometry-themes' : '');

/** Main-thread geometry post-processors, run after each geometry load. */
export const GEOMETRY_POST_PROCESSORS = new InjectionToken<GeometryPostProcessorRegistration[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.geometry-post-processors' : '');

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/** An [x, y, z] triple in world coordinates (mm). */
export type Vec3Tuple = [number, number, number];

/**
 * A named camera view for the `camera-preset` command, the navigation
 * cube's home button and the camera debug panel. Two shapes:
 *
 * - a fixed pose: `position`, `target` and optionally `up`;
 * - a view direction: the camera looks along `-direction` with `up` as the
 *   screen up. It keeps the current orbit target and distance, unless
 *   `fitGeometry` is set: then it centers the loaded geometry's bounding
 *   sphere and backs off until the sphere fits the view.
 */
export type CameraPreset =
  | { name: string; label?: string; position: Vec3Tuple; target: Vec3Tuple; up?: Vec3Tuple }
  | { name: string; label?: string; direction: Vec3Tuple; up: Vec3Tuple; fitGeometry?: boolean };

/** Camera presets. A later preset with the same name replaces the earlier one. */
export const CAMERA_PRESETS = new InjectionToken<CameraPreset[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.camera-presets' : '');

/** The registered camera presets, after the registry rule (same name: later replaces in place). */
export function injectCameraPresets(): CameraPreset[] {
  return resolveRegistry(inject(CAMERA_PRESETS, { optional: true }) ?? [], preset => preset.name);
}

/**
 * Orbit distance limits [mm] of every view. Without them, each geometry load
 * derives them from the geometry's bounding sphere (radius r): 0.05 r to 5 r.
 */
export interface CameraLimits {
  minDistance: number;
  maxDistance: number;
}

/** Pinned camera limits (`withCameraLimits`); absent means derived from the geometry. */
export const CAMERA_LIMITS = new InjectionToken<CameraLimits>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.camera-limits' : '');

// ---------------------------------------------------------------------------
// Collision intro
// ---------------------------------------------------------------------------

/**
 * A short animation played before an event's time animation, typically the
 * beams flying in and colliding. One instance per playback. The display
 * drives it: live from the render loop, frame by frame in offline
 * recordings, so `update()` must depend on `elapsedMs` alone.
 */
export interface CollisionIntro {
  /** Length of the intro [ms]. */
  readonly durationMs: number;
  /** Builds the intro objects under `parent`, part of the event data (never clipped). */
  begin(parent: Object3D): void;
  /** Shows the state `elapsedMs` after the start, 0 to `durationMs`. */
  update(elapsedMs: number): void;
  /** Removes and disposes everything `begin()` built. */
  end(): void;
}

/** Resolves the intro class through a dynamic import (intros pull three.js). */
export type CollisionIntroLoader = () => Promise<new () => CollisionIntro>;

/** The collision intro (`withCollisionIntro`); absent means none. */
export const COLLISION_INTRO = new InjectionToken<CollisionIntroLoader>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.collision-intro' : '');

// ---------------------------------------------------------------------------
// UI contributions
// ---------------------------------------------------------------------------

/**
 * A button in the display's time toolbar (the playback controls under the
 * scene), placed after the rewind button. A click dispatches `command`
 * through the command bus with source 'ui', so the same action is
 * reachable from deep links and batch.
 */
export interface ToolbarActionRegistration {
  /** Identity: a later action with the same id replaces this one. */
  id: string;
  /** Material Symbols icon name. */
  icon: string;
  /** Accessible name of the button. */
  label: string;
  tooltip?: string;
  command: AppCommand;
}

/** Toolbar actions, in registration order. */
export const TOOLBAR_ACTIONS = new InjectionToken<ToolbarActionRegistration[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.toolbar-actions' : '');

/** The registered toolbar actions, after the registry rule (same id: later replaces in place). */
export function injectToolbarActions(): ToolbarActionRegistration[] {
  return resolveRegistry(inject(TOOLBAR_ACTIONS, { optional: true }) ?? [], action => action.id);
}

// ---------------------------------------------------------------------------
// Web workers
// ---------------------------------------------------------------------------

/**
 * Starts the application's web workers. Each factory creates a worker from
 * an entry module the application owns, so that its bundler builds the
 * worker: a `new Worker(new URL(...))` inside a prebuilt library is not
 * bundled and fails with a 404 at runtime. The entry modules call the run
 * functions of `@dexvis/firebird-ng/workers/geometry` and
 * `@dexvis/firebird-ng/workers/root-file`.
 */
export interface FirebirdWorkers {
  /** The ROOT geometry worker (entry: `runGeometryWorker(self)`). */
  geometry: () => Worker;
  /** The ROOT file worker: probing and in-browser conversion (entry: `runRootFileWorker(self)`). */
  rootFile: () => Worker;
}

/** The worker factories (`withWorkers`); without them ROOT geometry and in-browser conversion fail with a message naming the feature. */
export const FIREBIRD_WORKERS = new InjectionToken<FirebirdWorkers>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.workers' : '');

/**
 * The application's version, shown in the logo menu of the display chrome
 * (`withAppVersion`); absent means the menu shows none.
 */
export const APP_VERSION = new InjectionToken<string>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.app-version' : '');

// ---------------------------------------------------------------------------
// Registry access with the precedence rule applied
// ---------------------------------------------------------------------------

/**
 * The registered event loaders, in the order they are asked: registration
 * order, a later loader with the same `meta.id` replacing an earlier one in
 * place. The first loader whose `canLoad()` accepts a source loads it.
 */
export function injectEventLoaders(): EventDataLoader[] {
  return resolveRegistry(inject(EVENT_LOADERS, { optional: true }) ?? [], loader => loader.meta.id);
}

/** The registered geometry loaders; same rule as `injectEventLoaders()`. */
export function injectGeometryLoaders(): GeometryDataLoader[] {
  return resolveRegistry(inject(GEOMETRY_LOADERS, { optional: true }) ?? [], loader => loader.meta.id);
}
